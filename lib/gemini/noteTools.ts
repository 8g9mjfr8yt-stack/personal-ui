import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import { getNotes, createNote } from "@/lib/supabase/notes";

// Function declarations pre Gemini Live — poznámky (PROJECT.md časť 5 a 8).
// Notes = "Toto som si myslel/zapísal/zistil." (na rozdiel od Inspiration =
// externý obsah, ktorý si používateľ chce uchovať).
export const NOTE_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "search_notes",
        description:
          "Vyhľadá poznámky používateľa podľa kľúčového slova (v názve alebo obsahu). Bez zadaného 'query' vráti posledné poznámky. Zavolaj toto, keď sa používateľ pýta na svoje poznámky, myšlienky alebo niečo, čo si predtým zapísal.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            query: {
              type: Type.STRING,
              description: "Voliteľné kľúčové slovo na vyhľadávanie.",
            },
          },
        },
      },
      {
        name: "create_note",
        description:
          "Uloží novú poznámku — myšlienku, rozhodnutie, zistenie alebo osobnú reflexiu používateľa.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Voliteľný krátky názov." },
            content: { type: Type.STRING, description: "Text poznámky." },
          },
          required: ["content"],
        },
      },
    ],
  },
];

export const NOTE_TOOL_NAMES = ["search_notes", "create_note"];

export const NOTE_TOOLS_SYSTEM_INSTRUCTION = `
Máš aj nástroje na poznámky (search_notes, create_note). Notes = vlastné
myšlienky/zistenia/rozhodnutia používateľa — na rozdiel od Inspiration, čo
je externý obsah, ktorý si chce uchovať. Nové poznámky ukladaj potichu bez
zbytočného pýtania sa, iba stručne potvrď, že si to zapísal.
`.trim();

export async function runNoteTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "search_notes":
        return { result: await getNotes(supabase, args.query) };
      case "create_note":
        if (!args.content) return { error: "Chýba povinné pole 'content'." };
        return { result: await createNote(supabase, args as any) };
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri volaní nástroja ${name}:`, err);
    return { error: err?.message || "Neznáma chyba pri práci s databázou." };
  }
}
