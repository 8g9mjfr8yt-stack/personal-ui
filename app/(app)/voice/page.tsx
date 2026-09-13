"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GoogleGenAI, Modality } from "@google/genai";
import { createClient } from "@/lib/supabase/client";
import {
  TASK_TOOLS,
  TASK_TOOLS_SYSTEM_INSTRUCTION,
  runTaskTool,
} from "@/lib/gemini/taskTools";
import {
  MEMORY_TOOLS,
  MEMORY_SYSTEM_INSTRUCTION,
  MEMORY_TOOL_NAMES,
  runMemoryTool,
} from "@/lib/gemini/memoryTools";

// Musí byť presne rovnaký model ako v app/api/gemini-token/route.ts.
const MODEL = "gemini-3.1-flash-live-preview";

type Status = "idle" | "connecting" | "live" | "reconnecting" | "error";

// Poznámka k tejto verzii (Fáza 4.1 + 4.3 + 4.4):
// Prehliadač sa pripája PRIAMO na Gemini Live (cez krátkodobý token z
// /api/gemini-token), posiela zvuk z mikrofónu a prehráva odpoveď. Agent má
// nástroje (function calling) na prácu s úlohami — get_tasks, create_task,
// update_task, complete_task, delete_task — ktoré sa vykonávajú ako priame
// Supabase volania z prehliadača (fast path, žiadny n8n v hot path, pozri
// PROJECT.md časť 23). Live API po ~10 minútach zatvorí WebSocket spojenie
// — session sa v tom prípade automaticky obnoví (session resumption) tým
// istým ephemeral tokenom, takže rozhovor a jeho kontext pokračujú ďalej
// bez toho, aby si si to všimol. Zatiaľ bez jemného rozlišovania prerušení
// (krok 4.2, zámerne preskočené) a bez trvalej pamäte naprieč jednotlivými
// rozhovormi (krok 4.5). Model má vlastnú vstavanú detekciu konca vety
// (VAD), takže netreba tlačidlo "hovor teraz" — stačí spustiť rozhovor a
// rozprávať.
export default function VoicePage() {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sessionRef = useRef<any>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const cancelledCallIdsRef = useRef<Set<string>>(new Set());
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

  // Ukončiť rozhovor aj pri opustení stránky.
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
    // Jednoduché prerušenie pri "interrupted" od servera: ďalší zvuk sa
    // naplánuje odteraz namiesto pripojenia na koniec fronty. Detailnejšie
    // prerušenie (napr. okamžité stíšenie rozbehnutého segmentu) doladíme
    // v kroku 4.2.
    if (outputCtxRef.current) {
      nextPlayTimeRef.current = outputCtxRef.current.currentTime;
    }
  }

  async function handleFunctionCalls(functionCalls: any[]) {
    console.log("[voice] agent volá nástroje:", functionCalls);
    const supabase = supabaseRef.current;
    if (!supabase) return;

    const responses = await Promise.all(
      functionCalls.map(async (fc: any) => {
        const isMemoryTool = MEMORY_TOOL_NAMES.includes(fc.name);
        const { result, error } = isMemoryTool
          ? await runMemoryTool(supabase, fc.name, fc.args || {})
          : await runTaskTool(supabase, fc.name, fc.args || {});
        console.log(`[voice] výsledok ${fc.name}:`, error ? { error } : { result });
        return {
          id: fc.id,
          name: fc.name,
          response: error ? { error } : { result },
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

  // Otvorí (alebo po výpadku znova otvorí) Gemini Live session. Pri
  // reconnecte posiela uložený resumption handle, takže Gemini pokračuje
  // v tom istom rozhovore — používa sa ten istý ephemeral token ako pri
  // prvom pripojení (reconnecty v rámci jeho expireTime nerátajú do
  // limitu "uses").
  async function openSession(isReconnect: boolean) {
    const ai = aiClientRef.current;
    if (!ai) return;

    const session = await ai.live.connect({
      model: MODEL,
      config: {
        responseModalities: [Modality.AUDIO],
        // Fáza 4.5 — spojené nástroje na úlohy aj na trvalú pamäť; musí byť
        // identické s tým, čo je zamknuté v /api/gemini-token route.ts.
        tools: [...TASK_TOOLS, ...MEMORY_TOOLS],
        systemInstruction: {
          parts: [
            {
              text:
                TASK_TOOLS_SYSTEM_INSTRUCTION + "\n\n" + MEMORY_SYSTEM_INSTRUCTION,
            },
          ],
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
                playAudioChunk(part.inlineData.data);
              }
            }
          }

          const toolCall = message?.toolCall;
          if (toolCall?.functionCalls?.length) {
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

    try {
      const tokenRes = await fetch("/api/gemini-token", { method: "POST" });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}) as any);
        throw new Error(body.error || "Nepodarilo sa získať token zo servera");
      }
      const { token } = (await tokenRes.json()) as { token: string };

      aiClientRef.current = new GoogleGenAI({ apiKey: token });

      outputCtxRef.current = new AudioContext({ sampleRate: 24000 });
      nextPlayTimeRef.current = 0;

      await openSession(false);

      // Mikrofón
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const inputCtx = new AudioContext();
      inputCtxRef.current = inputCtx;
      const sourceNode = inputCtx.createMediaStreamSource(stream);

      // ScriptProcessorNode je zastaraný, ale pre prvú funkčnú verziu je
      // najjednoduchší (bez samostatného AudioWorklet súboru). Dá sa
      // neskôr nahradiť.
      const bufferSize = 4096;
      const processor = inputCtx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      const inputRate = inputCtx.sampleRate;
      const targetRate = 16000;

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
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

  const isBusy = status === "live" || status === "connecting" || status === "reconnecting";

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Hlas</h1>
      <p className="mb-6 text-neutral-500">
        Realtime hlasový rozhovor s agentom cez Gemini Live. Agent teraz
        vie počas rozhovoru čítať, vytvárať, upravovať, dokončovať aj
        mazať tvoje úlohy priamo v databáze.
      </p>

      <button
        onClick={isBusy ? stopConversation : startConversation}
        disabled={status === "connecting"}
        className="rounded-lg bg-neutral-900 px-5 py-2.5 text-white disabled:opacity-50"
      >
        {status === "live" || status === "reconnecting"
          ? "Ukončiť rozhovor"
          : status === "connecting"
          ? "Pripájam sa…"
          : "Spustiť rozhovor"}
      </button>

      <p className="mt-4 text-sm text-neutral-500">Stav: {statusLabel(status)}</p>

      {errorMsg && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}
    </div>
  );
}

function statusLabel(status: Status) {
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
