-- Fáza 2 — prevod dát podľa NAVRH-PRESTAVBY.md 11.1 (skúšobne, v migration_dry).
-- NIČ SA NEMAŽE: každý zdrojový riadok skončí v novej tabuľke; nejednoznačné
-- prípady navyše dostanú záznam v migration_review.

truncate migration_dry.tasks_new, migration_dry.events, migration_dry.notes_new,
         migration_dry.migration_review, migration_dry.migration_log;

-- ---------------------------------------------------------------------------
-- 1) Klasifikácia úloh
-- ---------------------------------------------------------------------------
drop table if exists migration_dry.cls;
create table migration_dry.cls as
select t.*,
  case
    -- Google väzba + znaky skutočnej úlohy (projekt, priorita, odhad,
    -- podúlohy, závislosť) → úloha s časovým blokom, nie zrkadlo udalosti
    when t.google_event_id is not null and (
         t.project_id is not null or t.priority is not null or t.estimated_minutes is not null
         or exists (select 1 from migration_dry.src_tasks s where s.parent_task_id = t.id)
         or t.depends_on_task_id is not null)
      then 'google_blok'
    when t.google_event_id is not null then 'google_zrkadlo'
    when t.scheduled_time is not null then 'blok'
    when t.assigned_date is not null then 'priradene'
    when t.start_date is not null and t.due_date is not null and t.start_date <> t.due_date then 'rozmedzie'
    when t.due_date is not null then 'iba_due_date'
    else 'kedykolvek'
  end as rule
from migration_dry.src_tasks t;

insert into migration_dry.tasks_new (
  id, title, description, status, priority, project_id, parent_task_id, depends_on_task_id,
  context, estimated_minutes,
  plan_start_date, plan_end_date, plan_start_at, plan_end_at, plan_updated_at,
  due_date, due_time, gcal_event_id, gcal_sync_state, legacy_mirror, migration_rule,
  completed_at, created_at, updated_at)
select
  c.id, c.title, c.description, c.status, c.priority, c.project_id, c.parent_task_id, c.depends_on_task_id,
  c.context, c.estimated_minutes,
  -- plan: celé dni
  case
    when c.rule = 'google_blok' and c.scheduled_time is null then coalesce(c.start_date, c.due_date)
    when c.rule = 'priradene' then c.assigned_date
    when c.rule = 'rozmedzie' then least(c.start_date, c.due_date)
    when c.rule = 'iba_due_date' then c.due_date          -- NÁVRH, ide na kontrolu
  end,
  case
    when c.rule = 'google_blok' and c.scheduled_time is null and c.start_date is not null
         and c.due_date is not null and c.due_date <> c.start_date then c.due_date
    when c.rule = 'rozmedzie' then greatest(c.start_date, c.due_date)
  end,
  -- plan: časový blok
  case when c.rule in ('google_blok', 'blok') and c.scheduled_time is not null then c.scheduled_time end,
  case when c.rule in ('google_blok', 'blok') and c.scheduled_time is not null then
    case when c.scheduled_time_end is not null and c.scheduled_time_end > c.scheduled_time
         then c.scheduled_time_end
         else c.scheduled_time + interval '30 minutes' end
  end,
  c.updated_at,
  -- termín (deadline): pri prevode sa nikde automaticky nenastavuje —
  -- pôvodný due_date ostáva v src_tasks a rozhodne sa v migration_review
  null, null,
  case when c.rule = 'google_blok' then c.google_event_id end,
  case
    -- budúce nehotové bloky sa pri prevode znova pošlú do Google, aby dostali
    -- oranžovú farbu a značku da_task_id (bez nej ich appka nevie zmazať)
    when c.rule = 'google_blok' and c.completed_at is null and c.scheduled_time > now() then 'pending'
    when c.rule = 'google_blok' then 'ok'
    when c.rule = 'blok' and c.completed_at is null and c.scheduled_time > now() then 'pending'
    else 'none'  -- hotové alebo minulé bloky bez Google sa do kalendára dodatočne neposielajú
  end,
  c.rule = 'google_zrkadlo',
  c.rule,
  c.completed_at, c.created_at, c.updated_at
from migration_dry.cls c;

-- ---------------------------------------------------------------------------
-- 2) Udalosti z dnešných zrkadiel a blokov
--    (pri ostrom prevode ich doplní/obnoví plná obnova okna z Google)
-- ---------------------------------------------------------------------------
insert into migration_dry.events (
  google_event_id, title, description, all_day, start_at, end_at, start_date, end_date,
  task_id, project_id, source)
