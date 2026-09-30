-- Fáza 2 — report skúšobného prevodu. Každý riadok "kontrola" musí mať ok = true.
with
  src as (
    select (select count(*) from migration_dry.src_tasks) t,
           (select count(*) from migration_dry.src_notes) n,
           (select count(*) from migration_dry.src_inspiration) i,
           (select count(*) from migration_dry.src_inbox) b),
  dst as (
    select (select count(*) from migration_dry.tasks_new) t,
           (select count(*) from migration_dry.notes_new where legacy_table = 'notes') n,
           (select count(*) from migration_dry.notes_new where legacy_table = 'inspiration') i,
           (select count(*) from migration_dry.notes_new where legacy_table = 'inbox') b)
select 'kontrola: úlohy zdroj = prevedené' as riadok, src.t::text || ' = ' || dst.t as hodnota, src.t = dst.t as ok from src, dst
union all select 'kontrola: notes', src.n || ' = ' || dst.n, src.n = dst.n from src, dst
union all select 'kontrola: inspiration', src.i || ' = ' || dst.i, src.i = dst.i from src, dst
union all select 'kontrola: inbox', src.b || ' = ' || dst.b, src.b = dst.b from src, dst
union all select 'kontrola: každá Google väzba má udalosť',
  (select count(*) from migration_dry.src_tasks s where s.google_event_id is not null
     and not exists (select 1 from migration_dry.events e where e.google_event_id = s.google_event_id))::text || ' bez udalosti',
  not exists (select 1 from migration_dry.src_tasks s where s.google_event_id is not null
     and not exists (select 1 from migration_dry.events e where e.google_event_id = s.google_event_id))
-- porušenia pravidiel 4.2 v novom modeli (musia byť 0)
union all select 'pravidlo 4.2/1 plan_end_date', count(*)::text, count(*) = 0 from migration_dry.tasks_new
  where plan_end_date is not null and (plan_start_date is null or plan_end_date < plan_start_date)
union all select 'pravidlo 4.2/2 blok od–do', count(*)::text, count(*) = 0 from migration_dry.tasks_new
  where (plan_start_at is null) <> (plan_end_at is null) or plan_end_at <= plan_start_at
union all select 'pravidlo 4.2/3 deň aj blok naraz', count(*)::text, count(*) = 0 from migration_dry.tasks_new
  where plan_start_date is not null and plan_start_at is not null
union all select 'pravidlo 4.2/5 status done ⇔ completed_at', count(*)::text, count(*) = 0 from migration_dry.tasks_new
  where (status = 'done') <> (completed_at is not null)
union all select 'pravidlo 4.2/6 sám na seba', count(*)::text, count(*) = 0 from migration_dry.tasks_new
  where parent_task_id = id or depends_on_task_id = id
union all select 'pravidlo 4.2/7 odhad > 0', count(*)::text, count(*) = 0 from migration_dry.tasks_new
  where estimated_minutes is not null and estimated_minutes <= 0
union all select 'udalosti: celý deň / čas konzistentné', count(*)::text, count(*) = 0 from migration_dry.events
  where (all_day and (start_date is null or end_date is null or start_at is not null))
     or (not all_day and (start_at is null or end_at is null or end_at < start_at))
union all select 'zápisník: prázdny záznam', count(*)::text, count(*) = 0 from migration_dry.notes_new
  where content is null and source_url is null and storage_path is null
-- prehľad
union all select 'úlohy podľa pravidla: ' || migration_rule, count(*)::text, null from migration_dry.tasks_new group by migration_rule
union all select 'z toho skryté zrkadlá (nehotové, stratia odškrtnutie)',
  count(*) filter (where completed_at is null)::text || ' nehotové / ' || count(*) || ' spolu', null
  from migration_dry.tasks_new where legacy_mirror
union all select 'udalosti: ' || source, count(*)::text, null from migration_dry.events group by source
union all select 'zápisník podľa pôvodu: ' || input_source, count(*)::text, null from migration_dry.notes_new group by input_source
union all select 'na kontrolu: ' || issue, count(*)::text, null from migration_dry.migration_review group by issue
union all select 'bloky čakajúce na odoslanie do Google (pending)', count(*)::text, null from migration_dry.tasks_new where gcal_sync_state = 'pending';
