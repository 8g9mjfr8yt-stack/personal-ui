import { addDaysISO } from "@/lib/dateUtils";

// Zdieľaná logika "na ktorý deň/dni sa má úloha v Kalendári/Dnes
// zobraziť" — používa ju lib/supabase/tasks.ts (getTasksInRange,
// getUnassignedTasks) aj app/(app)/calendar/page.tsx (zoskupenie podľa
// dňa, priraďovanie z poolu). Pozri komentár v migrácii
// 0009_add_task_assigned_date.sql pre kontext k `assigned_date`.
//
// 2026-09-24 — predtým sa každá úloha s `start_date` odlišným od
// `due_date` (Od/Termín "plánovacie okno", pôvodne myslené ako voľný
// rozsah "spraviť niekedy medzi") po oprave viacdňových Calendar udalostí
// omylom začala zobrazovať naprieč CELÝM svojím rozpätím v Kalendári,
// presne ako skutočná viacdňová Google Calendar udalosť — čo je správne
// LEN pre tú druhú (google_event_id nastavené). Bežná lokálna úloha s
// Od/Termín rozpätím a bez konkrétneho času patrí do poolu voľných úloh,
// kým nie je explicitne priradená na konkrétny deň (assigned_date) alebo
// nedostane konkrétny čas (scheduled_time).
export type CalendarPlaceableTask = {
  google_event_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  scheduled_time?: string | null;
  assigned_date?: string | null;
};

export function taskDisplayDays(t: CalendarPlaceableTask): string[] {
  // 1) Skutočná viacdňová Google Calendar udalosť (zrkadlená,
  //    google_event_id nastavené) — Kalendár appky je tu iba zrkadlo,
  //    zobrazí sa v CELOM svojom rozsahu (aj celodenná, aj časovaná).
  if (t.google_event_id && t.start_date && t.due_date && t.start_date !== t.due_date) {
    const days: string[] = [];
    for (let day = t.start_date; day <= t.due_date; day = addDaysISO(day, 1)) {
      days.push(day);
    }
    return days;
  }
  // 2) Konkrétny čas (scheduled_time) — vždy jeden deň, `due_date`.
  if (t.scheduled_time) {
    return t.due_date ? [t.due_date] : [];
  }
  // 3) Explicitne priradené z poolu voľných úloh (tlačidlo "Priradiť na
  //    deň") — jeden deň, nezávislý od pôvodného Od/Termín okna, ktoré
  //    ostáva nedotknuté (vďaka tomu ho "Odobrať z dňa" vie obnoviť).
  if (t.assigned_date) {
    return [t.assigned_date];
  }
  // 4) Bežná úloha s termínom bez rozpätia (start_date chýba alebo sa
  //    zhoduje s due_date) — ako doteraz, jeden deň, `due_date`.
  if (t.due_date && (!t.start_date || t.start_date === t.due_date)) {
    return [t.due_date];
  }
  // 5) Zostáva: Od≠Termín rozpätie, bez konkrétneho času, bez Google
  //    prepojenia, bez explicitného priradenia — plánovacie okno, nie
  //    umiestnenie v Kalendári. Patrí do poolu voľných úloh.
  return [];
}

export function isTaskPlacedOnCalendar(t: CalendarPlaceableTask): boolean {
  return taskDisplayDays(t).length > 0;
}
