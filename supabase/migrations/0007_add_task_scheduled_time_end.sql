-- Denný agent 2.0 — voliteľný čas konca pre presne časované úlohy
-- (predtým sa dal zadať iba začiatok, Google Calendar udalosť dostávala
-- natvrdo 30 min dĺžku). Keď je vyplnený, synchronizácia s Google
-- Kalendárom (lib/supabase/tasks.ts) ho použije namiesto default +30 min.
alter table tasks add column if not exists scheduled_time_end timestamptz;
