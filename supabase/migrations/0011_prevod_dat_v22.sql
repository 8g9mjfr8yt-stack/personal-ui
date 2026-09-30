-- 0011 — OSTRÝ PREVOD DÁT na model v2.2 (2026-10-01), fáza 4 prestavby.
-- Pravidlá: NAVRH-PRESTAVBY.md 11.1 + rozhodnutia používateľa zo skúšobného
-- behu (supabase/dry-run/03_migrate.sql, 06_decisions.sql).
-- Záloha pred prevodom: schéma backup_2026_10_01, obnova:
-- supabase/restore/restore_2026_10_01.sql.
--
-- Nič sa nemaže: staré stĺpce (start_date, scheduled_time, scheduled_time_end,
-- assigned_date, google_event_id) aj tabuľky inbox/inspiration ostávajú.
-- Úlohy, ktoré už používajú model v2.2 (vytvorené v náhľade), sa nemenia.
-- Beží v jednej transakcii — pri chybe sa nezmení nič.

begin;

create table if not exists public.migration_v22_log (
  id bigserial primary key,
  task_id uuid,
  title text,
  rule text,
  at timestamptz not null default now()
);
alter table public.migration_v22_log enable row level security;

-- 1) Klasifikácia úloh
create temporary table cls on commit drop as
select t.id, t.title,
  case
    when t.plan_start_date is not null or t.plan_start_at is not null or t.gcal_event_id is not null
         or t.legacy_mirror or t.plan_updated_at is not null then 'uz_v22'
    when t.google_event_id like 'da%' then 'zrkadlo_v22_bloku'
    when t.title in ('Pomôcť Kiki preniesť gauč', 'Lokácie s Lukášom Žemberom', 'Natáčanie lokácie')
         and t.google_event_id is not null then 'rozhodnutie_udalost'
    when t.google_event_id is not null and (t.project_id is not null or t.priority is not null or t.estimated_minutes is not null
         or exists (select 1 from public.tasks s where s.parent_task_id = t.id) or t.depends_on_task_id is not null) then 'google_blok'
    when t.google_event_id is not null then 'google_zrkadlo'
    when t.scheduled_time is not null then 'blok'
    when t.assigned_date is not null then 'priradene'
    when t.start_date is not null and t.due_date is not null and t.start_date <> t.due_date then 'rozmedzie'
    when t.title = 'Všetko najlepšie k narodeninám!' and t.due_date is not null then 'rozhodnutie_udalost'
    when t.due_date is not null then 'iba_due_date'
    else 'kedykolvek'
  end as rule
from public.tasks t;

insert into public.migration_v22_log (task_id, title, rule) select id, title, rule from cls;

-- 2) Zrkadlá Google udalostí a položky rozhodnuté ako udalosti → skryté
update public.tasks t set legacy_mirror = true, due_date = null, due_time = null
from cls c where c.id = t.id and c.rule in ('google_zrkadlo', 'zrkadlo_v22_bloku', 'rozhodnutie_udalost');

-- 3) Úloha s blokom viazaným na existujúcu udalosť v Google
update public.tasks t set
  plan_start_at = case when t.scheduled_time is not null then t.scheduled_time end,
  plan_end_at = case when t.scheduled_time is not null then
                  case when t.scheduled_time_end > t.scheduled_time then t.scheduled_time_end
                       else t.scheduled_time + interval '30 minutes' end end,
  plan_start_date = case when t.scheduled_time is null then least(coalesce(t.start_date, t.due_date), coalesce(t.due_date, t.start_date)) end,
  plan_end_date = case when t.scheduled_time is null and t.start_date is not null and t.due_date is not null
                        and t.start_date <> t.due_date then greatest(t.start_date, t.due_date) end,
  gcal_event_id = case when t.scheduled_time is not null then t.google_event_id end,
  gcal_sync_state = case when t.scheduled_time is null then 'none'
                         when t.completed_at is null and t.scheduled_time > now() then 'pending'
                         else 'ok' end,
  due_date = null, due_time = null
