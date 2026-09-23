-- 0004_add_task_parent_id.sql
--
-- Denný agent 2.0 (redizajn UI, redesign-2-0 branch) — podpora podúloh
-- na obrazovke "Dnes": jedna úloha sa dá rozdeliť na menšie kroky a
-- odklikávať ich jednotlivo; postup sa premieta do progress-ring vedľa
-- úlohy (podiel dokončených podúloh, bez zobrazovania čísel).
--
-- parent_task_id je nullable self-referencing FK na tasks.id:
--   - NULL           => bežná (top-level) úloha, prípadne aj podúloha
--                       nemá zmysel, ak je NULL.
--   - not NULL       => táto úloha je podúloha úlohy s daným id.
-- on delete cascade: zmazanie rodičovskej úlohy zmaže aj jej podúlohy
-- (podúloha samostatne bez rodiča nedáva zmysel).
--
-- Zámerne NEpridávame check-constraint obmedzujúci hĺbku vnorenia —
-- UI (Dnes / Projekty) zobrazuje iba jednu úroveň podúloh, ale schéma to
-- netlačí, aby sme sa nemuseli vracať k migrácii kvôli UI rozhodnutiu.

alter table tasks
  add column parent_task_id uuid references tasks(id) on delete cascade;

create index if not exists idx_tasks_parent_task_id on tasks(parent_task_id);
