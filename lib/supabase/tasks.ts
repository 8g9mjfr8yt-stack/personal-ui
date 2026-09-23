import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `tasks` — priame Supabase volania (RLS cez
// prihláseného `authenticated` používateľa). Logika zámerne kopíruje 5 n8n
// webhook tools z Fázy 3 (get/create/update/complete/delete), len teraz
// ako fast-path priamo z prehliadača namiesto cez n8n (PROJECT.md časť 23).
// Používa aj hlasová stránka (app/(app)/voice) aj Tasks UI stránka.
//
// Fáza 3 leftovers (2026-09-14) — pridané tri nepovinné polia na základe
// živého testu (pozri PROJECT.md časť 22):
//   - start_date: spolu s due_date vytvorí časové okno ("od utorka do
//     piatka" = start_date utorok, due_date piatok).
//   - depends_on_task_id: táto úloha nedáva zmysel skôr, než je hotová iná
//     konkrétna úloha (následnosť/sekvencia).
//   - context: voľný text pre fuzzy podmienku/spúšťač, ktorý nie je dátum
//     ("keď si požičiam vŕtačku", "keď bude pekný víkend"). Toto je zatiaľ
//     iba úložisko — automatické vyhodnocovanie takýchto podmienok (počasie,
//     poloha) je "Opportunity logic" z PROJECT.md časti 23, plánovaná až
//     pre proaktívneho agenta vo Fáze 4.6.
//
// Denný agent 2.0 (redesign-2-0, 2026-09-22) — pridané parent_task_id
// (migrácia 0004_add_task_parent_id.sql): úloha sa dá rozdeliť na podúlohy.
// Podúloha (parent_task_id not null) sa nikdy nezobrazuje ako top-level
// položka v Dnes/Kalendár/Projekty zoznamoch — vždy iba vnorená pod svojím
// rodičom, načítaná cez getSubtasksFor().

export async function getTasks(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("completed_at", null)
    .is("parent_task_id", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(50);
  if (error) throw error;
  return data;
}

// Úlohy s termínom presne v zadanom dátumovom rozsahu [startISO, endISO)
// — top-level, bez ohľadu na to, či sú hotové (2.0 Dnes/Kalendár: hotové
// úlohy ostávajú viditeľné, len vizuálne odlíšené, nikdy nemiznú).
export async function getTasksInRange(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string
) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .gte("due_date", startISO)
    .lt("due_date", endISO)
    .is("parent_task_id", null)
    .order("scheduled_time", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

// "Pool" voľných úloh na priradenie (Kalendár 2.0) — top-level, bez dňa,
// ešte nedokončené.
export async function getUnassignedTasks(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("due_date", null)
    .is("parent_task_id", null)
    .is("completed_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}

// Všetky top-level úlohy patriace k jednému projektu (Projekty 2.0
// zoskupuje Hotové/Rozpracované/Plánované podľa status) — bez ohľadu na
// stav dokončenia, keďže Hotové sa tiež zobrazujú (len v inej skupine).
export async function getProjectTasks(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", projectId)
    .is("parent_task_id", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

// Podúlohy pre danú množinu rodičovských úloh naraz (Dnes/Projekty 2.0) —
// jeden dotaz namiesto N, výsledok sa v UI zoskupí podľa parent_task_id.
export async function getSubtasksFor(
  supabase: SupabaseClient,
  parentIds: string[]
) {
  if (parentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .in("parent_task_id", parentIds)
    .order("created_at", { ascending: true });
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
    start_date?: string | null;
    depends_on_task_id?: string | null;
    context?: string | null;
    estimated_minutes?: number | null;
    parent_task_id?: string | null;
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
      start_date: input.start_date || null,
      depends_on_task_id: input.depends_on_task_id || null,
      context: input.context || null,
      estimated_minutes: input.estimated_minutes ?? null,
      parent_task_id: input.parent_task_id || null,
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
    start_date: string | null;
    depends_on_task_id: string | null;
    context: string | null;
    estimated_minutes: number | null;
    parent_task_id: string | null;
    completed_at: string | null;
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

// Vrátenie hotovej úlohy späť medzi nedokončené (2.0: klik na odškrtnutý
// krúžok pri už hotovej úlohe/podúlohe).
export async function uncompleteTask(supabase: SupabaseClient, id: string) {
  if (!id) throw new Error("uncomplete_task: chýba 'id'.");
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: "todo", completed_at: null })
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

// Všetky top-level úlohy priradené k nejakému projektu naraz (Projekty
// 2.0) — jeden dotaz namiesto jedného na projekt; UI si ich potom
// zoskupí podľa project_id a v rámci projektu podľa status.
export async function getAllProjectTasks(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .not("project_id", "is", null)
    .is("parent_task_id", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}
