import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `projects` — rovnaký vzor ako lib/supabase/tasks.ts.

export async function getProjects(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function createProject(
  supabase: SupabaseClient,
  input: {
    name: string;
    description?: string | null;
    priority?: string | null;
    deadline?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: input.name,
      description: input.description || null,
      priority: input.priority || null,
      deadline: input.deadline || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
