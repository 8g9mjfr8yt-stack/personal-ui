// Model plánu úlohy (NAVRH-PRESTAVBY.md, časť 3.1) — čistá logika bez
// databázy, aby sa dala testovať (tests/taskPlan.test.mjs).
//
// Úloha má dve nezávislé časové veci:
//   - PLÁN (kedy ju chcem robiť) — 4 režimy, odvodené z vyplnených polí:
//       kedykoľvek | deň | rozmedzie dní | blok (deň + čas)
//   - TERMÍN (deadline) — due_date (+ voliteľne due_time), iba skutočný termín
//
// Bez "@/..." importov (kvôli testom v Node).

import { addDays, zonedDate, zonedTime, spanDays, DEFAULT_TIME_ZONE, type Span } from "../time";

export type PlanFields = {
  plan_start_date?: string | null;
  plan_end_date?: string | null;
  plan_start_at?: string | null;
  plan_end_at?: string | null;
};

export type TaskPlanRow = PlanFields & {
  id?: string;
  status?: string | null;
  completed_at?: string | null;
  due_date?: string | null;
  due_time?: string | null; // "HH:MM" alebo "HH:MM:SS"
  parent_task_id?: string | null;
  legacy_mirror?: boolean | null;
  postponed_count?: number | null;
};

export type PlanMode = "anytime" | "day" | "range" | "block";

export function planMode(t: PlanFields): PlanMode {
  if (t.plan_start_at && t.plan_end_at) return "block";
  if (t.plan_start_date && t.plan_end_date && t.plan_end_date !== t.plan_start_date) return "range";
  if (t.plan_start_date) return "day";
  return "anytime";
}

// Chyba v pláne/termíne (rovnaké pravidlá ako DB kontroly 4.2), alebo null.
export function validatePlan(t: TaskPlanRow): string | null {
  if (t.plan_end_date && !t.plan_start_date) return "Rozmedzie nemá prvý deň.";
  if (t.plan_start_date && t.plan_end_date && t.plan_end_date < t.plan_start_date)
    return "Posledný deň rozmedzia je pred prvým.";
  if (!!t.plan_start_at !== !!t.plan_end_at) return "Časový blok musí mať začiatok aj koniec.";
  if (t.plan_start_at && t.plan_end_at && new Date(t.plan_end_at).getTime() <= new Date(t.plan_start_at).getTime())
    return "Koniec musí byť neskôr ako začiatok.";
  if (t.plan_start_date && t.plan_start_at) return "Úloha nemôže mať naraz deň aj časový blok.";
  if (t.due_time && !t.due_date) return "Čas termínu bez dátumu termínu.";
  return null;
}

// Plán ako úsek (Span) — pre spoločné výpočty dní, alebo null (kedykoľvek).
export function planSpan(t: PlanFields): Span | null {
  const mode = planMode(t);
  if (mode === "block") return { allDay: false, startAt: t.plan_start_at!, endAt: t.plan_end_at! };
  if (mode === "range") return { allDay: true, startDate: t.plan_start_date!, endDate: t.plan_end_date! };
  if (mode === "day") return { allDay: true, startDate: t.plan_start_date!, endDate: t.plan_start_date! };
  return null;
}

// Dni, na ktoré je úloha NAPLÁNOVANÁ (deň alebo blok). Rozmedzie sem zámerne
// nepatrí — je to ponuka v poole, nie umiestnenie (zobrazí sa svetlejšie).
export function plannedDays(t: PlanFields, timeZone: string = DEFAULT_TIME_ZONE): string[] {
  const mode = planMode(t);
  if (mode === "day" || mode === "block") return spanDays(planSpan(t)!, timeZone);
  return [];
}

// Je dnešok v rozmedzí úlohy? (Dnes ju ukáže svetlejšie ako „môžeš dnes“.)
export function rangeIncludes(t: PlanFields, dateISO: string): boolean {
  return planMode(t) === "range" && t.plan_start_date! <= dateISO && t.plan_end_date! >= dateISO;
}

// Prešiel termín (deadline)?
export function isOverdue(t: TaskPlanRow, now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): boolean {
  if (!t.due_date || t.completed_at) return false;
  const today = zonedDate(now, timeZone);
  if (t.due_date < today) return true;
  if (t.due_date > today) return false;
  if (!t.due_time) return false; // termín „dnes“ bez času platí celý deň
  return t.due_time.slice(0, 5) < zonedTime(now, timeZone);
}

// Prešiel plán bez dokončenia? (Nestihnuté.)
export function isMissed(t: TaskPlanRow, now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): boolean {
  if (t.completed_at) return false;
  const mode = planMode(t);
  const today = zonedDate(now, timeZone);
  if (mode === "block") return new Date(t.plan_end_at!).getTime() < now.getTime();
  if (mode === "day") return t.plan_start_date! < today;
  if (mode === "range") return t.plan_end_date! < today;
  return false;
}

export type PoolSection = "missed" | "overdue" | "range" | "anytime";

// Do ktorej sekcie poolu úloha patrí, alebo null (je naplánovaná na
// dnes/budúcnosť, hotová, podúloha alebo skryté zrkadlo udalosti).
// Poradie sekcií v UI: missed (Nestihnuté), overdue (Po termíne, červené),
// range (Rozmedzie), anytime (Kedykoľvek).
export function poolSection(t: TaskPlanRow, now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): PoolSection | null {
  if (t.completed_at || t.status === "done" || t.parent_task_id || t.legacy_mirror) return null;
  const mode = planMode(t);
  const missed = isMissed(t, now, timeZone);
  const overdue = isOverdue(t, now, timeZone);
  if ((mode === "day" || mode === "block") && !missed) return null; // umiestnená na dnes/budúcnosť
  if (overdue) return "overdue";
  if (missed) return "missed";
  if (mode === "range") return "range";
  return "anytime";
}

// Zmena plánu na konkrétny deň (tlačidlo „Na [deň]“). Vráti polia na
// uloženie. postponed_count sa zvýši, ak úloha už mala naplánovaný iný deň,
// blok alebo rozmedzie (prvé naplánovanie z „kedykoľvek“ sa nepočíta).
export function planToDay(t: TaskPlanRow, dateISO: string, now: Date = new Date()) {
  const mode = planMode(t);
  const alreadyThatDay = mode === "day" && t.plan_start_date === dateISO;
  return {
    plan_start_date: dateISO,
    plan_end_date: null,
    plan_start_at: null,
    plan_end_at: null,
    plan_updated_at: now.toISOString(),
    postponed_count: (t.postponed_count || 0) + (mode !== "anytime" && !alreadyThatDay ? 1 : 0),
  };
}

// Prázdny plán (späť do „kedykoľvek“).
export function clearPlan(now: Date = new Date()) {
  return {
    plan_start_date: null,
    plan_end_date: null,
    plan_start_at: null,
    plan_end_at: null,
    plan_updated_at: now.toISOString(),
  };
}

export { addDays };
