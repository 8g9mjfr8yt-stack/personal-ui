import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import {
  getInspiration,
  createInspiration,
} from "@/lib/supabase/inspiration";

export const INSPIRATION_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "search_inspiration",
        description:
          "Vyhľadá uloženú inšpiráciu (linky, referencie, nápady od iných) podľa kľúčového slova. Bez 'query' vráti poslednú inšpiráciu.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: { type: Type.STRING, description: "Voliteľné kľúčové slovo." },
          },
        },
      },
      {
        name: "save_inspiration",
        description:
          "Uloží externú inšpiráciu — link, referenciu, cudziu myšlienku, produktovú referenciu a pod. Použi, keď používateľ hovorí o niečom, čo VIDEL alebo NAŠIEL a chce si to uchovať (na rozdiel od create_note, čo je jeho vlastná myšlienka).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            source_url: { type: Type.STRING, description: "Voliteľný odkaz." },
            why_saved: {
              type: Type.STRING,
              description: "Prečo si to používateľ chce uchovať.",
            },
          },
        },
      },
    ],
  },
];

export const INSPIRATION_TOOL_NAMES = ["search_inspiration", "save_inspiration"];

export const INSPIRATION_TOOLS_SYSTEM_INSTRUCTION = `
Máš aj nástroje na inšpiráciu (search_inspiration, save_inspiration).
Inspiration = "Toto som našiel a chcem si to uchovať" (externý obsah) — na
rozdiel od Notes, čo sú vlastné myšlienky používateľa. Ukladaj potichu, iba
stručne potvrď.
`.trim();

export async function runInspirationTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "search_inspiration":
        return { result: await getInspiration(supabase, args.query) };
      case "save_inspiration":
        return { result: await createInspiration(supabase, args as any) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s databázou." };
  }
}
