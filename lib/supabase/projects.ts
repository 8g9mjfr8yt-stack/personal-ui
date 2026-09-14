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

export async function updateProject(
  supabase: SupabaseClient,
  input: { id: string } & Partial<{
    name: string;
    description: string | null;
    status: string;
    priority: string | null;
    deadline: string | null;
  }>
) {
  const { id, ...fields } = input;
  if (!id) throw new Error("update_project: chýba 'id'.");
  // Zámerne bez fallbackov — čiastočná aktualizácia, rovnaký vzor ako
  // update_task v lib/supabase/tasks.ts. `updated_at` nastaví DB trigger.
  const { data, error } = await supabase
    .from("projects")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProject(supabase: SupabaseClient, id: string) {
  if (!id) throw new Error("delete_project: chýba 'id'.");
  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
