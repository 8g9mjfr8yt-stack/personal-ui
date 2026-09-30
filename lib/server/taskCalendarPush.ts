// Fáza 5 prestavby (NAVRH-PRESTAVBY.md, časť 5.3) — FRONTA zápisov úloh do
// Google Kalendára. Do Googlu ide iba úloha v režime „blok“ (deň + čas).
//
// Princíp:
//   - appka pri uložení úlohy iba nastaví tasks.gcal_sync_state = 'pending'
//     (jedna DB operácia — nič sa nemôže „stratiť medzi dvoma zápismi“),
//   - táto funkcia frontu spracuje: hneď po uložení (prehliadač zavolá
//     /api/calendar/push-pending) a záložne cronom (/api/cron/calendar-push),
//   - ID udalosti v Google je DETERMINISTICKÉ z id úlohy ("da" + uuid bez
//     pomlčiek) → opakovaný pokus nevytvorí duplicitu (409 = už existuje),
//   - úprava ide s If-Match (etag); pri 412 (niekto ju medzitým zmenil v
//     Google) rozhodne „novšia zmena vyhráva“ (plan_updated_at vs. updated),
//   - blok je oranžový (colorId 6), hotová úloha má v názve „✓ “,
//   - chyba nikdy neblokuje uloženie úlohy — iba gcal_sync_state = 'error'
//     a ďalší pokus (max 5).

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccessToken } from "./googleCalendarAdmin";
import { planMode, planSpan } from "@/lib/model/taskPlan";
import { spanFromGoogle, zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";

const CAL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const BLOCK_COLOR_ID = "6"; // oranžová (Tangerine) — rozhodnutie 2026-09-30
const MAX_ATTEMPTS = 5;

export function blockEventId(taskId: string): string {
  return "da" + taskId.replace(/-/g, "").toLowerCase();
}

function tz() {
  return process.env.APP_TIME_ZONE || DEFAULT_TIME_ZONE;
}

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  status: string | null;
  completed_at: string | null;
  project_id: string | null;
  plan_start_date: string | null;
  plan_end_date: string | null;
  plan_start_at: string | null;
  plan_end_at: string | null;
  plan_updated_at: string | null;
  gcal_event_id: string | null;
  gcal_sync_state: string;
  gcal_sync_attempts: number;
};

async function gfetch(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { res, body };
}

function eventToProjectionRow(e: any, taskId: string | null, projectId: string | null) {
  const span = spanFromGoogle(e.start || {}, e.end || {});
  return {
    google_event_id: e.id as string,
    title: (e.summary as string) || "(bez názvu)",
    description: e.description ?? null,
    location: e.location ?? null,
    html_link: e.htmlLink ?? null,
    color_id: e.colorId ?? null,
    all_day: span.allDay,
    start_at: span.allDay ? null : span.startAt,
    end_at: span.allDay ? null : span.endAt,
    start_date: span.allDay ? span.startDate : null,
    end_date: span.allDay ? span.endDate : null,
    recurring_event_id: e.recurringEventId ?? null,
    google_etag: e.etag ?? null,
    google_updated_at: e.updated ?? null,
    seen_at: new Date().toISOString(),
    task_id: taskId,
    project_id: projectId,
  };
}

async function deleteGoogleEvent(admin: SupabaseClient, token: string, eventId: string) {
  const { res } = await gfetch(token, `${CAL}/${encodeURIComponent(eventId)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google DELETE ${res.status}`);
  }
  await admin.from("events").delete().eq("google_event_id", eventId);
}

