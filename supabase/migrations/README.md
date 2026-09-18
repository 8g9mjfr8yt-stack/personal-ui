# DB migrácie — Denný agent

Zavedené 2026-09-18 ako náhrada za doterajší postup (ručné `ALTER TABLE`
priamo v Supabase SQL Editore, so `schema.sql` aktualizovaným ručne a
niekedy oneskorene/nepresne popri tom).

**Nový postup od tohto bodu:** každá zmena databázovej schémy (nová
tabuľka, nový stĺpec, nová policy na štruktúre tabuľky a pod.) sa najprv
zapíše ako nový číslovaný `.sql` súbor v tomto priečinku a commitne do
gitu — **až potom** sa rovnaký SQL spustí v Supabase SQL Editore (naďalej
ručne cez browser/computer use, žiadny nový nástroj netreba). Číslovanie
je sekvenčné (`0001_...`, `0002_...`, ...) a názov stručne popisuje zmenu.

Toto **nie je** plné nasadenie Supabase CLI s `supabase link`/`supabase db
push` — to by pridalo komplexitu (linkovanie projektu, lokálny Postgres
na diff, ...), ktorú si projekt momentálne nežiada. Ide iba o disciplínu:
mať v git zapísané PRESNE to, čo sa v databáze reálne spustilo, v poradí,
v akom sa to stalo — aby `schema.sql` v koreni repa aj v projektových
dokumentoch (`claude/schema.sql`) nikdy nezaostávalo za realitou.

## Súbory

- `0001_baseline_2026-09-18.sql` — **nie je** to odohraná história
  jednotlivých pôvodných `ALTER TABLE` príkazov (tie sú chronologicky
  zdokumentované v `PROJECT.md`, hlavne časti 20–24). Je to snímka
  aktuálneho, už bežiaceho stavu schémy k 2026-09-18, od ktorej táto
  migračná história začína. Znovupustenie tohto súboru na už existujúcej
  databáze zlyhá (tabuľky existujú) — slúži len ako referenčný baseline
  a prípadne na obnovenie schémy na úplne novom Supabase projekte.
- Ďalšie súbory od `0002_...` vyššie sú reálne, postupne aplikované
  zmeny — každý zodpovedá presne jednému spusteniu v Supabase.

RLS policies a granty (`supabase-policies.sql` v koreni repa) ostávajú
zámerne mimo tohto priečinka — riešia oprávnenia, nie štruktúru tabuliek,
a menia sa zriedkavejšie/inak než schéma. Ak sa to v budúcnosti ukáže ako
neprehľadné, dá sa presunúť sem.
