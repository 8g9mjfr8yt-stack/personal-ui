// Fáza 3 prestavby (NAVRH-PRESTAVBY.md, časť 5.2) — nová synchronizácia
// Google Kalendár → tabuľka `events` ako OBNOVA OKNA S REKONCILIÁCIOU.
//
// Beží v TIEŇOVOM režime: popri starej synchronizácii (googleCalendarSync.ts,
// zrkadlo do `tasks`), ktorú appka v2.13 ďalej používa. `events` zatiaľ nikto
// nečíta — slúži na porovnanie, či nová synchronizácia dáva rovnaké výsledky.
//
// Postup:
//   1. okno = dnes −30 až +180 dní (miestny čas APP_TIME_ZONE)
//   2. events.list(timeMin, timeMax, singleEvents=true) so stránkovaním —
//      BEZ syncToken (ten sa s oknom kombinovať nesmie, pozri časť 5.2)
//   3. upsert podľa google_event_id; task_id a project_id sa pri upserte
//      NEPREPISUJÚ (tie nastavuje appka, nie Google)
//   4. čo sa pri tejto obnove nevidelo (zmazané v Google alebo mimo okna),
//      sa z `events` zmaže — `events` je iba projekcia, Google má originál.
//      Mazanie beží LEN po úplne úspešnom stiahnutí všetkých strán.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken } from "./googleCalendarAdmin";
import { addDays, dayBounds, spanFromGoogle, zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";

const CALENDAR_ID = "primary";
const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 180;

export type ProjectionResult = {
  windowStart: string;
  windowEnd: string;
  fetched: number;
  upserted: number;
  deleted: number;
  skippedDelete: boolean;
  ms: number;
};

function appTimeZone(): string {
  return process.env.APP_TIME_ZONE || DEFAULT_TIME_ZONE;
}

export async function refreshCalendarProjection(admin: SupabaseClient): Promise<ProjectionResult> {
  const started = Date.now();
  const refreshStartedAt = new Date(started).toISOString();
  const tz = appTimeZone();
  const today = zonedDate(new Date(), tz);
  const windowStart = addDays(today, -WINDOW_PAST_DAYS);
  const windowEnd = addDays(today, WINDOW_FUTURE_DAYS);
  const timeMin = dayBounds(windowStart, tz).start;
  const timeMax = dayBounds(windowEnd, tz).end;

  const accessToken = await getAccessToken();

  // 1) Stiahnuť celé okno (všetky strany) — až potom čokoľvek meniť.
  const items: any[] = [];
  let pageToken: string | undefined;
  do {
    const search = new URLSearchParams({
      singleEvents: "true",
      maxResults: "250",
      timeMin,
      timeMax,
    });
    if (pageToken) search.set("pageToken", pageToken);
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${search.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || `Google events.list zlyhalo (${res.status}).`);
    }
    items.push(...(data.items || []));
    pageToken = data.nextPageToken || undefined;
  } while (pageToken);

  // 2) Prevod na riadky `events`.
  const rows = items
    .filter((e) => e.id && e.status !== "cancelled" && (e.start?.date || e.start?.dateTime))
    .map((e) => {
      const span = spanFromGoogle(e.start || {}, e.end || {});
      return {
        google_event_id: e.id as string,
        title: (e.summary as string) || "(bez názvu)",
        description: (e.description as string) ?? null,
        location: (e.location as string) ?? null,
        html_link: (e.htmlLink as string) ?? null,
        color_id: (e.colorId as string) ?? null,
        all_day: span.allDay,
        start_at: span.allDay ? null : span.startAt,
        end_at: span.allDay ? null : span.endAt,
        start_date: span.allDay ? span.startDate : null,
        end_date: span.allDay ? span.endDate : null,
        recurring_event_id: (e.recurringEventId as string) ?? null,
        google_etag: (e.etag as string) ?? null,
        google_updated_at: (e.updated as string) ?? null,
        seen_at: refreshStartedAt,
      };
    });

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await admin.from("events").upsert(chunk, { onConflict: "google_event_id" });
    if (error) throw error;
    upserted += chunk.length;
  }

  // 3) Rekonciliácia — zmazať, čo sa pri tejto obnove nevidelo.
  //    Poistka: ak Google nevrátil nič, ale v tabuľke je veľa riadkov,
  //    radšej nemazať (skôr chyba než naozaj prázdny kalendár).
  let deleted = 0;
  let skippedDelete = false;
  const { count: existing } = await admin.from("events").select("id", { count: "exact", head: true });
  if (rows.length === 0 && (existing || 0) > 5) {
    skippedDelete = true;
    console.warn("calendar-projection: Google vrátil 0 udalostí, mazanie preskočené.");
  } else {
    const { error, count } = await admin
      .from("events")
      .delete({ count: "exact" })
      .or(`seen_at.is.null,seen_at.lt.${refreshStartedAt}`);
    if (error) throw error;
    deleted = count || 0;
  }

  await admin.from("calendar_sync_state").upsert({
    id: "primary",
    window_start: windowStart,
    window_end: windowEnd,
    last_refresh_at: refreshStartedAt,
    updated_at: new Date().toISOString(),
  });

  return {
    windowStart,
    windowEnd,
    fetched: items.length,
    upserted,
    deleted,
    skippedDelete,
    ms: Date.now() - started,
  };
}
