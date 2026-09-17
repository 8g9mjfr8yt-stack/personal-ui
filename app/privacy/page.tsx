export const metadata = {
  title: "Ochrana súkromia — Denný agent",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-neutral-900">
      <h1 className="mb-6 text-2xl font-semibold">Ochrana súkromia</h1>

      <p className="mb-4 text-sm text-neutral-500">Posledná aktualizácia: 17. 9. 2026</p>

      <p className="mb-4">
        „Denný agent" je súkromná osobná aplikácia. Nie je verejná služba —
        používa ju výhradne jej autor (michal.kebis.fd@gmail.com) na
        organizáciu vlastných dní, úloh a kalendára.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Aké dáta appka spracúva</h2>
      <p className="mb-4">
        Appka pristupuje k vlastnému Google Kalendáru autora (čítanie,
        vytváranie, úprava a mazanie udalostí) na základe Google OAuth
        súhlasu udeleného priamo autorom. Ďalej ukladá vlastné úlohy,
        projekty a poznámky autora v databáze Supabase.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Zdieľanie dát</h2>
      <p className="mb-4">
        Dáta sa nezdieľajú s tretími stranami, nepredávajú sa a
        nepoužívajú sa na reklamu. Prístupové tokeny (napr. Google
        Calendar) sú uložené iba na serveroch autora a nie sú nikdy
        posielané do prehliadača.
      </p>

      <h2 className="mb-2 mt-8 text-lg font-semibold">Kontakt</h2>
      <p className="mb-4">
        Otázky ohľadom tejto stránky: michal.kebis.fd@gmail.com.
      </p>
    </main>
  );
}
