-- Denný agent 2.0 — obojsmerná synchronizácia, druhá časť (2026-09-24):
-- doteraz sme do úloh zrkadlili iba zmeny urobené cez nášho hlasového
-- agenta (create/update/delete_calendar_event). Aby sa premietli aj
-- úpravy urobené PRIAMO v Google Kalendári (appka/web), napojíme sa na
-- Google Calendar Push Notifications (webhook) — pozri
-- lib/server/googleCalendarSync.ts, app/api/calendar-webhook/route.ts a
-- app/api/cron/renew-calendar-watch/route.ts.
--
-- Jediný riadok (id = 'primary') drží stav jedného "watch" kanála na
-- primárnom kalendári a Google `syncToken` pre inkrementálnu
-- synchronizáciu (events.list so syncToken vráti iba to, čo sa zmenilo
-- od minula, nie celý kalendár nanovo).
create table if not exists calendar_sync_state (
  id text primary key default 'primary',
  channel_id text,
  resource_id text,
  channel_expiration timestamptz,
  sync_token text,
  updated_at timestamptz not null default now()
);
