// Fáza 5 prestavby — dátová vrstva úloh nad NOVÝMI stĺpcami (plán + termín).
// Nahradí lib/supabase/tasks.ts, keď sa prepne UI a hlas. Starý súbor ostáva
// do fázy 6, aby v2.13 fungovala bez zmeny.
//
// Zásady:
//   - platnosť plánu kontroluje validatePlan() (rovnaké pravidlá ako DB),
//   - úloha v režime „blok“ sa do Google neposiela priamo — iba sa označí
//     gcal_sync_state = 'pending' a na pozadí sa zavolá /api/calendar/push-pending
//     (uloženie nikdy nečaká na Google),
//   - všetky časy cez lib/time.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayBounds, zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";
import {
  planMode,
  validatePlan,
  planToDay,
  poolSection,
  type PoolSection,
  type TaskPlanRow,
} from "@/lib/model/taskPlan";

export type TaskV2 = TaskPlanRow & {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  depends_on_task_id: string | null;
  context: string | null;
  estimated_minutes: number | null;
  plan_updated_at: string | null;
  gcal_event_id: string | null;
  gcal_sync_state: "none" | "pending" | "ok" | "error";
  gcal_last_error: string | null;
  created_at: string;
  updated_at: string;
};

const PLAN_KEYS = ["plan_start_date", "plan_end_date", "plan_start_at", "plan_end_at"] as const;

// Zavolá spracovanie fronty na pozadí — nečaká sa na výsledok.
export function kickCalendarPush(payload: { taskIds?: string[]; deleteEventIds?: string[] }) {
  if (typeof window === "undefined") return;
  fetch("/api/calendar/push-pending", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch((err) => console.error("[calendar-push] nepodarilo sa spustiť:", err));
}

// Úlohy naplánované do dní [startDate, endDateExclusive): deň, blok alebo
// rozmedzie, ktoré ich prekrýva. Top-level, bez skrytých zrkadiel udalostí.
export async function getTasksForRange(
  supabase: SupabaseClient,
  startDate: string,
  endDateExclusive: string,
  timeZone: string = DEFAULT_TIME_ZONE
): Promise<TaskV2[]> {
  const from = dayBounds(startDate, timeZone).start;
  const to = dayBounds(addDays(endDateExclusive, -1), timeZone).end;
  const lastDay = addDays(endDateExclusive, -1);
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("parent_task_id", null)
    .eq("legacy_mirror", false)
    .or(
      // deň
      `and(plan_start_date.gte.${startDate},plan_start_date.lte.${lastDay},plan_end_date.is.null),` +
        // rozmedzie prekrývajúce okno
        `and(plan_end_date.not.is.null,plan_start_date.lte.${lastDay},plan_end_date.gte.${startDate}),` +
        // blok
        `and(plan_start_at.lt.${to},plan_end_at.gt.${from})`
    )
    .order("plan_start_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []) as TaskV2[];
}

// Pool: nedokončené top-level úlohy rozdelené do sekcií.
export async function getPool(
  supabase: SupabaseClient,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE
): Promise<Record<PoolSection, TaskV2[]>> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .is("parent_task_id", null)
    .is("completed_at", null)
    .eq("legacy_mirror", false)
    .limit(500);
  if (error) throw error;

  const out: Record<PoolSection, TaskV2[]> = { missed: [], overdue: [], range: [], anytime: [] };
  for (const t of (data || []) as TaskV2[]) {
    const s = poolSection(t, now, timeZone);
    if (s) out[s].push(t);
  }
  const planDate = (t: TaskV2) =>
    t.plan_end_date || t.plan_start_date || (t.plan_start_at ? zonedDate(t.plan_start_at, timeZone) : "9999");
  out.missed.sort((a, b) => planDate(a).localeCompare(planDate(b)));
  out.overdue.sort((a, b) => (a.due_date || "").localeCompare(b.due_date || ""));
  out.range.sort((a, b) => (a.plan_end_date || "").localeCompare(b.plan_end_date || ""));
  out.anytime.sort(
    (a, b) =>
      (a.due_date || "9999").localeCompare(b.due_date || "9999") ||
      b.created_at.localeCompare(a.created_at)
  );
  return out;
}

// Všetky nedokončené hlavné úlohy (bez podúloh a bez skrytých zrkadiel
// Google udalostí) — stránka Úlohy; voliteľne iba s projektom.
export async function getOpenTasks(supabase: SupabaseClient, opts: { withProjectOnly?: boolean } = {}) {
  let q = supabase
    .from("tasks")
    .select("*")
    .is("parent_task_id", null)
    .is("completed_at", null)
    .eq("legacy_mirror", false);
  if (opts.withProjectOnly) q = q.not("project_id", "is", null);
  const { data, error } = await q.limit(1000);
  if (error) throw error;
  return (data || []) as TaskV2[];
}

// Úlohy projektov vrátane hotových (Projekty zobrazujú aj sekciu Hotové).
export async function getProjectTasksV2(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .not("project_id", "is", null)
    .is("parent_task_id", null)
    .eq("legacy_mirror", false)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data || []) as TaskV2[];
}

