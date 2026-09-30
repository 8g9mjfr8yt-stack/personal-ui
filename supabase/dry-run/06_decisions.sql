-- Fáza 2 — rozhodnutia používateľa k položkám na kontrolu (2026-09-30).
-- Pri ostrom prevode (fáza 4) sa rovnaké rozhodnutia použijú znova.
--
-- A) úlohy iba s due_date: všetky = D (deň plánu, bez deadlinu),
--    okrem „Všetko najlepšie k narodeninám!“ = udalosť (celodenná, 21. 11.).
-- B) Google väzba + znaky úlohy: úloha s blokom (Ú) okrem
--    „Pomôcť Kiki preniesť gauč“, „Lokácie s Lukášom Žemberom“,
--    „Natáčanie lokácie“ = udalosti.

-- A: D pre všetky okrem narodenín
update migration_dry.migration_review r
set decision = 'D', decided_at = now()
where r.issue like 'iba due_date%'
  and r.proposed_mapping->>'title' <> 'Všetko najlepšie k narodeninám!';

-- A: narodeniny → udalosť (v Google sa vytvorí pri ostrom prevode)
update migration_dry.migration_review r
set decision = 'E', decided_at = now()
where r.issue like 'iba due_date%'
  and r.proposed_mapping->>'title' = 'Všetko najlepšie k narodeninám!';

insert into migration_dry.events (google_event_id, title, description, all_day, start_date, end_date, project_id, source)
select 'PENDING-' || t.id, t.title, t.description, true, t.due_date, t.due_date, t.project_id, 'from_task_pending_google'
from migration_dry.src_tasks t
where t.title = 'Všetko najlepšie k narodeninám!' and t.google_event_id is null
on conflict (google_event_id) do nothing;

update migration_dry.tasks_new
set legacy_mirror = true, plan_start_date = null, migration_rule = 'rozhodnutie: udalosť'
where title = 'Všetko najlepšie k narodeninám!' and migration_rule = 'iba_due_date';

-- B: tri položky sú udalosti, nie úlohy
with ev as (
  select id from migration_dry.tasks_new
  where migration_rule = 'google_blok'
    and title in ('Pomôcť Kiki preniesť gauč', 'Lokácie s Lukášom Žemberom', 'Natáčanie lokácie')
)
update migration_dry.tasks_new t
set legacy_mirror = true, plan_start_date = null, plan_end_date = null,
    plan_start_at = null, plan_end_at = null, gcal_event_id = null, gcal_sync_state = 'none',
    migration_rule = 'rozhodnutie: udalosť'
from ev where t.id = ev.id;

update migration_dry.events e
set task_id = null, source = 'task_mirror'
where e.source = 'task_block'
  and e.title in ('Pomôcť Kiki preniesť gauč', 'Lokácie s Lukášom Žemberom', 'Natáčanie lokácie');

insert into migration_dry.migration_log (step, count)
select 'rozhodnutia: review s rozhodnutím', count(*) from migration_dry.migration_review where decision is not null
union all select 'rozhodnutia: review bez rozhodnutia', count(*) from migration_dry.migration_review where decision is null
union all select 'rozhodnutia: úlohy s blokom (google_blok)', count(*) from migration_dry.tasks_new where migration_rule = 'google_blok'
union all select 'rozhodnutia: položky zmenené na udalosť', count(*) from migration_dry.tasks_new where migration_rule = 'rozhodnutie: udalosť';

select step, count from migration_dry.migration_log where step like 'rozhodnutia:%' order by id;
