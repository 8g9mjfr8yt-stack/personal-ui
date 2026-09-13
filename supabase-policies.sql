-- Denný agent — RLS policies pre Personal UI (Fáza 2)
--
-- Spustiť v Supabase dashboard -> SQL Editor.
--
-- Kontext: všetky tabuľky majú RLS zapnuté bez policies (Phase 1),
-- takže anon aj authenticated role zatiaľ nemajú žiadny prístup.
-- Toto pridá pravidlo "prihlásený používateľ má plný prístup" —
-- keďže ide o jednopoužívateľský systém, nerozlišujeme vlastníctvo
-- riadkov podľa user_id.
--
-- DÔLEŽITÉ: po prvom prihlásení (ktoré vytvorí tvoj účet) choď do
-- Authentication -> Settings a vypni "Allow new users to sign up"
-- (alebo obmedz povolené e-mailové domény), aby si sa nikto iný
-- nemohol cez magic link zaregistrovať a získať týmto prístup k dátam.

create policy "authenticated full access" on goals
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on projects
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on tasks
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on notes
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on inspiration
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on inbox
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on daily_log
  for all to authenticated using (true) with check (true);

-- RLS policies riešia len úroveň riadkov. Phase 1 dala explicitný GRANT
-- iba role service_role, takže authenticated rola nemá ani základné
-- Postgres práva na tabuľky (chyba "permission denied for table ...").
-- Toto ich doplní:

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  goals, projects, tasks, notes, inspiration, inbox, daily_log
to authenticated;

-- Fáza 4.5 (2026-09-13) — agent_memory (perzistentná pamäť)
create policy "authenticated full access" on agent_memory
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on agent_memory to authenticated;
