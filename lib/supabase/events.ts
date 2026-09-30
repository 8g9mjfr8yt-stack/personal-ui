// Fáza 5 — čítanie udalostí z `events` (projekcia Google Kalendára).
// Zapisuje sem iba server (calendarProjection / taskCalendarPush); appka
// udalosti mení cez Google API (lib/googleCalendar.ts) a výsledok sa sem
// dostane najbližšou obnovou okna.
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dayBounds, DEFAULT_TIME_ZONE } from "@/lib/time";

export type EventRow = {
  id: string;
  google_event_id: string;
  title: string;
  description: string | null;
  location: string | null;
  html_link: string | null;
  color_id: string | null;
  all_day: boolean;
  start_at: string | null;
  end_at: string | null;
  start_date: string | null;
  end_date: string | null;
  recurring_event_id: string | null;
  task_id: string | null;
  project_id: string | null;
};

// Udalosti, ktoré prekrývajú dni [startDate, endDateExclusive) — rovnaké
// pravidlo ako spanOverlapsDay v lib/time.ts, ale priamo v SQL.
export async function getEventsInRange(
  supabase: SupabaseClient,
  startDate: string,
  endDateExclusive: string,
  timeZone: string = DEFAULT_TIME_ZONE
): Promise<EventRow[]> {
  const from = dayBounds(startDate, timeZone).start;
  const to = dayBounds(addDays(endDateExclusive, -1), timeZone).end;
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .or(
      `and(all_day.eq.false,start_at.lt.${to},end_at.gt.${from}),` +
        `and(all_day.eq.true,start_date.lt.${endDateExclusive},end_date.gte.${startDate})`
    )
    .order("start_at", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return (data || []) as EventRow[];
}

export async function setEventProject(supabase: SupabaseClient, eventId: string, projectId: string | null) {
  const { error } = await supabase.from("events").update({ project_id: projectId }).eq("id", eventId);
  if (error) throw error;
}
