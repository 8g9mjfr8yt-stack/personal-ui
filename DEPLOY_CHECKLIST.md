# Deploy checklist — Denný agent (Personal UI)

Zaviedol sa 2026-09-18 po opakovaných incidentoch, keď sa zmena javila
ako "nefunguje", hoci šlo len o chýbajúci krok v tomto postupe (pozri
PROJECT.md časti 22c, 26, 27).

Po každej zmene kódu alebo Environment Variable v tomto repozitári prejdi
tieto kroky **v poradí**:

1. **`npx tsc --noEmit`** — musí prejsť bez chýb.
   ⚠️ Toto NEKONTROLUJE ESLint. `next build` na Verceli ESLint spúšťa a
   berie jeho chyby ako fatálne (napr. `react/no-unescaped-entities`) —
   `tsc` môže prejsť čisto, aj keď je produkčný build rozbitý (časť 26).

2. **Commit** zmien.

3. **`git push origin main`** — toto musíš urobiť **ty sám** v Termináli.
   Cloudové prostredie nemá prístup na GitHub (403 z proxy). Bez pushu sa
   zmena nikdy nedostane na Vercel, aj keď je lokálny commit v poriadku
   (presne toto spôsobilo tri nahlásené "nefunguje" problémy — časť 22c).

4. **Skontroluj build vo Vercel dashboarde** (Deployments → najnovší
   deployment → status je "Ready", nie "Error"). Nespoliehaj sa iba na
   krok 1.

5. **Over naživo** na `personal-ui-gilt.vercel.app` — skutočne vyskúšaj
   novú funkciu (hlasom aj/alebo cez UI), nielen že sa stránka načíta.

6. **Ak si menil Environment Variable vo Verceli** (napr. refresh token):
   - Pri kopírovaní hodnoty z `.env.local` skontroluj, že si označil
     **iba hodnotu za `=`**, nikdy celý `KEY=VALUE` riadok (presne toto
     spôsobilo `invalid_grant` bug — časť 27). Pri type "Config" si to
     vieš spätne overiť pohľadom do poľa Value po uložení.
   - Po uložení spusti **Redeploy** (Deployments → Redeploy). Zmena env
     premennej sama osebe neovplyvní už bežiace serverless funkcie, kým
     nevznikne nový deployment.

Známe úskalia z reálnych incidentov (podrobnosti v PROJECT.md):

- Commit bez push → appka beží na starom kóde (časť 22c).
- `tsc --noEmit` prejde, produkčný build je aj tak rozbitý cez ESLint
  (časť 26).
- Zle skopírovaná env premenná s prefixom názvu prejde cez Vercel UI bez
  varovania, kým sa nespustí Redeploy a neotestuje naživo (časť 27).
