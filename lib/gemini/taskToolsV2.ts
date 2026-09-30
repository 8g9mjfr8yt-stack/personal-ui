// v2.2 — hlasové nástroje pre úlohy a deň nad novým modelom (plán + termín).
// NAVRH-PRESTAVBY.md, časť 7. Nahrádza lib/gemini/taskTools.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { Type, type Tool } from "@google/genai";
import { addDays, localToUtc, zonedDate, zonedDateTime, DEFAULT_TIME_ZONE } from "@/lib/time";
import { planMode, plannedDays, rangeIncludes } from "@/lib/model/taskPlan";
import { getEventsInRange } from "@/lib/supabase/events";
import {
  getTasksForRange,
  getPool,
  createTaskV2,
  updateTaskV2,
  setTaskDone,
  deleteTaskV2,
  type TaskV2,
  type TaskV2Input,
} from "@/lib/supabase/tasksV2";
import { getSubtasksFor } from "@/lib/supabase/tasks";

const TZ = DEFAULT_TIME_ZONE;

const PLAN_PROPS = {
  plan_date: { type: Type.STRING, description: "Deň, kedy to chce robiť (YYYY-MM-DD). Režim „deň“." },
  plan_range_start: { type: Type.STRING, description: "Rozmedzie „niekedy od–do“: prvý deň (YYYY-MM-DD)." },
  plan_range_end: { type: Type.STRING, description: "Rozmedzie: posledný deň (YYYY-MM-DD)." },
  block_start: { type: Type.STRING, description: "Časový blok: začiatok, miestny čas YYYY-MM-DDTHH:MM:SS." },
  block_end: { type: Type.STRING, description: "Časový blok: koniec, miestny čas YYYY-MM-DDTHH:MM:SS." },
  clear_plan: { type: Type.BOOLEAN, description: "true = zrušiť plán (úloha bude „kedykoľvek“)." },
  due_date: { type: Type.STRING, description: "TERMÍN (deadline) — iba ak ide naozaj o termín („do piatku musím…“). YYYY-MM-DD, prázdny reťazec = zrušiť." },
  due_time: { type: Type.STRING, description: "Voliteľný čas termínu HH:MM." },
};

export const TASK_V2_TOOLS: Tool[] = [
  {
    functionDeclarations: [
      {
        name: "get_day",
        description:
          "Vráti celý deň naraz: udalosti z kalendára aj úlohy (časové bloky, úlohy na deň, rozmedzia). Použi na „čo mám dnes/zajtra/v piatok“.",
        parameters: {
          type: Type.OBJECT,
          properties: { date: { type: Type.STRING, description: "YYYY-MM-DD, predvolene dnes." } },
        },
      },
      {
        name: "get_tasks",
        description:
          "Zoznam nedokončených úloh s ID. filter: 'pool' = nenaplánované, nestihnuté a po termíne (predvolené), 'all' = všetky nedokončené. S parent_task_id vráti podúlohy danej úlohy.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            filter: { type: Type.STRING, description: "'pool' alebo 'all'." },
            parent_task_id: { type: Type.STRING },
          },
        },
      },
      {
        name: "create_task",
        description: "Vytvorí úlohu. Plán (kedy) a termín (deadline) sú nezávislé — vyplň iba to, čo používateľ povedal.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            project_id: { type: Type.STRING, description: "ID projektu (zisti cez get_projects)." },
            parent_task_id: { type: Type.STRING, description: "Ak je to podúloha, ID rodičovskej úlohy." },
            priority: { type: Type.STRING, description: "low/medium/high" },
            estimated_minutes: { type: Type.NUMBER },
            context: { type: Type.STRING, description: "Fuzzy podmienka („keď bude pekne“)." },
            ...PLAN_PROPS,
          },
          required: ["title"],
        },
      },
      {
        name: "update_task",
        description: "Upraví úlohu (iba zadané polia). Presun na iný deň = plan_date.",
        parameters: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            project_id: { type: Type.STRING, description: "Prázdny reťazec = bez projektu." },
            priority: { type: Type.STRING },
            estimated_minutes: { type: Type.NUMBER },
            context: { type: Type.STRING },
            ...PLAN_PROPS,
          },
          required: ["id"],
        },
      },
      {
        name: "complete_task",
        description: "Označí úlohu ako hotovú (undo=true ju vráti medzi nehotové).",
        parameters: {
          type: Type.OBJECT,
          properties: { id: { type: Type.STRING }, undo: { type: Type.BOOLEAN } },
          required: ["id"],
        },
      },
      {
        name: "delete_task",
        description: "Natrvalo zmaže úlohu. VŽDY sa najprv nahlas spýtaj na potvrdenie.",
        parameters: { type: Type.OBJECT, properties: { id: { type: Type.STRING } }, required: ["id"] },
      },
    ],
  },
];

