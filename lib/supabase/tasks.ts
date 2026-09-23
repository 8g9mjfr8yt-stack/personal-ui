import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
} from "@/lib/googleCalendar";

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
//
// 2026-09-27 — obojsmerná synchronizácia s Google Kalendárom (migrácia
// 0006_add_task_google_event_id.sql): úloha s due_date a/alebo
// scheduled_time si po uložení "postará" o zodpovedajúcu udalosť v Google
// Kalendári (vytvorí ju, ak ešte nemá google_event_id, inak ju upraví);
// úloha bez dátumu si zmaže prípadnú predtým vytvorenú udalosť. Toto je
// best-effort — chyba Google Calendar API sa iba zaloguje a nikdy
// nezablokuje uloženie úlohy. Opačný smer (nová/upravená/zmazaná udalosť
// vytvorená hlasom cez create_calendar_event a pod.) je v
// lib/gemini/calendarTools.ts — úlohy vzniknuté ako zrkadlo skutočnej
// Google Calendar udalosti nikdy znova nespúšťajú tento smer (zapisujú sa
// priamym `.update()`/`.insert()`, nie cez createTask/updateTask nižšie),
// takže sa to nezacyklí.

type SyncableTask = {
  id: string;
  title: string;
  description?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  scheduled_time?: string | null;
  scheduled_time_end?: string | null;
  google_event_id?: string | null;
};

// O jeden deň neskôr než zadaný YYYY-MM-DD reťazec, počítané z lokálnych
// (nie UTC) komponentov dátumu — rovnaký princíp ako oprava toISODate v
// lib/dateUtils.ts, nech sa dátum pri hraničných časových pásmach neposunie.
function nextDayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

// 2026-09-24 oprava — hlasový agent posiela scheduled_time ako "naivný"
// ISO reťazec bez posunu (napr. "2026-09-24T15:00:00"), myslený ako
// bratislavský miestny čas. Pri priamom uložení takéhoto reťazca do
// timestamptz stĺpca ho Postgres/Supabase interpretuje ako UTC (nie
// bratislavský čas), čo dávalo systematický posun +2h (leto)/+1h
// (zima) oproti tomu, čo používateľ v skutočnosti povedal. `new
// Date(naivný_reťazec)` v prehliadači ho interpretuje ako miestny čas
// PREHLIADAČA (rovnaký princíp, aký TaskEditModal už používa pre ručne
// zadaný čas) — `.toISOString()` z toho spraví správny UTC okamih.
// Hodnota, ktorá už má "Z"/offset (z manuálneho formulára, alebo zo
// zrkadlenia Calendar udalosti), sa nechá bez zmeny.
function normalizeScheduledTime(
  value: string | null | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(value);
  return hasOffset ? value : new Date(value).toISOString();
}

async function syncTaskToCalendar(supabase: SupabaseClient, task: SyncableTask) {
  try {
    const hasDate = !!(task.due_date || task.scheduled_time);

    if (!hasDate) {
      if (task.google_event_id) {
        await deleteCalendarEvent(task.google_event_id).catch(() => {});
        await supabase.from("tasks").update({ google_event_id: null }).eq("id", task.id);
      }
      return;
    }

    let start: string;
    let end: string;
    if (task.scheduled_time) {
      const startD = new Date(task.scheduled_time);
      // Explicitný čas konca (ak ho používateľ zadal) má prednosť pred
      // defaultnou 30-minútovou dĺžkou.
      const endD = task.scheduled_time_end
        ? new Date(task.scheduled_time_end)
        : new Date(startD.getTime() + 30 * 60 * 1000);
      start = startD.toISOString();
      end = endD.toISOString();
    } else {
      // Bez presného času — celodenná udalosť (prípadne viacdňová, ak je
      // vyplnené aj start_date). Google Calendar čaká `end` = deň PO
      // poslednom dni okna.
      const due = task.due_date as string;
      start = task.start_date || due;
      end = nextDayISO(due);
    }

    if (task.google_event_id) {
      await updateCalendarEvent({
        event_id: task.google_event_id,
        summary: task.title,
        description: task.description ?? undefined,
        start_datetime: start,
        end_datetime: end,
      });
    } else {
      const event = await createCalendarEvent({
        summary: task.title,
        description: task.description ?? undefined,
        start_datetime: start,
        end_datetime: end,
      });
      await supabase.from("tasks").update({ google_event_id: event.id }).eq("id", task.id);
    }
  } catch (err) {
    // Best-effort — nesmie zhodiť uloženie úlohy (napr. Google Calendar
    // refresh token práve vypršal, pozri /api/google-calendar-token).
    console.error("Nepodarilo sa zosynchronizovať úlohu s Google Kalendárom:", err);
  }
}

const SYNC_RELEVANT_FIELDS = ["title", "description", "due_date", "scheduled_time", "scheduled_time_end", "start_date"];

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
    scheduled_time_end?: string | null;
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
      scheduled_time: normalizeScheduledTime(input.scheduled_time) || null,
      scheduled_time_end: normalizeScheduledTime(input.scheduled_time_end) || null,
      start_date: input.start_date || null,
      depends_on_task_id: input.depends_on_task_id || null,
      context: input.context || null,
      estimated_minutes: input.estimated_minutes ?? null,
      parent_task_id: input.parent_task_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  await syncTaskToCalendar(supabase, data);
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
    scheduled_time_end: string | null;
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
  // scheduled_time(_end) normalizujeme iba keď boli naozaj poslané —
  // pozri normalizeScheduledTime vyššie (naivný reťazec z hlasu → UTC).
  if ("scheduled_time" in fields) {
    fields.scheduled_time = normalizeScheduledTime(fields.scheduled_time) ?? null;
  }
  if ("scheduled_time_end" in fields) {
    fields.scheduled_time_end = normalizeScheduledTime(fields.scheduled_time_end) ?? null;
  }
  const { data, error } = await supabase
    .from("tasks")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  // Kalendár sa synchronizuje iba keď sa zmenilo niečo, čo ho ovplyvňuje
  // (názov/popis/dátum/čas), alebo keď úloha už má naviazanú udalosť
  // (napr. presun medzi projektmi nemení dátum, ale ak by predsalen mala
  // google_event_id a stratila dátum, treba udalosť zmazať).
  const touchesSync = SYNC_RELEVANT_FIELDS.some((k) => k in fields);
  if (touchesSync || data.google_event_id) {
    await syncTaskToCalendar(supabase, data);
  }
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
  if (data?.google_event_id) {
    await deleteCalendarEvent(data.google_event_id).catch((err) =>
      console.error("Nepodarilo sa zmazať naviazanú Google Calendar udalosť:", err)
    );
  }
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