select
  c.google_event_id, c.title, c.description,
  c.scheduled_time is null,
  c.scheduled_time,
  case when c.scheduled_time is not null then coalesce(c.scheduled_time_end, c.scheduled_time) end,
  case when c.scheduled_time is null then coalesce(c.start_date, c.due_date) end,
  case when c.scheduled_time is null then coalesce(c.due_date, c.start_date) end,
  case when c.rule = 'google_blok' then c.id end,
  c.project_id,
  case when c.rule = 'google_blok' then 'task_block' else 'task_mirror' end
from migration_dry.cls c
where c.google_event_id is not null
order by c.updated_at desc
on conflict (google_event_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Na kontrolu
-- ---------------------------------------------------------------------------
insert into migration_dry.migration_review (source_table, source_id, issue, proposed_mapping)
select 'tasks', c.id,
  'iba due_date: je to deň plánu, termín (deadline), alebo oboje?',
  jsonb_build_object('title', c.title, 'due_date', c.due_date, 'status', c.status,
                     'navrh', 'plan_start_date = due_date, bez deadlinu')
from migration_dry.cls c where c.rule = 'iba_due_date';

insert into migration_dry.migration_review (source_table, source_id, issue, proposed_mapping)
select 'tasks', c.id, 'koniec času je pred začiatkom — použitý začiatok + 30 min',
  jsonb_build_object('title', c.title, 'scheduled_time', c.scheduled_time, 'scheduled_time_end', c.scheduled_time_end)
from migration_dry.cls c where c.scheduled_time_end is not null and c.scheduled_time_end <= c.scheduled_time;

insert into migration_dry.migration_review (source_table, source_id, issue, proposed_mapping)
select 'tasks', c.id, 'Od je po Termíne — dni zoradené automaticky',
  jsonb_build_object('title', c.title, 'start_date', c.start_date, 'due_date', c.due_date)
from migration_dry.cls c where c.start_date > c.due_date;

insert into migration_dry.migration_review (source_table, source_id, issue, proposed_mapping)
select 'tasks', c.id, 'duplicitné google_event_id — udalosť vytvorená iba raz',
  jsonb_build_object('title', c.title, 'google_event_id', c.google_event_id)
from migration_dry.cls c
where c.google_event_id is not null
  and not exists (select 1 from migration_dry.events e where e.google_event_id = c.google_event_id
                  and (e.task_id = c.id or e.title = c.title));

-- ---------------------------------------------------------------------------
-- 4) Zápisník: notes + inspiration + inbox → notes_new
-- ---------------------------------------------------------------------------
insert into migration_dry.notes_new (title, content, input_source, tags, project_id,
  legacy_table, legacy_id, created_at, updated_at)
select n.title, n.content, 'text', n.tags, n.project_id, 'notes', n.id, n.created_at, n.updated_at
from migration_dry.src_notes n;

insert into migration_dry.notes_new (title, content, source_url, storage_path, thumbnail, why_saved,
  input_source, tags, project_id, legacy_table, legacy_id, created_at, updated_at)
select i.title, i.description, i.source_url, i.storage_url, i.thumbnail, i.why_saved,
  case when i.storage_url is not null then 'photo' when i.source_url is not null then 'link' else 'text' end,
  i.tags, i.project_id, 'inspiration', i.id, i.created_at, i.created_at
from migration_dry.src_inspiration i;

insert into migration_dry.notes_new (content, source_url, storage_path, input_source, converted_task_id,
  legacy_table, legacy_id, created_at, updated_at)
select
  case when b.input_type in ('image', 'link') then null else b.content end,
  case when b.input_type = 'link' then b.content end,
  case when b.input_type = 'image' then b.content end,
  case b.input_type when 'voice' then 'voice' when 'image' then 'photo' when 'link' then 'link' else 'text' end,
  case when b.processed_into = 'task' then b.processed_id end,
  'inbox', b.id, b.created_at, coalesce(b.processed_at, b.created_at)
from migration_dry.src_inbox b;

-- ---------------------------------------------------------------------------
-- 5) Log
-- ---------------------------------------------------------------------------
insert into migration_dry.migration_log (step, count)
select 'tasks_new', count(*) from migration_dry.tasks_new
union all select 'events', count(*) from migration_dry.events
union all select 'notes_new', count(*) from migration_dry.notes_new
union all select 'migration_review', count(*) from migration_dry.migration_review;

select step, count from migration_dry.migration_log order by id;