export const TASK_V2_TOOL_NAMES = ["get_day", "get_tasks", "create_task", "update_task", "complete_task", "delete_task"];

export const TASK_V2_SYSTEM_INSTRUCTION = `
Si Michalov osobný hlasový asistent (Denný agent), hovoríš po slovensky — prirodzene,
neformálne, stručne, občas vtipne. Nemoralizuj; keď povie „nie“, rešpektuj to.

ÚLOHY vs. UDALOSTI vs. ZÁPISY:
- „stretnutie, u lekára, s niekým, rezervácia, koncert“ → UDALOSŤ v kalendári (create_calendar_event).
- „urobiť, zavolať, poslať, kúpiť, vybaviť“ → ÚLOHA (create_task).
- myšlienka, nápad, link, „napadlo ma…“ alebo keď si NIE SI ISTÝ → ZÁPIS (capture). Nikdy nehádaj úlohu.
- slovo „projekt“ alebo väčšia oblasť práce → create_project, nie úloha.

PLÁN (kedy to chce robiť) a TERMÍN (deadline) sú dve rôzne veci:
- „v piatok spravím…“ → plan_date; „niekedy tento týždeň“ → plan_range_start + plan_range_end;
  „zajtra o 10 na hodinu“ → block_start + block_end (časový blok, objaví sa aj v Google Kalendári);
  bez času ani dňa → nevypĺňaj plán (úloha „kedykoľvek“).
- „do piatku musím…“, „termín je…“ → due_date (+ due_time). Termín NEvypĺňaj, ak ho nepovedal.
- Oboje naraz je v poriadku („v stredu to spravím, odovzdať do piatku“).

Pravidlá:
- Na otázky o dni („čo mám dnes/zajtra“) zavolaj get_day. Na „čo mám nestihnuté / čo mám rozrobené“
  get_tasks (filter pool). Odpovedaj iba z toho, čo nástroje vrátia.
- ID úlohy zisti cez get_tasks/get_day; pri viacerých podobných sa spýtaj.
- Po akcii stručne potvrď, čo si urobil. delete_task iba po jasnom súhlase.
- Podúlohy: create_task s parent_task_id; get_tasks vracia pri úlohe pole subtasks.
- Odhad trvania ulož do estimated_minutes; pri „mám 30 minút, čo stihnem“ porovnaj s ním.
- Ak nie je jasné, či ide o príkaz alebo premýšľanie nahlas, krátko sa spýtaj.
`.trim();

function compact(t: TaskV2) {
  const mode = planMode(t);
  return {
    id: t.id,
    title: t.title,
    plan:
      mode === "block"
        ? { mode, start: zonedDateTime(t.plan_start_at!, TZ), end: zonedDateTime(t.plan_end_at!, TZ) }
        : mode === "range"
        ? { mode, from: t.plan_start_date, to: t.plan_end_date }
        : mode === "day"
        ? { mode, date: t.plan_start_date }
        : { mode },
    due: t.due_date ? `${t.due_date}${t.due_time ? " " + t.due_time.slice(0, 5) : ""}` : null,
    done: !!t.completed_at,
    project_id: t.project_id,
    priority: t.priority,
    estimated_minutes: t.estimated_minutes,
    context: t.context,
    postponed_count: t.postponed_count || 0,
    parent_task_id: t.parent_task_id,
  };
}

function planFieldsFromArgs(a: Record<string, any>): Partial<TaskV2Input> {
  const out: Partial<TaskV2Input> = {};
  const empty = { plan_start_date: null, plan_end_date: null, plan_start_at: null, plan_end_at: null };
  if (a.clear_plan) Object.assign(out, empty);
  if (a.plan_date) Object.assign(out, empty, { plan_start_date: a.plan_date });
  if (a.plan_range_start && a.plan_range_end)
    Object.assign(out, empty, { plan_start_date: a.plan_range_start, plan_end_date: a.plan_range_end });
  if (a.block_start && a.block_end)
    Object.assign(out, empty, { plan_start_at: localToUtc(a.block_start, TZ), plan_end_at: localToUtc(a.block_end, TZ) });
  if ("due_date" in a) out.due_date = a.due_date || null;
  if ("due_time" in a) out.due_time = a.due_time || null;
  if (out.due_date === null) out.due_time = null;
  return out;
}