export type TaskV2Input = Partial<
  Pick<
    TaskV2,
    | "title"
    | "description"
    | "status"
    | "priority"
    | "project_id"
    | "parent_task_id"
    | "depends_on_task_id"
    | "context"
    | "estimated_minutes"
    | "plan_start_date"
    | "plan_end_date"
    | "plan_start_at"
    | "plan_end_at"
    | "due_date"
    | "due_time"
  >
> & { from_note_id?: string | null };

export async function createTaskV2(supabase: SupabaseClient, input: TaskV2Input & { title: string }) {
  const planError = validatePlan(input);
  if (planError) throw new Error(planError);
  const isBlock = planMode(input) === "block";
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...input,
      title: input.title.trim(),
      plan_updated_at: new Date().toISOString(),
      gcal_sync_state: isBlock ? "pending" : "none",
    })
    .select()
    .single();
  if (error) throw error;
  if (isBlock) kickCalendarPush({ taskIds: [data.id] });
  return data as TaskV2;
}

// Čiastočná úprava. Pri zmene plánu sa načíta pôvodný riadok, zlúči sa a
// overí celý výsledný plán.
export async function updateTaskV2(supabase: SupabaseClient, id: string, fields: TaskV2Input) {
  const { data: cur, error: curErr } = await supabase.from("tasks").select("*").eq("id", id).single();
  if (curErr) throw curErr;
  const merged = { ...cur, ...fields } as TaskV2;
  const planError = validatePlan(merged);
  if (planError) throw new Error(planError);

  const patch: Record<string, unknown> = { ...fields };
  const planChanged = PLAN_KEYS.some((k) => k in fields && (fields as any)[k] !== (cur as any)[k]);
  if (planChanged) patch.plan_updated_at = new Date().toISOString();

  const wasOrIsBlock = planMode(merged) === "block" || !!cur.gcal_event_id;
  const touchesGoogle =
    planChanged || ("title" in fields && fields.title !== cur.title) || ("description" in fields && fields.description !== cur.description);
  const needsPush = wasOrIsBlock && touchesGoogle;
  if (needsPush) {
    patch.gcal_sync_state = "pending";
    patch.gcal_sync_attempts = 0;
  }

  const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select().single();
  if (error) throw error;
  if (needsPush) kickCalendarPush({ taskIds: [id] });
  return data as TaskV2;
}

// „Na [deň]“ z poolu alebo presun na iný deň.
export async function planTaskToDay(supabase: SupabaseClient, task: TaskV2, dateISO: string) {
  const fields = planToDay(task, dateISO);
  const needsPush = !!task.gcal_event_id; // bol blok → udalosť v Google zmazať
  const { data, error } = await supabase
    .from("tasks")
    .update({ ...fields, ...(needsPush ? { gcal_sync_state: "pending", gcal_sync_attempts: 0 } : {}) })
    .eq("id", task.id)
    .select()
    .single();
  if (error) throw error;
  if (needsPush) kickCalendarPush({ taskIds: [task.id] });
  return data as TaskV2;
}

export async function setTaskDone(supabase: SupabaseClient, task: TaskV2, done: boolean) {
  const needsPush = !!task.gcal_event_id; // „✓ “ v názve bloku
  const { data, error } = await supabase
    .from("tasks")
    .update({
      status: done ? "done" : "todo",
      completed_at: done ? new Date().toISOString() : null,
      ...(needsPush ? { gcal_sync_state: "pending", gcal_sync_attempts: 0 } : {}),
    })
    .eq("id", task.id)
    .select()
    .single();
  if (error) throw error;
  if (needsPush) kickCalendarPush({ taskIds: [task.id] });
  return data as TaskV2;
}

export async function deleteTaskV2(supabase: SupabaseClient, task: TaskV2) {
  const { error } = await supabase.from("tasks").delete().eq("id", task.id);
  if (error) throw error;
  if (task.gcal_event_id) kickCalendarPush({ deleteEventIds: [task.gcal_event_id] });
}
