# Skúšobný prevod dát (fáza 2 prestavby)

Pozri `claude/NAVRH-PRESTAVBY.md` (časti 3, 4.2, 11.1) v projekte.

Všetko beží v samostatnej schéme **`migration_dry`** — ostré tabuľky v `public`
sa **nemenia**, appka ani hlasový agent túto schému nepoužívajú.

Poradie spustenia v Supabase SQL Editore:

1. `01_copy.sql` — vytvorí schému a skopíruje `tasks`, `notes`, `inspiration`, `inbox`.
2. `02_schema.sql` — nové tabuľky (`tasks_new`, `events`, `notes_new`, `migration_review`, `migration_log`).
3. `03_migrate.sql` — prevod podľa pravidiel 11.1 (nič sa nemaže).
4. `04_report.sql` — súčty a kontroly (zdroj = prevedené + na kontrole, porušenia pravidiel 4.2).
5. `05_review_list.sql` — zoznam nejednoznačných úloh na rozhodnutie.

Opakovateľné: každý skript najprv zmaže a znova vytvorí svoje tabuľky v `migration_dry`.
Úplné odstránenie: `drop schema migration_dry cascade;`
