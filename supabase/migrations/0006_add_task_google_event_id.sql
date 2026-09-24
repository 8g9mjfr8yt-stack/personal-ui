-- Denný agent 2.0 — obojsmerná synchronizácia úloh s dátumom/časom do
-- Google Kalendára (a naopak, pre udalosti vytvorené hlasovým agentom cez
-- create_calendar_event). google_event_id prepája riadok v `tasks` s
-- konkrétnou udalosťou v Google Calendari; vyplnené iba pre úlohy, ktoré
-- vznikli ako zrkadlenie kalendárnej udalosti, alebo pre ktoré bola
-- udalosť vytvorená (pozri lib/supabase/tasks.ts a lib/gemini/calendarTools.ts).
alter table tasks add column if not exists google_event_id text;
create index if not exists tasks_google_event_id_idx on tasks (google_event_id);
