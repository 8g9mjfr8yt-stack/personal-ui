# Denný agent — Personal UI (Fáza 2)

Jednoduché webové UI pre Denného agenta: Next.js (App Router, TypeScript,
Tailwind) + Supabase Auth (magic link) + Supabase ako zdroj dát. Bežať má
na Macu aj iPhone (cez prehliadač, dá sa "Pridať na plochu" ako PWA neskôr).

Hotovo v tomto kroku:

- Prihlásenie cez magic link (bez hesla)
- Ochrana všetkých stránok (neprihlásený je presmerovaný na `/login`)
- Navigácia: Today, Tasks, Projects, Inbox, Inspiration, Notes
- **Today** stránka reálne číta dnešné úlohy zo Supabase (`tasks` tabuľka)
- Ostatné stránky sú zatiaľ placeholder — dorobia sa v ďalších krokoch

## 1. Nastavenie

Tento projekt bol vygenerovaný ručne (bez `create-next-app`), pretože
cloudové prostredie, v ktorom bol vytvorený, nemá prístup k npm registry.
Preto je prvý krok inštalácia závislostí priamo na tvojom Macu:

```bash
cd "~/Documents/kody apky weby/personal-ui"
npm install
```

## 2. Environment premenné

```bash
cp .env.local.example .env.local
```

Otvor `.env.local` a doplň:

- `NEXT_PUBLIC_SUPABASE_URL` — mal by už byť vyplnený (URL tvojho Supabase projektu, bez `/rest/v1/` na konci)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — **anon public** alebo **publishable** kľúč zo Supabase dashboard -> Project Settings -> API. Nikdy sem nedávaj `secret`/`service_role` kľúč — ten by sa dostal do frontend kódu a bol by verejne viditeľný.

## 3. RLS policies

Doteraz majú všetky tabuľky RLS zapnuté bez pravidiel (Phase 1), takže appka
by bez ďalšieho kroku nevidela žiadne dáta. V Supabase dashboarde otvor
**SQL Editor** a spusti obsah `supabase-policies.sql` z tohto priečinka.

Po prvom prihlásení (vytvorí tvoj účet) choď do **Authentication -> Settings**
a vypni **"Allow new users to sign up"**, aby sa cez magic link nemohol
zaregistrovať nikto iný a získať tak prístup k tvojim dátam.

## 4. Spustenie

```bash
npm run dev
```

Otvor `http://localhost:3000` — presmeruje ťa na `/login`, zadaj svoj e-mail,
klikni na odkaz, ktorý ti príde do mailu, a dostaneš sa na `/today`.

## 5. Nasadenie (neskôr)

Plán je nasadiť na Vercel free tier (viaže sa na GitHub repo, alebo
`vercel deploy` priamo z priečinka). Netreba riešiť teraz — najprv over,
že appka lokálne funguje.

## Štruktúra

```text
app/
  layout.tsx           koreňový layout
  page.tsx              redirect na /today
  login/page.tsx        prihlásenie (magic link)
  auth/callback/route.ts spracovanie magic link odkazu
  (app)/layout.tsx       layout s navigáciou pre chránené stránky
  (app)/today/page.tsx   dnešné úlohy (funkčné)
  (app)/tasks/page.tsx        placeholder
  (app)/projects/page.tsx     placeholder
  (app)/inbox/page.tsx        placeholder
  (app)/inspiration/page.tsx  placeholder
  (app)/notes/page.tsx        placeholder
components/
  NavBar.tsx             navigácia + odhlásenie
lib/supabase/
  client.ts              Supabase klient pre Client Components
  server.ts               Supabase klient pre Server Components/Route Handlers
middleware.ts             ochrana stránok + obnova session
supabase-policies.sql     RLS policies na spustenie v Supabase SQL Editore
```

