-- Denný agent — Supabase DB schema — BASELINE SNAPSHOT k 2026-09-18.
--
-- Toto NIE je odohraná história jednotlivých ALTER TABLE príkazov — je to
-- snímka aktuálneho, už bežiaceho stavu schémy, od ktorej začína nová
-- migračná disciplína (pozri README.md v tomto priečinku). Chronologická
-- história zmien je zdokumentovaná v PROJECT.md (časti 20-24).
--
-- Spustenie tohto súboru na už existujúcej databáze zlyhá (tabuľky
-- existujú) — slúži ako referencia / obnova na novom projekte.

create extension if not exists pgcrypto;

-- GOALS (dlhodobé ciele)
create table goals (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- PROJECTS (oblasti práce / konkrétne projekty)
create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'active',
  priority text,
  goal_id uuid references goals(id) on delete set null,
  start_date date,
  deadline date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TASKS (konkrétne akcie)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'todo',
  priority text,
  project_id uuid references projects(id) on delete set null,
  due_date date,
  scheduled_time timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Fáza 3 leftovers (2026-09-14), pôvodne pridané cez ALTER TABLE po
  -- živom teste hlasového agenta — pozri PROJECT.md časť 22:
  start_date date, -- najskorší deň, kedy sa má úloha robiť (spolu s
                    -- due_date = časové okno "od-do")
  depends_on_task_id uuid references tasks(id) on delete set null, -- táto
                    -- úloha dáva zmysel až po dokončení inej úlohy
  context text      -- voľná fuzzy podmienka/spúšťač, nie dátum (napr. "keď
                    -- si požičiam vŕtačku", "keď bude pekný víkend") —
                    -- zatiaľ iba úložisko, bez automatického sledovania
);

-- NOTES (vlastné myšlienky a poznámky)
create table notes (
  id uuid primary key default gen_random_uuid(),
  title text,
  content text not null,
  project_id uuid references projects(id) on delete set null,
  tags text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- INSPIRATION (externý/vizuálny obsah)
create table inspiration (
  id uuid primary key default gen_random_uuid(),
  title text,
  description text,
  source_type text,
  source_url text,
  storage_url text,
  thumbnail text,
  tags text[],
  project_id uuid references projects(id) on delete set null,
  why_saved text,
  created_at timestamptz not null default now()
);

-- INBOX (rýchle zachytávanie, AI spracuje neskôr)
create table inbox (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  input_type text not null default 'text', -- text / voice / image / link
  status text not null default 'pending',  -- pending / processed
  processed_into text,   -- task / note / inspiration / project / goal
  processed_id uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- DAILY_LOG (história dní)
create table daily_log (
  id uuid primary key default gen_random_uuid(),
  log_date date not null unique,
  summary text,
  notes text,
  created_at timestamptz not null default now()
);

-- AGENT_MEMORY (perzistentná pamäť hlasového agenta naprieč rozhovormi,
-- Fáza 4.5, pridaná 2026-09-13 — pozri PROJECT.md časť 23)
create table agent_memory (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  category text not null default 'fact', -- fact / preference / pattern / hypothesis / rule
  status text not null default 'active', -- active / superseded / rejected
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- automatické nastavovanie updated_at pri zmene riadku
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_goals_updated_at before update on goals
  for each row execute function set_updated_at();
create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function set_updated_at();
create trigger trg_notes_updated_at before update on notes
  for each row execute function set_updated_at();
create trigger trg_agent_memory_updated_at before update on agent_memory
  for each row execute function set_updated_at();

-- Poznámka: automatic RLS je v projekte zapnuté (event trigger v Supabase),
-- takže všetky tabuľky vyššie majú RLS enabled bez policies.
-- anon/authenticated role nemajú default žiaden prístup.
-- service_role (použije n8n) RLS obchádza úplne.
-- Policies pre Personal UI (Fáza 2, s auth) + storage.objects policy pre
-- bucket `inspiration` (Fáza 3 leftovers, 2026-09-14) sú v
-- supabase-policies.sql (koreň tohto repa).
