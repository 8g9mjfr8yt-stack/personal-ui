// Server-only obojsmerná synchronizácia Google Kalendára do tabuľky
// `tasks` — druhá časť (2026-09-24), pozri komentár v migrácii
// 0008_add_calendar_sync_state.sql. Zachytáva úplne akúkoľvek zmenu v
// primárnom kalendári (aj priamu úpravu v Google Kalendár appke/webe, nie
// iba cez nášho hlasového agenta) cez Google Calendar Push Notifications:
//   1. ensureWatchChannel() zaregistruje/obnoví "watch" kanál na
//      primárnom kalendári — Google potom na WEBHOOK_URL posiela
//      notifikáciu (bez dát o udalosti) vždy, keď sa niečo zmení.
//   2. app/api/calendar-webhook/route.ts takúto notifikáciu prijme a
//      zavolá runIncrementalSync().
//   3. runIncrementalSync() cez uložený `sync_token` stiahne iba to, čo sa
//      naozaj zmenilo (Google `events.list` s `syncToken`), a pre každú
//      zmenenú udalosť upraví/vytvorí/zmaže zodpovedajúcu úlohu — vždy
//      priamym `.insert()/.update()/.delete()`, NIE cez
//      createTask/updateTask/deleteTask (rovnaký dôvod ako v
//      lib/gemini/calendarTools.ts: vyhnúť sa nekonečnej slučke naspäť do
//      Google Kalendára).
//   4. Kanál platí max ~týždeň — app/api/cron/renew-calendar-watch/route.ts
//      (denný Vercel Cron) volá ensureWatchChannel(), ktorá obnoví kanál,
//      keď mu čoskoro vyprší platnosť (alebo ešte neexistuje).

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { getAccessToken, localDateInBratislava } from "./googleCalendarAdmin";
import { addDaysISO } from "@/lib/dateUtils";

const CALENDAR_ID = "primary";
const SYNC_STATE_ID = "primary";

type SyncState = {
  id: string;
  channel_id: string | null;
  resource_id: string | null;
  channel_expiration: string | null;
  sync_token: string | null;
};

async function getSyncState(admin: SupabaseClient): Promise<SyncState | null> {
  const { data, error } = await admin
    .from("calendar_sync_state")
    .select("*")
    .eq("id", SYNC_STATE_ID)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function saveSyncState(admin: SupabaseClient, patch: Partial<SyncState>) {
  const { error } = await admin
    .from("calendar_sync_state")
    .upsert({ id: SYNC_STATE_ID, ...patch, updated_at: new Date().toISOString() });
  if (error) throw error;
}

function webhookUrl(): string {
  const base = process.env.CALENDAR_WEBHOOK_BASE_URL;
  if (!base) {
    throw new Error(
      "Chýba CALENDAR_WEBHOOK_BASE_URL (má byť produkčná URL appky, napr. https://personal-ui-gilt.vercel.app)."
    );
  }
  return `${base.replace(/\/$/, "")}/api/calendar-webhook`;
}

// Zaregistruje nový "watch" kanál na primárnom kalendári, ak ešte žiadny
// neexistuje, alebo ak tomu súčasnému onedlho (do 48h) vyprší platnosť.
// Best-effort zastaví starý kanál (channels.stop) — chyba pri zastavovaní
// (napr. už dávno vypršaný) sa iba zaloguje, nezablokuje vytvorenie nového.
export async function ensureWatchChannel(admin: SupabaseClient): Promise<{
  renewed: boolean;
  expiration: string | null;
}> {
  const state = await getSyncState(admin);
  const expiresAt = state?.channel_expiration ? new Date(state.channel_expiration).getTime() : 0;
  const soon = Date.now() + 48 * 60 * 60 * 1000;
  if (state?.channel_id && expiresAt > soon) {
    return { renewed: false, expiration: state.channel_expiration };
  }

  const accessToken = await getAccessToken();

  if (state?.channel_id && state.resource_id) {
    try {
      await fetch("https://www.googleapis.com/calendar/v3/channels/stop", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ id: state.channel_id, resourceId: state.resource_id }),
      });
    } catch (err) {
      console.error("ensureWatchChannel: nepodarilo sa zastaviť starý kanál (ignorujem):", err);
    }
  }

  const channelId = randomUUID();
  const token = process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN;
  if (!token) throw new Error("Chýba GOOGLE_CALENDAR_WEBHOOK_TOKEN.");

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events/watch`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: channelId,
        type: "web_hook",
        address: webhookUrl(),
        token,
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google Calendar watch() zlyhalo (${res.status}).`);
  }

  const expiration = data.expiration ? new Date(Number(data.expiration)).toISOString() : null;
  await saveSyncState(admin, {
    channel_id: channelId,
    resource_id: data.resourceId,
    channel_expiration: expiration,
  });
  return { renewed: true, expiration };
}

// 2026-09-24 — viacdňové udalosti: predtým sa ukladal iba `due_date` =
// prvý deň, takže sa v Kalendári appky zobrazovali len na prvom dni.
// Teraz nastavujeme aj `start_date`, nech úloha "pokrýva" celý rozsah
// (Kalendár stránka appky (app/(app)/calendar/page.tsx) rovnakú úlohu
// vykreslí do KAŽDÉHO dňa medzi start_date a due_date — je to stále
// jeden riadok v `tasks`, takže úprava z ktoréhokoľvek dňa upraví
// tú istú udalosť všade). Google pri celodenných udalostiach vracia
// `end.date` EXKLUZÍVNE (deň PO poslednom dni) — posledný skutočný deň
// je preto `addDaysISO(end.date, -1)`.
function eventToTaskFields(event: any) {
  const allDay = !!event.start?.date;
  const startRaw: string | undefined = event.start?.date || event.start?.dateTime;
  const endRaw: string | undefined = event.end?.date || event.end?.dateTime;

  const startDate = startRaw ? (allDay ? startRaw : localDateInBratislava(startRaw)) : null;
  let dueDate = startDate;
  if (endRaw) {
    dueDate = allDay ? addDaysISO(endRaw, -1) : localDateInBratislava(endRaw);
  }

  return {
    title: event.summary || "(bez názvu)",
    description: event.description || null,
    start_date: startDate,
    due_date: dueDate,
    scheduled_time: allDay ? null : startRaw || null,
    scheduled_time_end: allDay ? null : endRaw || null,
  };
}

