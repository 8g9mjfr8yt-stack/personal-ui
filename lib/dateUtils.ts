// Zdieľané pomocné funkcie na prácu s LOKÁLNYM kalendárnym dátumom.
//
// DÔLEŽITÉ: nikdy nepoužívať `date.toISOString().slice(0, 10)` na Date
// objekt vytvorený z lokálneho času (napr. `new Date()` alebo
// `new Date(y, m, d)`) — toISOString() prevádza na UTC, čo pre kladné
// časové pásmo (napr. Slovensko UTC+1/+2) systematicky vráti VČEREJŠÍ
// dátum pri Date objektoch nastavených na lokálnu polnoc. Presne toto
// spôsobovalo bug v Kalendári 2.0, kde sa po návrate na stránku
// zvýrazňoval nesprávny (nasledujúci) deň namiesto dnešného.
//
// Namiesto toho vždy používaj toISODate() nižšie — číta lokálne
// komponenty dátumu bez akejkoľvek časovej konverzie.
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

// Začiatok (pondelok, lokálna polnoc) týždňa, ktorý obsahuje daný deň.
export function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}
