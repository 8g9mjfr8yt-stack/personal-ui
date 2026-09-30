-- NÚDZOVÁ OBNOVA dát zo zálohy pred prepnutím na v2.2 (2026-10-01).
-- Spustiť v Supabase SQL editore IBA pri návrate na v2.13.
-- Záloha: schéma backup_2026_10_01 (kópie všetkých tabuliek public).
-- Prepíše obsah tabuliek public stavom zo zálohy. Tabuľky/stĺpce
-- pridané po zálohe sa neodstraňujú (v2.13 ich ignoruje).
begin;
set local session_replication_role = replica; -- dočasne bez FK kontrol a triggerov (kruhové FK tasks <-> notes)
do $$
declare r record; cols text;
begin
  for r in select tablename from pg_tables where schemaname = 'backup_2026_10_01' loop
    execute format('delete from public.%I', r.tablename);
    select string_agg(format('%I', b.column_name), ', ')
      into cols
      from information_schema.columns b
      join information_schema.columns p
        on p.table_schema = 'public' and p.table_name = b.table_name and p.column_name = b.column_name
     where b.table_schema = 'backup_2026_10_01' and b.table_name = r.tablename;
    execute format('insert into public.%I (%s) select %s from backup_2026_10_01.%I', r.tablename, cols, cols, r.tablename);
  end loop;
end $$;
commit;

-- kontrola počtov
select t.tablename,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.tablename), false, true, '')))[1]::text::int as public_rows,
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from backup_2026_10_01.%I', t.tablename), false, true, '')))[1]::text::int as backup_rows
from pg_tables t where t.schemaname = 'backup_2026_10_01' order by 1;
