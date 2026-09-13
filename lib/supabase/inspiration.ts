import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `inspiration` — rovnaký vzor ako lib/supabase/tasks.ts.

export async function getInspiration(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("inspiration")
    .select("*")
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
  }
) {
  const { data, error } = await supabase
    .from("inspiration")
    .insert({
      title: input.title || null,
      source_url: input.source_url || null,
      source_type: input.source_url ? "link" : null,
      why_saved: input.why_saved || null,
      tags: input.tags && input.tags.length > 0 ? input.tags : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
