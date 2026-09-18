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
import {
  TASK_TOOLS,
  TASK_TOOLS_SYSTEM_INSTRUCTION,
  TASK_TOOL_NAMES,
  runTaskTool,
} from "@/lib/gemini/taskTools";
import {
  MEMORY_TOOLS,
  MEMORY_SYSTEM_INSTRUCTION,
  MEMORY_TOOL_NAMES,
  runMemoryTool,
} from "@/lib/gemini/memoryTools";
import {
  NOTE_TOOLS,
  NOTE_TOOLS_SYSTEM_INSTRUCTION,
  NOTE_TOOL_NAMES,
  runNoteTool,
} from "@/lib/gemini/noteTools";
import {
  PROJECT_TOOLS,
  PROJECT_TOOLS_SYSTEM_INSTRUCTION,
  PROJECT_TOOL_NAMES,
  runProjectTool,
} from "@/lib/gemini/projectTools";
import {
  GOAL_TOOLS,
  GOAL_TOOLS_SYSTEM_INSTRUCTION,
  GOAL_TOOL_NAMES,
  runGoalTool,
} from "@/lib/gemini/goalTools";
import {
  INSPIRATION_TOOLS,
  INSPIRATION_TOOLS_SYSTEM_INSTRUCTION,
  INSPIRATION_TOOL_NAMES,
  runInspirationTool,
} from "@/lib/gemini/inspirationTools";
import {
  INBOX_TOOLS,
  INBOX_TOOLS_SYSTEM_INSTRUCTION,
  INBOX_TOOL_NAMES,
  runInboxTool,
} from "@/lib/gemini/inboxTools";
import {
  DAILY_LOG_TOOLS,
  DAILY_LOG_TOOLS_SYSTEM_INSTRUCTION,
  DAILY_LOG_TOOL_NAMES,
  runDailyLogTool,
} from "@/lib/gemini/dailyLogTools";
import {
  CALENDAR_TOOLS,
  CALENDAR_TOOLS_SYSTEM_INSTRUCTION,
  CALENDAR_TOOL_NAMES,
  runCalendarTool,
} from "@/lib/gemini/calendarTools";

// Musí byť presne rovnaký model ako v app/api/gemini-token/route.ts.
const MODEL = "gemini-3.1-flash-live-preview";

// Dispatch tabuľka: mená nástrojov → funkcia, ktorá ich vykoná.
const TOOL_RUNNERS: Array<{
  names: string[];
  run: (
    supabase: any,
    name: string,
    args: Record<string, any>
  ) => Promise<{ result?: unknown; error?: string }>;
}> = [
  { names: TASK_TOOL_NAMES, run: runTaskTool },
  { names: MEMORY_TOOL_NAMES, run: runMemoryTool },
  { names: NOTE_TOOL_NAMES, run: runNoteTool },
  { names: PROJECT_TOOL_NAMES, run: runProjectTool },
  { names: GOAL_TOOL_NAMES, run: runGoalTool },
  { names: INSPIRATION_TOOL_NAMES, run: runInspirationTool },
  { names: INBOX_TOOL_NAMES, run: runInboxTool },
  { names: DAILY_LOG_TOOL_NAMES, run: runDailyLogTool },
  { names: CALENDAR_TOOL_NAMES, run: runCalendarTool },
];

function findToolRunner(name: string) {
  return TOOL_RUNNERS.find((r) => r.names.includes(name))?.run;
}

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
        const { result, error } = runner
          ? await runner(supabase, fc.name, fc.args || {})
          : { error: `Neznámy nástroj: ${fc.name}` };
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
        tools: [
          ...TASK_TOOLS,
          ...MEMORY_TOOLS,
          ...NOTE_TOOLS,
          ...PROJECT_TOOLS,
          ...GOAL_TOOLS,
          ...INSPIRATION_TOOLS,
          ...INBOX_TOOLS,
          ...DAILY_LOG_TOOLS,
          ...CALENDAR_TOOLS,
        ],
        systemInstruction: {
          parts: [
            {
              text: [
                TASK_TOOLS_SYSTEM_INSTRUCTION,
                MEMORY_SYSTEM_INSTRUCTION,
                NOTE_TOOLS_SYSTEM_INSTRUCTION,
                PROJECT_TOOLS_SYSTEM_INSTRUCTION,
                GOAL_TOOLS_SYSTEM_INSTRUCTION,
                INSPIRATION_TOOLS_SYSTEM_INSTRUCTION,
                INBOX_TOOLS_SYSTEM_INSTRUCTION,
                DAILY_LOG_TOOLS_SYSTEM_INSTRUCTION,
                CALENDAR_TOOLS_SYSTEM_INSTRUCTION,
              ].join("\n\n"),
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
      // najjednoduchší (bez samostatného AudioWorklet súboru).
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
