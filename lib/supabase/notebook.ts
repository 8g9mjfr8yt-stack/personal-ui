// v2.2 — Zápisník: jedna tabuľka `notes` namiesto inbox + inspiration + notes
// (NAVRH-PRESTAVBY.md, časť 3.3). Bez druhu a stavu — zobrazenie sa odvodí
// z vyplnených polí (obrázok / link / text). Zápis sa pri premene na úlohu
// NEMAŽE, iba sa prepojí (converted_task_id).
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTaskV2 } from "@/lib/supabase/tasksV2";

export type Entry = {
  id: string;
  title: string | null;
  content: string | null;
  source_url: string | null;
  storage_path: string | null;
  thumbnail: string | null;
  why_saved: string | null;
  input_source: "voice" | "text" | "photo" | "link" | "share" | "migrated";
  converted_task_id: string | null;
  tags: string[] | null;
  project_id: string | null;
  event_id: string | null;
  created_at: string;
  updated_at: string;
};

const BUCKET = "inspiration";

export async function getEntries(supabase: SupabaseClient, query?: string): Promise<Entry[]> {
  let q = supabase.from("notes").select("*").order("created_at", { ascending: false }).limit(500);
  if (query?.trim()) {
    const s = query.trim().replace(/[%,()]/g, " ");
    q = q.or(`title.ilike.%${s}%,content.ilike.%${s}%,source_url.ilike.%${s}%,why_saved.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Entry[];
}

// Odkaz sa zistí z textu, ak je celý text iba URL.
function splitLink(text: string): { content: string | null; source_url: string | null } {
  const t = text.trim();
  if (/^https?:\/\/\S+$/i.test(t)) return { content: null, source_url: t };
  return { content: t || null, source_url: null };
}

export async function createEntry(
  supabase: SupabaseClient,
  input: { text?: string; storage_path?: string | null; project_id?: string | null; input_source?: Entry["input_source"] }
): Promise<Entry> {
  const { content, source_url } = splitLink(input.text || "");
  const input_source =
    input.input_source || (input.storage_path ? "photo" : source_url ? "link" : "text");
  const { data, error } = await supabase
    .from("notes")
    .insert({
      content,
      source_url,
      storage_path: input.storage_path || null,
      project_id: input.project_id || null,
      input_source,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Entry;
}

export async function updateEntry(supabase: SupabaseClient, id: string, fields: Partial<Entry>) {
  const { data, error } = await supabase.from("notes").update(fields).eq("id", id).select().single();
  if (error) throw error;
  return data as Entry;
}

export async function deleteEntry(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadEntryPhoto(supabase: SupabaseClient, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `notes/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

export async function getPhotoUrls(supabase: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const d of data || []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

// „Urobiť úlohu“ — úloha (kedykoľvek) s textom zápisu, zápis ostane prepojený.
export async function entryToTask(supabase: SupabaseClient, e: Entry) {
  const text = e.title || e.content || e.source_url || "Úloha zo zápisu";
  const firstLine = text.split("\n")[0].slice(0, 120);
  const task = await createTaskV2(supabase, {
    title: firstLine,
    description: [e.content, e.source_url].filter(Boolean).join("\n") || null,
    project_id: e.project_id,
    from_note_id: e.id,
  });
  await updateEntry(supabase, e.id, { converted_task_id: task.id });
  return task;
}