from cls c where c.id = t.id and c.rule = 'google_blok';

update public.events e set task_id = t.id
from public.tasks t join cls c on c.id = t.id
where c.rule = 'google_blok' and t.gcal_event_id is not null and e.google_event_id = t.gcal_event_id;

-- 4) Blok bez Google (budúce nehotové sa pošlú do Google cez frontu)
update public.tasks t set
  plan_start_at = t.scheduled_time,
  plan_end_at = case when t.scheduled_time_end > t.scheduled_time then t.scheduled_time_end
                     else t.scheduled_time + interval '30 minutes' end,
  gcal_sync_state = case when t.completed_at is null and t.scheduled_time > now() then 'pending' else 'none' end,
  due_date = null, due_time = null
from cls c where c.id = t.id and c.rule = 'blok';

-- 5) Deň / rozmedzie / iba due_date (rozhodnutie D = deň plánu, bez deadlinu)
update public.tasks t set plan_start_date = t.assigned_date, due_date = null, due_time = null
from cls c where c.id = t.id and c.rule = 'priradene';

update public.tasks t set plan_start_date = least(t.start_date, t.due_date),
  plan_end_date = greatest(t.start_date, t.due_date), due_date = null, due_time = null
from cls c where c.id = t.id and c.rule = 'rozmedzie';

update public.tasks t set plan_start_date = t.due_date, due_date = null, due_time = null
from cls c where c.id = t.id and c.rule = 'iba_due_date';

update public.tasks t set due_time = null
from cls c where c.id = t.id and c.rule = 'kedykolvek';

-- 6) plan_updated_at (poradie zmien voči Google) pre prevedené úlohy
update public.tasks t set plan_updated_at = t.updated_at
from cls c where c.id = t.id and c.rule not in ('uz_v22') and t.plan_updated_at is null;

-- 7) Zápisník: pôvodné notes + inspiration + inbox → notes
update public.notes set input_source = coalesce(input_source, 'text'), legacy_table = 'notes', legacy_id = id
where legacy_table is null and created_at < '2026-09-30';

insert into public.notes (title, content, source_url, storage_path, thumbnail, why_saved,
  input_source, tags, project_id, legacy_table, legacy_id, created_at, updated_at)
select i.title, i.description, i.source_url, i.storage_url, i.thumbnail, i.why_saved,
  case when i.storage_url is not null then 'photo' when i.source_url is not null then 'link' else 'text' end,
  i.tags, i.project_id, 'inspiration', i.id, i.created_at, i.created_at
from public.inspiration i
where not exists (select 1 from public.notes n where n.legacy_table = 'inspiration' and n.legacy_id = i.id);

insert into public.notes (content, source_url, storage_path, input_source, converted_task_id,
  legacy_table, legacy_id, created_at, updated_at)
select
  case when b.input_type in ('image', 'link') then null else b.content end,
  case when b.input_type = 'link' then b.content end,
  case when b.input_type = 'image' then b.content end,
  case b.input_type when 'voice' then 'voice' when 'image' then 'photo' when 'link' then 'link' else 'text' end,
  case when b.processed_into = 'task' then b.processed_id end,
  'inbox', b.id, b.created_at, coalesce(b.processed_at, b.created_at)
from public.inbox b
where not exists (select 1 from public.notes n where n.legacy_table = 'inbox' and n.legacy_id = b.id);

commit;

-- Report
select rule, count(*) from public.migration_v22_log group by rule
union all select 'tasks spolu', count(*) from public.tasks
union all select 'tasks skryté (legacy_mirror)', count(*) from public.tasks where legacy_mirror
union all select 'tasks pending do Google', count(*) from public.tasks where gcal_sync_state = 'pending'
union all select 'notes spolu', count(*) from public.notes
order by 1;
