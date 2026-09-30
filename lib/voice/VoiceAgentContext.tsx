"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { createClient } from "@/lib/supabase/client";
import { ALL_TOOLS, buildSystemInstruction } from "@/lib/gemini/allTools";
import { findToolRunner } from "@/lib/voice/toolRunners";
import { nowInfo, DEFAULT_TIME_ZONE } from "@/lib/timeContext";
import { recordPerf } from "@/lib/perf";

// Musí byť presne rovnaký model ako v app/api/gemini-token/route.ts.
const MODEL = "gemini-3.1-flash-live-preview";

export type VoiceStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";

type VoiceAgentContextValue = {
  status: VoiceStatus;
  errorMsg: string | null;
  isBusy: boolean;
  start: () => void;
  stop: () => void;
};

const VoiceAgentContext = createContext<VoiceAgentContextValue | null>(null);

// Poznámka (Fáza 4.1 + 4.3 + 4.4, presunuté sem pri rozšírení na globálne
// plávajúce tlačidlo, 2026-09-17): tento provider drží JEDINÚ Gemini Live
// session pre celú appku. Mountuje sa raz v app/(app)/layout.tsx, takže
// session prežije prechod medzi stránkami (Next.js layout sa pri
// client-side navigácii neremountuje) — rozhovor spustený na Tasks
// pokračuje aj po prekliknutí na Projects. Stránka /voice aj plávajúce
// tlačidlo (components/VoiceWidget.tsx) čítajú a ovládajú ten istý stav
// cez useVoiceAgent() nižšie, namiesto toho, aby si každý držal vlastnú
// kópiu (čo by mohlo viesť k dvom súbežným Gemini Live spojeniam).
//
// Prehliadač sa pripája PRIAMO na Gemini Live (cez krátkodobý token z
// /api/gemini-token), posiela zvuk z mikrofónu a prehráva odpoveď. Agent má
// nástroje (function calling) na prácu s úlohami, projektmi, pamäťou atď.,
// ktoré sa vykonávajú ako priame Supabase volania z prehliadača (fast
// path, žiadny n8n v hot path, pozri PROJECT.md časť 23). Live API po
// ~10 minútach zatvorí WebSocket spojenie — session sa v tom prípade
// automaticky obnoví (session resumption) tým istým ephemeral tokenom,
// takže rozhovor a jeho kontext pokračujú ďalej bez toho, aby si si to
// všimol.
export function VoiceAgentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const cancelledCallIdsRef = useRef<Set<string>>(new Set());
  // Ochrana proti duplicitnému vykonaniu tool-callov (2026-09-18,
  // pozri PROJECT.md časť 27/28) — každé fc.id sa smie reálne
  // vykonať iba raz za celú session.
  const processedCallIdsRef = useRef<Set<string>>(new Set());
  const aiClientRef = useRef<GoogleGenAI | null>(null);
  const resumptionHandleRef = useRef<string | undefined>(undefined);
  const manualStopRef = useRef(false);

  if (!supabaseRef.current) {
    supabaseRef.current = createClient();
  }

  const stopConversation = useCallback(() => {
    manualStopRef.current = true;

    processorRef.current?.disconnect();
    processorRef.current = null;

    inputCtxRef.current?.close().catch(() => {});
    inputCtxRef.current = null;

    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;

    try {
      sessionRef.current?.close?.();
    } catch {
      // ignorovať — session už mohla byť zatvorená serverom
    }
    sessionRef.current = null;

    outputCtxRef.current?.close().catch(() => {});
    outputCtxRef.current = null;
    nextPlayTimeRef.current = 0;

    aiClientRef.current = null;
    resumptionHandleRef.current = undefined;

    setStatus((s) => (s === "error" ? s : "idle"));
  }, []);

  // Ukončiť rozhovor, keď sa celá appka odmountuje (napr. odhlásenie).
  useEffect(() => {
    return () => {
      stopConversation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function playAudioChunk(base64: string) {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768;

    // Odpoveď od Gemini Live je vždy 24kHz, mono, PCM16.
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;
  }

  function clearPlaybackQueue() {
    if (outputCtxRef.current) {
      nextPlayTimeRef.current = outputCtxRef.current.currentTime;
    }
  }

  // Krok 1a — text s aktuálnym časom a pásmo, ktoré vrátil server spolu s
  // tokenom (musí byť identické so serverovou systemInstruction).
  const timeContextRef = useRef<string>("");
  const timeZoneRef = useRef<string>(DEFAULT_TIME_ZONE);
  // Fáza 0 — merania: kedy naposledy mikrofón zachytil reč a či agent
  // práve začal novú odpoveď (odozva = koniec reči → prvý zvuk agenta).
  const lastSpeechAtRef = useRef<number>(0);
  const agentTurnActiveRef = useRef<boolean>(false);
  // či agent v aktuálnom ťahu volal nástroj (odozva sa meria zvlášť)
  const toolInTurnRef = useRef<boolean>(false);

  async function handleFunctionCalls(functionCalls: any[]) {
    // Ak Gemini Live doručí ten istý tool-call opakovane (napr. po
    // reconnecte/session resumption, kým ešte nedostal potvrdenie na
    // predchádzajúci pokus), nesmieme ho vykonať znova — pri akciách ako
    // create_calendar_event/create_task by to vytvorilo duplicitné
    // záznamy (reálny bug nájdený 2026-09-18, pozri PROJECT.md časť 28).
    const freshCalls = functionCalls.filter((fc: any) => {
      if (!fc.id) return true;
      if (processedCallIdsRef.current.has(fc.id)) {
        console.log(
          `[voice] preskakujem duplicitný tool-call ${fc.name} (${fc.id})`
        );
        return false;
      }
      processedCallIdsRef.current.add(fc.id);
      return true;
    });
    if (!freshCalls.length) return;

    console.log("[voice] agent volá nástroje:", freshCalls);
    const supabase = supabaseRef.current;
    if (!supabase) return;

    const responses = await Promise.all(
      freshCalls.map(async (fc: any) => {
        const runner = findToolRunner(fc.name);
        const toolStart = performance.now();
        const { result, error } = runner
          ? await runner(supabase, fc.name, fc.args || {})
          : { error: `Neznámy nástroj: ${fc.name}` };
        recordPerf("nástroj", fc.name, performance.now() - toolStart);
        console.log(`[voice] výsledok ${fc.name}:`, error ? { error } : { result });
        return {
          id: fc.id,
          name: fc.name,
          // Krok 1a: aktuálny čas pri každej odpovedi nástroja, aby
          // relatívne výrazy sedeli aj v dlhom rozhovore.
          response: error
            ? { error, now: nowInfo(timeZoneRef.current).local }
            : { result, now: nowInfo(timeZoneRef.current).local },
        };
      })
    );

    // Ak server medzitým zrušil niektoré z týchto volaní (napr. používateľ
    // agenta prerušil), pre tie neposielame odpoveď.
    const stillLive = responses.filter(
      (r) => r.id && !cancelledCallIdsRef.current.has(r.id)
    );
    if (stillLive.length) {
      sessionRef.current?.sendToolResponse?.({ functionResponses: stillLive });
    }
  }

  // Otvorí (alebo po výpadku znova otvorí) Gemini Live session.
  async function openSession(isReconnect: boolean) {
    const ai = aiClientRef.current;
    if (!ai) return;

    const session = await ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        // Musí byť identické so zoznamom zamknutým v /api/gemini-token
        // route.ts (server-side liveConnectConstraints.config).
        // v2.2 — spoločný zoznam so serverom (lib/gemini/allTools.ts).
        tools: ALL_TOOLS,
        systemInstruction: {
          parts: [{ text: buildSystemInstruction(timeContextRef.current) }],
        },
        sessionResumption: resumptionHandleRef.current
          ? { handle: resumptionHandleRef.current }
          : {},
      },
      callbacks: {
        onopen: () => setStatus("live"),
        onmessage: (message: any) => {
          const content = message?.serverContent;
          if (content?.interrupted) {
            clearPlaybackQueue();
          }
          const parts = content?.modelTurn?.parts;
          if (parts) {
            for (const part of parts) {
              if (part.inlineData?.data) {
                if (!agentTurnActiveRef.current) {
                  agentTurnActiveRef.current = true;
                  if (lastSpeechAtRef.current > 0) {
                    recordPerf(
                      "hlas",
                      toolInTurnRef.current
                        ? "odozva s nástrojom (koniec reči → prvý zvuk)"
                        : "odozva bez nástroja (koniec reči → prvý zvuk)",
                      performance.now() - lastSpeechAtRef.current
                    );
                  }
                }
                playAudioChunk(part.inlineData.data);
              }
            }
          }
          if (content?.turnComplete || content?.interrupted) {
            agentTurnActiveRef.current = false;
            toolInTurnRef.current = false;
          }

          const toolCall = message?.toolCall;
          if (toolCall?.functionCalls?.length) {
            // prvé volanie nástroja v ťahu: koľko trvalo modelu rozhodnúť sa
            if (!toolInTurnRef.current && !agentTurnActiveRef.current && lastSpeechAtRef.current > 0) {
              recordPerf("hlas", "odozva: koniec reči → volanie nástroja", performance.now() - lastSpeechAtRef.current);
            }
            toolInTurnRef.current = true;
            handleFunctionCalls(toolCall.functionCalls);
          }

          const cancellation = message?.toolCallCancellation;
          if (cancellation?.ids?.length) {
            for (const id of cancellation.ids) {
              cancelledCallIdsRef.current.add(id);
            }
          }

          // Priebežne dostávame nový handle, ktorým sa dá session obnoviť
          // po výpadku spojenia bez straty kontextu rozhovoru.
          const resumption = message?.sessionResumptionUpdate;
          if (resumption?.resumable && resumption?.newHandle) {
            resumptionHandleRef.current = resumption.newHandle;
          }

          if (message?.goAway) {
            console.log(
              "[voice] Gemini čoskoro zatvorí spojenie, obnovím session:",
              message.goAway
            );
          }
        },
        onerror: (e: any) => {
          console.error("Gemini Live chyba:", e);
          setErrorMsg("Spojenie s Gemini Live zlyhalo. Skús to znova.");
          setStatus("error");
        },
        onclose: () => {
          // Ak sme session nezavreli sami (tlačidlom) a máme handle, na
          // ktorý sa dá napojiť, ide o technický výpadok (napr. ~10 min
          // limit spojenia) — ticho session obnovíme namiesto ukončenia
          // rozhovoru.
          if (!manualStopRef.current && resumptionHandleRef.current) {
            setStatus("reconnecting");
            openSession(true).catch((err) => {
              console.error("Obnovenie Gemini Live session zlyhalo:", err);
              setErrorMsg("Spojenie sa prerušilo a nepodarilo sa ho obnoviť.");
              setStatus("error");
            });
          } else {
            setStatus((s) => (s === "error" ? s : "idle"));
          }
        },
      },
    });

    sessionRef.current = session;
  }

  async function startConversation() {
    setErrorMsg(null);
    setStatus("connecting");
    manualStopRef.current = false;
    resumptionHandleRef.current = undefined;

    const perfStart = performance.now();
    lastSpeechAtRef.current = 0;
    agentTurnActiveRef.current = false;
    toolInTurnRef.current = false;

    // Mikrofón a zvukové kontexty sa spúšťajú HNEĎ (ešte v rámci kliknutia —
    // iOS to vyžaduje) a súbežne so získaním tokenu a pripojením ku Gemini.
    // Predtým išli tri kroky za sebou (merania: 760 + 1024 + 915 ms).
    let micReadyAt = 0;
    const micPromise = navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
      if (manualStopRef.current) {
        // rozhovor medzitým skončil (chyba/stop) — mikrofón hneď uvoľniť
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("Rozhovor bol ukončený.");
      }
      micStreamRef.current = stream;
      micReadyAt = performance.now();
      return stream;
    });
    micPromise.catch(() => {}); // chyba sa spracuje nižšie pri await
    outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
    nextPlayTimeRef.current = 0;
    const inputCtx = new AudioContext();
    inputCtxRef.current = inputCtx;

    try {
      const tokenRes = await fetch("/api/gemini-token", { method: "POST" });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}) as any);
        throw new Error(body.error || "Nepodarilo sa získať token zo servera");
      }
      const { token, timeContext, timeZone } = (await tokenRes.json()) as {
        token: string;
        timeContext?: string;
        timeZone?: string;
      };
      timeContextRef.current = timeContext || "";
      timeZoneRef.current = timeZone || DEFAULT_TIME_ZONE;
      const perfToken = performance.now();
      recordPerf("hlas", "štart: token", perfToken - perfStart);

      aiClientRef.current = new GoogleGenAI({ apiKey: token });

      await openSession(false);
      const perfSession = performance.now();
      recordPerf("hlas", "štart: spojenie s Gemini", perfSession - perfToken);

      // Mikrofón (spustený súbežne na začiatku)
      const stream = await micPromise;
      if (inputCtx.state === "suspended") await inputCtx.resume().catch(() => {});
      if (outputCtxRef.current?.state === "suspended") await outputCtxRef.current.resume().catch(() => {});
      const sourceNode = inputCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode je zastaraný, ale pre prvú funkčnú verziu je
      // najjednoduchší (bez samostatného AudioWorklet súboru).
      recordPerf("hlas", "štart: mikrofón (súbežne, od kliku)", micReadyAt - perfStart);
      recordPerf("hlas", "štart: spolu (klik → pripravené)", performance.now() - perfStart);

      const bufferSize = 4096;
      const processor = inputCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      const inputRate = inputCtx.sampleRate;
      const targetRate = 16000;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        // Fáza 0 — jednoduchá detekcia reči podľa hlasitosti (RMS), iba
        // na meranie odozvy; nijako neovplyvňuje, čo sa posiela Gemini.
        let sum = 0;
        for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
        if (Math.sqrt(sum / input.length) > 0.02) {
          lastSpeechAtRef.current = performance.now();
        }
        const resampled = resampleTo16k(input, inputRate, targetRate);
        const pcm16 = floatTo16BitPCM(resampled);
        const base64 = arrayBufferToBase64(pcm16.buffer);

        sessionRef.current?.sendRealtimeInput?.({
          audio: { data: base64, mimeType: "audio/pcm;rate=16000" },
        });
      };

      sourceNode.connect(processor);
      // ScriptProcessorNode musí byť pripojený na destination, aby vôbec
      // spracúval audio (kvirk Web Audio API) — hlasitosť dáme na 0, aby
      // sme nepočuli vlastný hlas ako echo.
      const silentGain = inputCtx.createGain();
      silentGain.gain.value = 0;
      processor.connect(silentGain);
      silentGain.connect(inputCtx.destination);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || "Niečo sa pokazilo pri spúšťaní rozhovoru.");
      setStatus("error");
      stopConversation();
    }
  }

  const isBusy =
    status === "live" || status === "connecting" || status === "reconnecting";

  const value: VoiceAgentContextValue = {
    status,
    errorMsg,
    isBusy,
    start: () => {
      startConversation();
    },
    stop: stopConversation,
  };

  return (
    <VoiceAgentContext.Provider value={value}>
      {children}
    </VoiceAgentContext.Provider>
  );
}

export function useVoiceAgent() {
  const ctx = useContext(VoiceAgentContext);
  if (!ctx) {
    throw new Error("useVoiceAgent musí byť volaný vnútri VoiceAgentProvider");
  }
  return ctx;
}

export function voiceStatusLabel(status: VoiceStatus) {
  switch (status) {
    case "idle":
      return "nečinný";
    case "connecting":
      return "pripájam sa…";
    case "live":
      return "rozhovor prebieha — hovor pokojne";
    case "reconnecting":
      return "spojenie sa krátko obnovuje…";
    case "error":
      return "chyba";
  }
}

function resampleTo16k(input: Float32Array, inputRate: number, targetRate: number) {
  if (inputRate === targetRate) return input;
  const ratio = inputRate / targetRate;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const i0 = Math.floor(srcIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcIndex - i0;
    result[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return result;
}

function floatTo16BitPCM(input: Float32Array) {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
