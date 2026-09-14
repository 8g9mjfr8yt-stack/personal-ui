import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
import {
  TASK_TOOLS,
  TASK_TOOLS_SYSTEM_INSTRUCTION,
} from "@/lib/gemini/taskTools";
import {
  MEMORY_TOOLS,
  MEMORY_SYSTEM_INSTRUCTION,
} from "@/lib/gemini/memoryTools";
import { NOTE_TOOLS, NOTE_TOOLS_SYSTEM_INSTRUCTION } from "@/lib/gemini/noteTools";
import {
  PROJECT_TOOLS,
  PROJECT_TOOLS_SYSTEM_INSTRUCTION,
} from "@/lib/gemini/projectTools";
import { GOAL_TOOLS, GOAL_TOOLS_SYSTEM_INSTRUCTION } from "@/lib/gemini/goalTools";
import {
  INSPIRATION_TOOLS,
  INSPIRATION_TOOLS_SYSTEM_INSTRUCTION,
} from "@/lib/gemini/inspirationTools";
import { INBOX_TOOLS, INBOX_TOOLS_SYSTEM_INSTRUCTION } from "@/lib/gemini/inboxTools";
import {
  DAILY_LOG_TOOLS,
  DAILY_LOG_TOOLS_SYSTEM_INSTRUCTION,
} from "@/lib/gemini/dailyLogTools";

// Musí byť presne rovnaký model ako v app/(app)/voice/page.tsx.
// Zoznam Live modelov: https://ai.google.dev/gemini-api/docs/models
const MODEL = "gemini-3.1-flash-live-preview";

// Táto route beží iba na serveri (Next.js Route Handler) — GEMINI_API_KEY
// sa sem nikdy neposiela do prehliadača. Prehliadač dostane iba krátkodobo
// platný (ephemeral) token, ktorým sa priamo pripojí na Gemini Live.
export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY nie je nastavený v .env.local" },
      { status: 500 }
    );
  }

  try {
    const client = new GoogleGenAI({ apiKey });
    const now = Date.now();

    const token = await client.authTokens.create({
      config: {
        // Token sa dá použiť na spustenie iba jednej live session.
        uses: 1,
        // Do 30 minút od vytvorenia sa v rámci session dá posielať správy.
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        // Do 1 minúty od vytvorenia sa musí session reálne spustiť.
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        // Model a nastavenia session sú "zamknuté" už tu na serveri —
        // prehliadač ich nemôže zmeniť.
        // Nástroje a systémová inštrukcia musia byť zamknuté už tu —
        // inak sa nedajú pripojiť pri connecte cez prehliadač s ephemeral
        // tokenom (issue objavený a opravený 2026-09-13, pozri PROJECT.md
        // časť 23 / poznámky ku kroku 4.4).
        liveConnectConstraints: {
          model: MODEL,
          config: {
            responseModalities: [Modality.AUDIO],
            // Fáza 4.5 — nástroje na úlohy aj na trvalú pamäť sa spájajú do
            // jedného zoznamu/inštrukcie (Gemini Live berie jeden config
            // na session).
            // Fáza 3 leftovers (2026-09-14) — zvyšné entity (Notes, Inbox,
            // Projects, Goals, Inspiration, Daily Log) pridané ako fast-path
            // Supabase nástroje rovnakým vzorom ako Tasks/Memory vyššie.
            tools: [
              ...TASK_TOOLS,
              ...MEMORY_TOOLS,
              ...NOTE_TOOLS,
              ...PROJECT_TOOLS,
              ...GOAL_TOOLS,
              ...INSPIRATION_TOOLS,
              ...INBOX_TOOLS,
              ...DAILY_LOG_TOOLS,
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
                  ].join("\n\n"),
                },
              ],
            },
            // Fáza 4.3 — umožní klientovi obnoviť tú istú session (rovnaký
            // kontext rozhovoru) po tom, čo Live API po ~10 min zatvorí
            // WebSocket spojenie. contextWindowCompression zase predlžuje
            // maximálnu dĺžku samotnej session nad pôvodný 15-min limit.
            sessionResumption: {},
            contextWindowCompression: { slidingWindow: {} },
          },
        },
      },
    });

    return NextResponse.json({ token: token.name, model: MODEL });
  } catch (err) {
    console.error("Chyba pri vytváraní ephemeral tokenu pre Gemini Live:", err);
    return NextResponse.json(
      { error: "Nepodarilo sa vytvoriť token pre Gemini Live" },
      { status: 500 }
    );
  }
}