async function pushOne(admin: SupabaseClient, token: string, t: TaskRow): Promise<"ok" | "deleted" | "adopted"> {
  const mode = planMode(t);

  // Úloha už nie je blok → jej udalosť v Google zmazať.
  if (mode !== "block") {
    if (t.gcal_event_id) await deleteGoogleEvent(admin, token, t.gcal_event_id);
    await admin
      .from("tasks")
      .update({ gcal_event_id: null, gcal_sync_state: "none", gcal_sync_attempts: 0, gcal_last_error: null })
      .eq("id", t.id);
    return "deleted";
  }

  const span = planSpan(t)!;
  if (span.allDay) throw new Error("Blok musí mať čas.");
  const done = !!t.completed_at || t.status === "done";
  const body = {
    summary: (done ? "✓ " : "") + t.title,
    description: t.description ?? undefined,
    colorId: BLOCK_COLOR_ID,
    status: "confirmed",
    start: { dateTime: span.startAt },
    end: { dateTime: span.endAt },
    extendedProperties: { private: { da_task_id: t.id } },
  };
  const eventId = t.gcal_event_id || blockEventId(t.id);

  let adoptedTime = false;
  const { data: proj } = await admin.from("events").select("google_etag").eq("google_event_id", eventId).maybeSingle();
  const etag = proj?.google_etag as string | undefined;

  let { res, body: resBody } = await gfetch(token, `${CAL}/${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: etag ? { "If-Match": etag } : {},
    body: JSON.stringify(body),
  });

  if (res.status === 412) {
    // V Google sa udalosť medzitým zmenila. Pravidlo 5.1: pri ČASE bloku
    // vyhráva novšia zmena. Ak je novší Google, prevezmeme jeho čas do úlohy;
    // ostatné polia (názov s „✓ “, farba, značka) pošleme tak či tak.
    const cur = await gfetch(token, `${CAL}/${encodeURIComponent(eventId)}`);
    const googleNewer =
      cur.res.ok && cur.body?.updated && t.plan_updated_at &&
      new Date(cur.body.updated).getTime() > new Date(t.plan_updated_at).getTime();
    let patchBody: Record<string, unknown> = body;
    if (googleNewer && cur.body?.start?.dateTime && cur.body?.end?.dateTime) {
      const g = spanFromGoogle(cur.body.start, cur.body.end);
      if (!g.allDay) {
        await admin
          .from("tasks")
          .update({ plan_start_at: g.startAt, plan_end_at: g.endAt, plan_updated_at: cur.body.updated })
          .eq("id", t.id);
        patchBody = { ...body, start: { dateTime: g.startAt }, end: { dateTime: g.endAt } };
        adoptedTime = true;
      }
    }
    ({ res, body: resBody } = await gfetch(token, `${CAL}/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      body: JSON.stringify(patchBody),
    }));
  }

  if (res.status === 404) {
    ({ res, body: resBody } = await gfetch(token, CAL, { method: "POST", body: JSON.stringify({ id: eventId, ...body }) }));
    if (res.status === 409) {
      // ID už existuje (napr. predtým zmazaná udalosť) → obnoviť úpravou.
      ({ res, body: resBody } = await gfetch(token, `${CAL}/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }));
    }
  }

  if (!res.ok) {
    throw new Error(resBody?.error?.message || `Google ${res.status}`);
  }

  await admin
    .from("tasks")
    .update({
      gcal_event_id: eventId,
      gcal_sync_state: "ok",
      gcal_sync_attempts: 0,
      gcal_last_error: null,
      gcal_synced_at: new Date().toISOString(),
    })
    .eq("id", t.id);
  await admin.from("events").upsert(eventToProjectionRow(resBody, t.id, t.project_id), { onConflict: "google_event_id" });
  return adoptedTime ? "adopted" : "ok";
}

export async function pushPendingBlocks(
  admin: SupabaseClient,
  opts: { taskIds?: string[]; deleteEventIds?: string[] } = {}
) {
  const token = await getAccessToken();
  const result = { ok: 0, deleted: 0, adopted: 0, failed: 0, deletedEvents: 0 };
  // pozn.: kľúč „ok“ = počet úspešne zapísaných blokov

  // Udalosti zmazaných úloh (úloha už neexistuje, fronta je v prehliadači).
  for (const eventId of opts.deleteEventIds || []) {
    try {
      // Mažeme IBA bloky úloh (značka da_task_id), nikdy bežné udalosti —
      // aj keby prehliadač poslal cudzie ID.
      const cur = await gfetch(token, `${CAL}/${encodeURIComponent(eventId)}`);
      if (!cur.res.ok || !cur.body?.extendedProperties?.private?.da_task_id) continue;
      await deleteGoogleEvent(admin, token, eventId);
      result.deletedEvents++;
    } catch (err) {
      console.error("calendar-push: zmazanie bloku zlyhalo:", eventId, err);
    }
  }

  let q = admin
    .from("tasks")
    .select(
      "id,title,description,status,completed_at,project_id,plan_start_date,plan_end_date,plan_start_at,plan_end_at,plan_updated_at,gcal_event_id,gcal_sync_state,gcal_sync_attempts"
    )
    .in("gcal_sync_state", ["pending", "error"])
    .lt("gcal_sync_attempts", MAX_ATTEMPTS)
    .limit(50);
  if (opts.taskIds?.length) q = q.in("id", opts.taskIds);
  const { data, error } = await q;
  if (error) throw error;

  for (const t of (data || []) as TaskRow[]) {
    try {
      const r = await pushOne(admin, token, t);
      result[r]++;
    } catch (err) {
      result.failed++;
      await admin
        .from("tasks")
        .update({
          gcal_sync_state: "error",
          gcal_sync_attempts: (t.gcal_sync_attempts || 0) + 1,
          gcal_last_error: String((err as Error)?.message || err).slice(0, 500),
        })
        .eq("id", t.id);
    }
  }
  return result;
}

// Pre calendarProjection: zosúladiť bloky úloh s tým, čo je v Google.
//   - udalosť so značkou da_task_id sa v Google posunula (novšie ako
//     plan_updated_at) → prevziať čas do úlohy,
//   - blok zmizol z Google (zmazaný tam) → úloha ostane, stratí čas
//     (plán „deň“ podľa pôvodného začiatku).
export async function reconcileTaskBlocks(
  admin: SupabaseClient,
  googleItems: any[],
  window: { timeMin: string; timeMax: string }
) {
  const byTask = new Map<string, any>();
  for (const e of googleItems) {
    const taskId = e?.extendedProperties?.private?.da_task_id;
    if (taskId && e.status !== "cancelled") byTask.set(taskId, e);
  }
  let adopted = 0;
  let unblocked = 0;

  if (byTask.size) {
    const ids = Array.from(byTask.keys());
    const { data } = await admin
      .from("tasks")
      .select("id,plan_start_at,plan_end_at,plan_updated_at,gcal_sync_state,project_id")
      .in("id", ids);
    for (const t of data || []) {
      const e = byTask.get(t.id);
      await admin.from("events").update({ task_id: t.id }).eq("google_event_id", e.id);
      if (t.gcal_sync_state === "pending" || !e.start?.dateTime || !e.end?.dateTime) continue;
      const g = spanFromGoogle(e.start, e.end);
      if (g.allDay) continue;
      const same =
        t.plan_start_at && t.plan_end_at &&
        new Date(t.plan_start_at).getTime() === new Date(g.startAt).getTime() &&
        new Date(t.plan_end_at).getTime() === new Date(g.endAt).getTime();
      const googleNewer = !t.plan_updated_at || new Date(e.updated).getTime() > new Date(t.plan_updated_at).getTime();
      if (!same && googleNewer) {
        await admin
          .from("tasks")
          .update({ plan_start_at: g.startAt, plan_end_at: g.endAt, plan_start_date: null, plan_end_date: null, plan_updated_at: e.updated })
          .eq("id", t.id);
        adopted++;
      }
    }
  }

  // Bloky zmazané v Google.
  const { data: synced } = await admin
    .from("tasks")
    .select("id,gcal_event_id,plan_start_at")
    .eq("gcal_sync_state", "ok")
    .not("gcal_event_id", "is", null)
    .gte("plan_start_at", window.timeMin)
    .lt("plan_start_at", window.timeMax);
  const seen = new Set(googleItems.filter((e) => e.status !== "cancelled").map((e) => e.id));
  for (const t of synced || []) {
    if (seen.has(t.gcal_event_id)) continue;
    await admin
      .from("tasks")
      .update({
        plan_start_date: zonedDate(t.plan_start_at, tz()),
        plan_end_date: null,
        plan_start_at: null,
        plan_end_at: null,
        plan_updated_at: new Date().toISOString(),
        gcal_event_id: null,
        gcal_sync_state: "none",
      })
      .eq("id", t.id);
    unblocked++;
  }
  return { adopted, unblocked };
}
