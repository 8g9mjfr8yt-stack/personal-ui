// v2.2 — hlasové nástroje Zápisníka (nahrádzajú note/inbox/inspiration nástroje).
import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import { createEntry, getEntries, updateEntry, entryToTask, type Entry } from "@/lib/supabase/notebook";

export const NOTEBOOK_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "capture",
        description:
          "Uloží ZÁPIS do Zápisníka — myšlienku, nápad, link alebo čokoľvek, pri čom nie je jasné, či ide o úlohu. Bezpečná predvoľba.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: "Text zápisu (alebo URL)." },
            project_id: { type: Type.STRING, description: "Voliteľne ID projektu." },
            why_saved: { type: Type.STRING, description: "Voliteľne prečo si to uložil." },
          },
          required: ["text"],
        },
      },
      {
        name: "search_notes",
        description: "Vyhľadá v Zápisníku (poznámky, nápady, linky, inšpirácie). Bez query vráti posledné zápisy.",
        parameters: { type: Type.OBJECT, properties: { query: { type: Type.STRING }, project_id: { type: Type.STRING } } },
      },
      {
        name: "update_note",
        description: "Upraví zápis (text, projekt, dôvod uloženia).",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            text: { type: Type.STRING },
            project_id: { type: Type.STRING },
            why_saved: { type: Type.STRING },
          },
          required: ["id"],
        },
      },
      {
        name: "note_to_task",
        description: "Zo zápisu spraví úlohu (kedykoľvek); zápis ostane prepojený. Ak treba, úlohu potom naplánuj cez update_task.",
        parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING } }, required: ["id"] },
      },
    ],
  },
];

export const NOTEBOOK_TOOL_NAMES = ["capture", "search_notes", "update_note", "note_to_task"];

export const NOTEBOOK_SYSTEM_INSTRUCTION = `
Zápisník (capture, search_notes, update_note, note_to_task) je jedno miesto pre myšlienky,
nápady, linky a inšpirácie. Keď si nie si istý, či je niečo úloha, ulož ZÁPIS (capture) —
nič sa nestratí a Michal si ho neskôr môže spraviť úlohou. Uloženie stručne potvrď.
`.trim();

const view = (e: Entry) => ({
  id: e.id,
  text: e.content,
  link: e.source_url,
  has_photo: !!e.storage_path,
  project_id: e.project_id,
  why_saved: e.why_saved,
  converted_to_task: !!e.converted_task_id,
  created_at: e.created_at,
});

export async function runNotebookTool(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    const a = args || {};
    switch (name) {
      case "capture": {
        if (!a.text) return { error: "Chýba 'text'." };
        let e = await createEntry(supabase, { text: a.text, project_id: a.project_id || null, input_source: "voice" });
        if (a.why_saved) e = await updateEntry(supabase, e.id, { why_saved: a.why_saved });
        return { result: view(e) };
      }
      case "search_notes": {
        const list = (await getEntries(supabase, a.query)).filter((e) => !a.project_id || e.project_id === a.project_id);
        return { result: list.slice(0, 30).map(view) };
      }
      case "update_note": {
        if (!a.id) return { error: "Chýba 'id'." };
        const fields: Partial<Entry> = {};
        if ("text" in a) fields.content = a.text || null;
        if ("project_id" in a) fields.project_id = a.project_id || null;
        if ("why_saved" in a) fields.why_saved = a.why_saved || null;
        return { result: view(await updateEntry(supabase, a.id, fields)) };
      }
      case "note_to_task": {
        if (!a.id) return { error: "Chýba 'id'." };
        const { data, error } = await supabase.from("notes").select("*").eq("id", a.id).single();
        if (error) throw error;
        const t = await entryToTask(supabase, data as Entry);
        return { result: { task_id: t.id, title: t.title } };
      }
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri nástroji ${name}:`, err);
    return { error: err?.message || "Neznáma chyba." };
  }
}
