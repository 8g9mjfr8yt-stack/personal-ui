
-- Fáza 4.5 (2026-09-13) — perzistentná pamäť agenta naprieč rozhovormi.
-- Pozri PROJECT.md časť 23, "Tri vrstvy pamäte" / "Hypotézy o používateľovi".
create table agent_memory (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  category text not null default 'fact', -- fact / preference / pattern / hypothesis / rule
  status text not null default 'active', -- active / superseded / rejected
  evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_agent_memory_updated_at before update on agent_memory
  for each row execute function set_updated_at();
