import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `tasks` — priame Supabase volania (RLS cez
// prihláseného `authenticated` používateľa). Logika zámerne kopíruje 5 n8n
// webhook tools z Fázy 3 (get/create/update/complete/delete), len teraz
// ako fast-path priamo z prehliadača namiesto cez n8n (PROJECT.md časť 23).
// Používa aj hlasová stránka (app/(app)/voice) aj neskôr môže Tasks UI stránka.

export async function getTasks(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("completed_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function createTask(
  supabase: SupabaseClient,
  input: {
    title: string;
    description?: string | null;
    priority?: string | null;
    project_id?: string | null;
    due_date?: string | null;
    scheduled_time?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: input.title,
      description: input.description || null,
      priority: input.priority || null,
      // Prázdny reťazec by pri type uuid/date/timestamptz spôsobil chybu —
      // rovnaký detail ako v n8n create_task z Fázy 3.
      project_id: input.project_id || null,
      due_date: input.due_date || null,
      scheduled_time: input.scheduled_time || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(
  supabase: SupabaseClient,
  input: { id: string } & Partial<{
    title: string;
    description: string | null;
    status: string;
    priority: string | null;
    project_id: string | null;
    due_date: string | null;
    scheduled_time: string | null;
  }>
) {
  const { id, ...fields } = input;
  if (!id) throw new Error("update_task: chýba 'id'.");
  // Zámerne bez `|| null` fallbackov — čiastočná aktualizácia: neposlané
  // pole ostáva nezmenené, explicitne poslaný null pole vyprázdni.
  // `updated_at` nastavuje DB trigger automaticky (schema.sql).
  const { data, error } = await supabase
    .from("tasks")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function completeTask(supabase: SupabaseClient, id: string) {
  if (!id) throw new Error("complete_task: chýba 'id'.");
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "done", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTask(supabase: SupabaseClient, id: string) {
  if (!id) throw new Error("delete_task: chýba 'id'.");
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
