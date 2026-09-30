-- 2026-09-30 — Fáza 3 prestavby (claude/NAVRH-PRESTAVBY.md, časti 3, 4.2, 5).
-- IBA PRIDÁVANIE: žiadny stĺpec ani tabuľka sa nemaže ani nepremenúva, súčasná
-- appka (v2.13) nové stĺpce nepoužíva a funguje bez zmeny. Staré stĺpce
-- (start_date, scheduled_time, scheduled_time_end, assigned_date,
-- google_event_id) a tabuľky inbox/inspiration sa odstránia až vo fáze 6.

-- ---------------------------------------------------------------------------
-- 1) tasks — plán, termín s časom, počítadlo odkladaní, stav syncu s Google
-- ---------------------------------------------------------------------------
alter table tasks
  add column if not exists plan_start_date date,
  add column if not exists plan_end_date date,
  add column if not exists plan_start_at timestamptz,
  add column if not exists plan_end_at timestamptz,
  add column if not exists plan_updated_at timestamptz,
  add column if not exists due_time time,
  add column if not exists postponed_count integer not null default 0,
  add column if not exists gcal_event_id text,
  add column if not exists gcal_sync_state text not null default 'none',
  add column if not exists gcal_sync_attempts integer not null default 0,
  add column if not exists gcal_last_error text,
  add column if not exists gcal_synced_at timestamptz,
  add column if not exists legacy_mirror boolean not null default false;

-- Kontroly iba na NOVÝCH stĺpcoch (4.2) — staré dáta ich nemôžu porušiť.
-- Kontroly na existujúcich stĺpcoch (status ⇔ completed_at, odhad > 0) sa
-- pridajú až vo fáze 4/5, keď ich bude rešpektovať aj kód appky a hlasu.
alter table tasks
  add constraint tasks_plan_end_date_chk
    check (plan_end_date is null or (plan_start_date is not null and plan_end_date >= plan_start_date)),
  add constraint tasks_plan_block_chk
    check ((plan_start_at is null) = (plan_end_at is null)
           and (plan_end_at is null or plan_end_at > plan_start_at)),
  add constraint tasks_plan_exclusive_chk
    check (not (plan_start_date is not null and plan_start_at is not null)),
  add constraint tasks_due_time_chk
    check (due_time is null or due_date is not null),
  add constraint tasks_postponed_chk
    check (postponed_count >= 0),
  add constraint tasks_gcal_state_chk
    check (gcal_sync_state in ('none', 'pending', 'ok', 'error'));

create index if not exists tasks_gcal_event_id_idx on tasks (gcal_event_id);
create index if not exists tasks_plan_start_date_idx on tasks (plan_start_date);
create index if not exists tasks_plan_start_at_idx on tasks (plan_start_at);

-- ---------------------------------------------------------------------------
-- 2) events — lokálna projekcia Google Kalendára (okno −30 až +180 dní)
-- ---------------------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  google_event_id text not null unique,
  title text not null,
  description text,
  location text,
  html_link text,
  color_id text,
  all_day boolean not null,
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date date,            -- VRÁTANE (Google má exkluzívny, prepočet v lib/time.ts)
  recurring_event_id text,
  task_id uuid references tasks(id) on delete set null, -- časový blok úlohy
  project_id uuid references projects(id) on delete set null,
  google_etag text,
  google_updated_at timestamptz,
  seen_at timestamptz,      -- kedy bola naposledy videná pri obnove okna
  created_at timestamptz not null default now(),
  constraint events_kind_chk check (
    (all_day and start_date is not null and end_date is not null and start_at is null and end_at is null)
    or (not all_day and start_at is not null and end_at is not null and start_date is null and end_date is null)
  ),
  constraint events_range_chk check (
    (end_date is null or end_date >= start_date) and (end_at is null or end_at >= start_at)
  )
);
create index if not exists events_start_at_idx on events (start_at);
create index if not exists events_start_date_idx on events (start_date);
create index if not exists events_task_id_idx on events (task_id);
create index if not exists events_recurring_idx on events (recurring_event_id);

alter table events enable row level security;
create policy "authenticated full access" on events
  for all to authenticated using (true) with check (true);
grant select, insert, update, delete on events to authenticated;
grant select, insert, update, delete on events to service_role;

-- stav obnovy okna
alter table calendar_sync_state
  add column if not exists window_start date,
  add column if not exists window_end date,
  add column if not exists last_refresh_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3) notes — Zápisník (neskôr nahradí inbox + inspiration)
-- ---------------------------------------------------------------------------
alter table notes
  add column if not exists source_url text,
  add column if not exists storage_path text,
  add column if not exists thumbnail text,
  add column if not exists why_saved text,
  add column if not exists input_source text not null default 'text',
  add column if not exists converted_task_id uuid references tasks(id) on delete set null,
  add column if not exists event_id uuid references events(id) on delete set null,
  add column if not exists legacy_table text,
  add column if not exists legacy_id uuid;

-- Zápis môže byť iba fotka alebo link bez textu.
alter table notes alter column content drop not null;
alter table notes
  add constraint notes_not_empty_chk
    check (content is not null or source_url is not null or storage_path is not null),
  add constraint notes_input_source_chk
    check (input_source in ('voice', 'text', 'photo', 'link', 'share', 'migrated'));

-- úloha vzniknutá zo zápisu
alter table tasks
  add column if not exists from_note_id uuid references notes(id) on delete set null;
