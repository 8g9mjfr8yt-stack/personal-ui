import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `goals` — rovnaký vzor ako lib/supabase/tasks.ts.
// Goal = kam smerujem (dlhodobejší cieľ), na rozdiel od Task = čo konkrétne
// urobím (PROJECT.md časť 5).

export async function getGoals(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("goals")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function createGoal(
  supabase: SupabaseClient,
  input: { title: string; description?: string | null }
) {
  const { data, error } = await supabase
    .from("goals")
    .insert({
      title: input.title,
      description: input.description || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
