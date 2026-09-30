-- Fáza 2 — skúšobný prevod: kópia zdrojových dát do schémy migration_dry.
-- Ostré tabuľky v public sa iba čítajú.
create schema if not exists migration_dry;

drop table if exists migration_dry.src_tasks;
drop table if exists migration_dry.src_notes;
drop table if exists migration_dry.src_inspiration;
drop table if exists migration_dry.src_inbox;

create table migration_dry.src_tasks as table public.tasks;
create table migration_dry.src_notes as table public.notes;
create table migration_dry.src_inspiration as table public.inspiration;
create table migration_dry.src_inbox as table public.inbox;

select 'tasks' as tabulka, count(*) from migration_dry.src_tasks
union all select 'notes', count(*) from migration_dry.src_notes
union all select 'inspiration', count(*) from migration_dry.src_inspiration
union all select 'inbox', count(*) from migration_dry.src_inbox;