async function withSubtasks(supabase: SupabaseClient, tasks: TaskV2[]) {
  const subs = (await getSubtasksFor(supabase, tasks.map((t) => t.id))) as TaskV2[];
  const by: Record<string, { id: string; title: string; done: boolean }[]> = {};
  for (const s of subs) (by[s.parent_task_id as string] ||= []).push({ id: s.id, title: s.title, done: !!s.completed_at });
  return tasks.map((t) => ({ ...compact(t), ...(by[t.id] ? { subtasks: by[t.id] } : {}) }));
}

export async function runTaskToolV2(
  supabase: SupabaseClient,
  name: string,
  args: Record<string, any>
): Promise<{ result?: unknown; error?: string }> {
  try {
    const a = args || {};
    switch (name) {
      case "get_day": {
        const date = a.date || zonedDate(new Date(), TZ);
        const [events, tasks] = await Promise.all([
          getEventsInRange(supabase, date, addDays(date, 1), TZ),
          getTasksForRange(supabase, date, addDays(date, 1), TZ),
        ]);
        return {
          result: {
            date,
            // bloky úloh (task_id) sú v „blocks“, nie medzi udalosťami
            events: events.filter((e) => !e.task_id).map((e) => ({
              id: e.google_event_id,
              title: e.title,
              all_day: e.all_day,
              start: e.all_day ? e.start_date : zonedDateTime(e.start_at!, TZ),
              end: e.all_day ? e.end_date : zonedDateTime(e.end_at!, TZ),
              location: e.location,
            })),
            blocks: await withSubtasks(supabase, tasks.filter((t) => planMode(t) === "block" && plannedDays(t, TZ).includes(date))),
            tasks_for_day: await withSubtasks(supabase, tasks.filter((t) => planMode(t) === "day" && t.plan_start_date === date)),
            ranges_including_day: await withSubtasks(supabase, tasks.filter((t) => rangeIncludes(t, date))),
          },
        };
      }
      case "get_tasks": {
        if (a.parent_task_id) {
          const subs = (await getSubtasksFor(supabase, [a.parent_task_id])) as TaskV2[];
          return { result: subs.map(compact) };
        }
        if (a.filter === "all") {
          const { data, error } = await supabase
            .from("tasks")
            .select("*")
            .is("parent_task_id", null)
            .is("completed_at", null)
            .eq("legacy_mirror", false)
            .limit(200);
          if (error) throw error;
          return { result: await withSubtasks(supabase, (data || []) as TaskV2[]) };
        }
        const pool = await getPool(supabase);
        return {
          result: {
            nestihnute: await withSubtasks(supabase, pool.missed),
            po_termine: await withSubtasks(supabase, pool.overdue),
            rozmedzie: await withSubtasks(supabase, pool.range),
            kedykolvek: await withSubtasks(supabase, pool.anytime),
          },
        };
      }
      case "create_task": {
        if (!a.title) return { error: "Chýba 'title'." };
        const t = await createTaskV2(supabase, {
          title: a.title,
          description: a.description || null,
          project_id: a.project_id || null,
          parent_task_id: a.parent_task_id || null,
          priority: a.priority || null,
          estimated_minutes: a.estimated_minutes || null,
          context: a.context || null,
          ...planFieldsFromArgs(a),
        });
        return { result: compact(t) };
      }
      case "update_task": {
        if (!a.id) return { error: "Chýba 'id'." };
        const fields: TaskV2Input = { ...planFieldsFromArgs(a) };
        for (const k of ["title", "description", "priority", "context", "estimated_minutes"] as const) {
          if (k in a) (fields as any)[k] = a[k] === "" ? null : a[k];
        }
        if ("project_id" in a) fields.project_id = a.project_id || null;
        const t = await updateTaskV2(supabase, a.id, fields);
        return { result: compact(t) };
      }
      case "complete_task": {
        if (!a.id) return { error: "Chýba 'id'." };
        const { data, error } = await supabase.from("tasks").select("*").eq("id", a.id).single();
        if (error) throw error;
        const t = await setTaskDone(supabase, data as TaskV2, !a.undo);
        return { result: compact(t) };
      }
      case "delete_task": {
        if (!a.id) return { error: "Chýba 'id'." };
        const { data, error } = await supabase.from("tasks").select("*").eq("id", a.id).single();
        if (error) throw error;
        await deleteTaskV2(supabase, data as TaskV2);
        return { result: { id: a.id, deleted: true } };
      }
      default:
        return { error: `Neznámy nástroj: ${name}` };
    }
  } catch (err: any) {
    console.error(`Chyba pri nástroji ${name}:`, err);
    return { error: err?.message || "Neznáma chyba." };
  }
}

