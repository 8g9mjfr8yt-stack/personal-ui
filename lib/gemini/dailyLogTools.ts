import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import { getDailyLog, upsertDailyLog } from "@/lib/supabase/dailyLog";

export const DAILY_LOG_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_daily_log",
        description:
          "Vráti históriu denných záznamov (čo sa dialo v jednotlivých dňoch). Bez 'date' vráti posledných pár dní. Zavolaj toto na otázky typu 'čo som robil včera/minulý týždeň'.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            date: {
              type: Type.STRING,
              description: "Voliteľný konkrétny deň, YYYY-MM-DD.",
            },
          },
        },
      },
      {
        name: "create_daily_log",
        description:
          "Zapíše alebo doplní záznam denného logu pre daný deň (bez 'log_date' sa použije dnešok). Ak pre daný deň už záznam existuje, iba sa doplní/aktualizuje — nevytvorí sa duplicita.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            log_date: { type: Type.STRING, description: "YYYY-MM-DD, default dnešok." },
            summary: { type: Type.STRING, description: "Stručné zhrnutie dňa." },
            notes: {
              type: Type.STRING,
              description: "Voliteľné doplňujúce poznámky k dňu.",
            },
          },
        },
      },
    ],
  },
];

export const DAILY_LOG_TOOL_NAMES = ["get_daily_log", "create_daily_log"];

export const DAILY_LOG_TOOLS_SYSTEM_INSTRUCTION = `
Máš aj nástroje na denný log (get_daily_log, create_daily_log). Daily log
je história dní — na otázky o minulosti ("čo som robil včera/minulý
týždeň") vždy zavolaj get_daily_log namiesto hádania z pamäte rozhovoru.
`.trim();

export async function runDailyLogTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "get_daily_log":
        return { result: await getDailyLog(supabase, { date: args.date }) };
      case "create_daily_log":
        return { result: await upsertDailyLog(supabase, args as any) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s databázou." };
  }
}
