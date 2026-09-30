-- Fáza 2 — nový dátový model (NAVRH-PRESTAVBY.md časť 3) v schéme migration_dry.
-- DB kontroly z časti 4.2 sa tu ešte NEpridávajú ako constraints — ich
-- porušenia vypíše 04_report.sql (pri ostrom prevode pôjdu do migration_review).

drop table if exists migration_dry.events;
drop table if exists migration_dry.notes_new;
drop table if exists migration_dry.tasks_new;
drop table if exists migration_dry.migration_review;
drop table if exists migration_dry.migration_log;

create table migration_dry.tasks_new (
  id uuid primary key,                 -- zachované pôvodné id (FK podúloh a závislostí ostanú platné)
  title text not null,
  description text,
  status text not null,
  priority text,
  project_id uuid,
  parent_task_id uuid,
  depends_on_task_id uuid,
  context text,
  estimated_minutes integer,
  plan_start_date date,
  plan_end_date date,
  plan_start_at timestamptz,
  plan_end_at timestamptz,
  plan_updated_at timestamptz,
  due_date date,
  due_time time,
  postponed_count integer not null default 0,
  from_note_id uuid,
  gcal_event_id text,
  gcal_sync_state text not null default 'none',
  gcal_sync_attempts integer not null default 0,
  gcal_last_error text,
  gcal_synced_at timestamptz,
  legacy_mirror boolean not null default false, -- zrkadlo Google udalosti, skryté v UI, zmaže sa vo fáze 6
  migration_rule text not null,                 -- ktoré pravidlo 11.1 sa použilo
  completed_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table migration_dry.events (
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
  end_date date,          -- vrátane
  recurring_event_id text,
  task_id uuid,           -- časový blok úlohy
  project_id uuid,
  google_etag text,
  google_updated_at timestamptz,
  seen_at timestamptz,
  source text not null    -- 'task_mirror' (z dnešného zrkadla) / 'task_block'
);

create table migration_dry.notes_new (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text,
  source_url text,
  storage_path text,
  thumbnail text,
  why_saved text,
  input_source text not null,
  converted_task_id uuid,
  tags text[],
  project_id uuid,
  event_id uuid,
  legacy_table text not null,
  legacy_id uuid not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table migration_dry.migration_review (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id uuid not null,
  issue text not null,
  proposed_mapping jsonb,
  decision text,
  decided_at timestamptz
);

create table migration_dry.migration_log (
  id bigserial primary key,
  step text not null,
  count bigint,
  at timestamptz not null default now()
);
