import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `notes` — rovnaký vzor ako lib/supabase/tasks.ts.
// getNotes s voliteľným `query` slúži aj UI stránke (bez query = posledné
// poznámky), aj hlasovému nástroju `search_notes` (s query = vyhľadávanie
// v title/content cez ilike).

export async function getNotes(supabase: SupabaseClient, query?: string) {
  let q = supabase.from("notes").select("*");
  if (query) {
    const safe = query.replace(/[%,]/g, " ").trim();
    q = q.or(`title.ilike.%${safe}%,content.ilike.%${safe}%`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function createNote(
  supabase: SupabaseClient,
  input: { title?: string | null; content: string; tags?: string[] | null }
) {
  const { data, error } = await supabase
    .from("notes")
    .insert({
      title: input.title || null,
      content: input.content,
      tags: input.tags && input.tags.length > 0 ? input.tags : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
