import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `inspiration` — rovnaký vzor ako lib/supabase/tasks.ts.
// getInspiration s voliteľným `query` slúži aj UI stránke, aj hlasovému
// nástroju `search_inspiration` (vyhľadávanie v title/why_saved cez ilike).

const BUCKET = "inspiration";

export async function getInspiration(supabase: SupabaseClient, query?: string) {
  let q = supabase.from("inspiration").select("*");
  if (query) {
    const safe = query.replace(/[%,]/g, " ").trim();
    q = q.or(`title.ilike.%${safe}%,why_saved.ilike.%${safe}%`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function createInspiration(
  supabase: SupabaseClient,
  input: {
    title?: string | null;
    source_url?: string | null;
    why_saved?: string | null;
    tags?: string[] | null;
    storage_url?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("inspiration")
    .insert({
      title: input.title || null,
      source_url: input.source_url || null,
      storage_url: input.storage_url || null,
      // "image" má prednosť pred "link" — ak je nahraný súbor aj vyplnený
      // odkaz naraz, ide primárne o uložený obrázok.
      source_type: input.storage_url ? "image" : input.source_url ? "link" : null,
      why_saved: input.why_saved || null,
      tags: input.tags && input.tags.length > 0 ? input.tags : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Nahrá súbor (napr. screenshot/fotku) do Supabase Storage bucketu
// `inspiration` (private, RLS cez storage.objects policy — pozri
// supabase-policies.sql). Vráti cestu v bucket-e, ktorá sa uloží ako
// `storage_url` v riadku — nie je to verejná URL (bucket je private),
// zobrazenie ide cez getInspirationFileUrl (signed URL).
export async function uploadInspirationFile(supabase: SupabaseClient, file: File) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const path = `${crypto.randomUUID()}${ext ? "." + ext : ""}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

// Vygeneruje dočasnú (1 hodina) podpísanú URL na zobrazenie súkromného
// súboru z bucketu `inspiration`.
export async function getInspirationFileUrl(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}
