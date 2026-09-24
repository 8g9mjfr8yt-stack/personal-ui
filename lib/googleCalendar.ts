// Prehliadačová vrstva pre Google Calendar — rovnaký fast-path vzor ako
// priame Supabase volania (žiadny n8n v hot path, pozri PROJECT.md časť 23).
// Prehliadač si najprv vypýta krátkodobý access_token z
// /api/google-calendar-token (server drží client secret aj refresh_token,
// do prehliadača sa neposielajú) a potom volá Google Calendar REST API v3
// priamo, bez ďalšieho backendu.

const CALENDAR_ID = "primary";
const TIME_ZONE = "Europe/Bratislava";

async function getAccessToken(): Promise<string> {
  const res = await fetch("/api/google-calendar-token", { method: "POST" });
  const data = await res.json().catch(() => ({}) as any);
  if (!res.ok) {
    throw new Error(data?.error || "Nepodarilo sa získať prístupový token pre Google Calendar.");
  }
  return data.access_token as string;
}

async function calendarFetch(path: string, init?: RequestInit) {
  const accessToken = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as any);
    // eslint-disable-next-line no-console
    console.error("[calendar-sync] calendarFetch chyba:", res.status, body);
    throw new Error(body?.error?.message || `Google Calendar API vrátilo chybu ${res.status}.`);
  }
  if (res.status === 204) return null;
  return await res.json();
}

// Prevedie jednoduchý reťazec dátumu/času na formát, ktorý čaká Google
// Calendar API:
// - "2026-09-20" (bez času) → celodenná udalosť ({ date })
// - "2026-09-20T14:00:00" alebo iný ISO reťazec → časovaná udalosť
//   ({ dateTime, timeZone })
function toEventTime(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { date: value };
  }
  // 2026-09-24 oprava — ak hodnota už obsahuje explicitný UTC/offset
  // marker ("Z" z new Date().toISOString(), alebo "+02:00"), Google
  // Calendar z nej vie presný okamih sám. NEPRIKLADAŤ vtedy aj
  // `timeZone` — Google API to v kombinácii s absolútnym dateTime
  // vedelo posunúť o offset navyše (reálny test: udalosti vytvorené
  // synchronizáciou úloh sa v kalendári ukazovali o 2h posunuté).
  // `timeZone` priložíme iba k "naivným" hodnotám bez posunu (typicky z
  // hlasového agenta), kde ju interpretujeme ako bratislavský miestny čas.
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(value);
  return hasOffset ? { dateTime: value } : { dateTime: value, timeZone: TIME_ZONE };
}

function simplifyEvent(e: any) {
  return {
    id: e.id,
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    status: e.status,
  };
}

export async function listCalendarEvents(params: {
  time_min?: string;
  time_max?: string;
  query?: string;
  max_results?: number;
}) {
  const search = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: String(params?.max_results || 20),
  });
  if (params?.time_min) search.set("timeMin", new Date(params.time_min).toISOString());
  if (params?.time_max) search.set("timeMax", new Date(params.time_max).toISOString());
  if (params?.query) search.set("q", params.query);

  const data = await calendarFetch(
    `/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${search.toString()}`
  );
  return (data?.items || []).map(simplifyEvent);
}

export async function getCalendarEvent(eventId: string) {
  if (!eventId) throw new Error("get_calendar_event: chýba 'event_id'.");
  const data = await calendarFetch(
    `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`
  );
  return simplifyEvent(data);
}

export async function createCalendarEvent(args: {
  summary: string;
  description?: string;
  location?: string;
  start_datetime: string;
  end_datetime: string;
}) {
  const body = {
    summary: args.summary,
    description: args.description,
    location: args.location,
    start: toEventTime(args.start_datetime),
    end: toEventTime(args.end_datetime),
  };
  const data = await calendarFetch(`/calendars/${encodeURIComponent(CALENDAR_ID)}/events`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return simplifyEvent(data);
}

// Čiastočná úprava — rovnaký princíp ako partial update pre tasks/projects
// (lib/supabase/*.ts): posiela iba polia, ktoré boli naozaj zadané, takže
// nezadané polia v Google Calendari ostanú nezmenené.
export async function updateCalendarEvent(args: {
  event_id: string;
  summary?: string;
  description?: string;
  location?: string;
  start_datetime?: string;
  end_datetime?: string;
}) {
  if (!args.event_id) throw new Error("update_calendar_event: chýba 'event_id'.");

  const body: Record<string, unknown> = {};
  if (args.summary !== undefined) body.summary = args.summary;
  if (args.description !== undefined) body.description = args.description;
  if (args.location !== undefined) body.location = args.location;
  if (args.start_datetime !== undefined) body.start = toEventTime(args.start_datetime);
  if (args.end_datetime !== undefined) body.end = toEventTime(args.end_datetime);

  const data = await calendarFetch(
    `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(args.event_id)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
  return simplifyEvent(data);
}

export async function deleteCalendarEvent(eventId: string) {
  if (!eventId) throw new Error("delete_calendar_event: chýba 'event_id'.");
  await calendarFetch(
    `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );
  return { id: eventId, deleted: true };
}
