-- Fáza 2 — zoznam úloh na rozhodnutie (D = deň plánu, T = termín, O = oboje).
select row_number() over (order by (proposed_mapping->>'due_date'), proposed_mapping->>'title') as c,
  proposed_mapping->>'title' as uloha,
  proposed_mapping->>'due_date' as datum,
  proposed_mapping->>'status' as stav,
  (select p.name from public.projects p join migration_dry.src_tasks t on t.project_id = p.id where t.id = r.source_id) as projekt,
  (select t.parent_task_id is not null from migration_dry.src_tasks t where t.id = r.source_id) as poduloha
from migration_dry.migration_review r
where issue like 'iba due_date%'
order by 1;
