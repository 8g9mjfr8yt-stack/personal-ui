import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `notes` — rovnaký vzor ako lib/supabase/tasks.ts.

export async function getNotes(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
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