// Spracuje dávku zmenených udalostí z events.list a premietne ich do
// `tasks`. Vracia počty pre logovanie/diagnostiku.
//
// Zámerne dávkovo (nie sekvenčne po jednej udalosti): pri prvotnom
// (neinkrementálnom) syncu môže ísť o desiatky-stovky udalostí naraz a
// sekvenčné volania (1-2 DB round-tripy na udalosť, čakajúc na každú)
// vedeli spoľahlivo prekročiť timeout serverless funkcie.
async function applyEvents(admin: SupabaseClient, events: any[]) {
  const cancelledIds = events.filter((e) => e.id && e.status === "cancelled").map((e) => e.id);
  const active = events.filter((e) => e.id && e.status !== "cancelled");

  let deleted = 0;
  if (cancelledIds.length > 0) {
    const { error, count } = await admin
      .from("tasks")
      .delete({ count: "exact" })
      .in("google_event_id", cancelledIds);
    if (error) console.error("calendar-sync: zmazanie úloh zlyhalo:", error);
    else if (count) deleted = count;
  }

  if (active.length === 0) return { created: 0, updated: 0, deleted };

  const activeIds = active.map((e) => e.id);
  const { data: existingRows, error: selErr } = await admin
    .from("tasks")
    .select("id, google_event_id")
    .in("google_event_id", activeIds);
  if (selErr) {
    console.error("calendar-sync: vyhľadanie úloh zlyhalo:", selErr);
    return { created: 0, updated: 0, deleted };
  }
  const existingByEventId = new Map((existingRows || []).map((r) => [r.google_event_id as string, r.id as string]));

  const toInsert = active
    .filter((e) => !existingByEventId.has(e.id))
    .map((e) => ({ ...eventToTaskFields(e), google_event_id: e.id }));
  const toUpdate = active.filter((e) => existingByEventId.has(e.id));

  let created = 0;
  if (toInsert.length > 0) {
    const { error, count } = await admin.from("tasks").insert(toInsert, { count: "exact" } as any);
    if (error) console.error("calendar-sync: vytvorenie úloh zlyhalo:", error);
    else created = count || toInsert.length;
  }

  let updated = 0;
  if (toUpdate.length > 0) {
    const results = await Promise.all(
      toUpdate.map((e) =>
        admin
          .from("tasks")
          .update(eventToTaskFields(e))
          .eq("id", existingByEventId.get(e.id) as string)
      )
    );
    for (const r of results) {
      if (r.error) console.error("calendar-sync: aktualizácia úlohy zlyhala:", r.error);
      else updated += 1;
    }
  }

  return { created, updated, deleted };
}

// Hlavná synchronizačná funkcia — zavolaná z webhooku pri každej
// notifikácii, aj (ako záložná sieť) z denného cronu. Používa uložený
// `sync_token`, ak existuje (rýchle, iba zmeny od minula); ak Google
// token odmietne ako neplatný (410 Gone — bežné po dlhšej pauze alebo
// zmene nastavení kalendára), spraví kompletný resync od nuly.
export async function runIncrementalSync(admin: SupabaseClient) {
  const accessToken = await getAccessToken();
  const state = await getSyncState(admin);

  let pageToken: string | undefined;
  let syncToken = state?.sync_token || undefined;
  let nextSyncToken: string | undefined;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalDeleted = 0;
  let fullResync = false;

  do {
    const search = new URLSearchParams({ singleEvents: "true", maxResults: "250" });
    if (pageToken) {
      search.set("pageToken", pageToken);
    } else if (syncToken) {
      search.set("syncToken", syncToken);
    } else {
      // Prvotný (nie inkrementálny) sync — Google dovoľuje timeMin/timeMax
      // iba TU, nie pri nasledujúcich syncToken volaniach (tie by ich
      // ignorovali/chybovali). Toto ohraničenie sa potom "prilepí" k
      // vydanému syncTokenu na celú jeho životnosť — zámerne neťaháme
      // celú históriu kalendára (pomalé, aj zbytočné), iba nedávnu
      // minulosť a rozumný kus budúcnosti.
      const now = Date.now();
      search.set("timeMin", new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString());
      search.set("timeMax", new Date(now + 400 * 24 * 60 * 60 * 1000).toISOString());
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${search.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const data = await res.json();

    if (!res.ok) {
      if (res.status === 410 && syncToken && !fullResync) {
        // syncToken už neplatný — začni odznova bez neho (plný resync).
        fullResync = true;
        syncToken = undefined;
        pageToken = undefined;
        continue;
      }
      throw new Error(data?.error?.message || `Google Calendar events.list zlyhalo (${res.status}).`);
    }

    const { created, updated, deleted } = await applyEvents(admin, data.items || []);
    totalCreated += created;
    totalUpdated += updated;
    totalDeleted += deleted;

    pageToken = data.nextPageToken || undefined;
    if (data.nextSyncToken) nextSyncToken = data.nextSyncToken;
  } while (pageToken);

  if (nextSyncToken) {
    await saveSyncState(admin, { sync_token: nextSyncToken });
  }

  return { created: totalCreated, updated: totalUpdated, deleted: totalDeleted, fullResync };
}
