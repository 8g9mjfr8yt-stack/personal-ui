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

// Opačná operácia k toISODate() — z "YYYY-MM-DD" spraví lokálny Date
// objekt (lokálna polnoc). Zámerne nepoužívame `new Date(iso)` — ten
// parsuje dátumový reťazec ako UTC polnoc podľa špecifikácie, čo je tu
// zbytočná nejednoznačnosť navyše; radšej rozoberieme komponenty ručne.
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
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

// 2026-09-23 oprava — 2h posun pri manuálnom zadávaní dátumu/času úlohy.
// `new Date(reťazec).toISOString()` na "naivný" (bez časového pásma)
// reťazec z <input type="datetime-local"> (formát "YYYY-MM-DDTHH:mm", bez
// sekúnd) sa v Safari správal inak než v Chrome/Firefox — namiesto lokálnej
// interpretácie ho bral rovno ako UTC, čo dávalo systematický +2h (leto)
// posun v Google Kalendári. Namiesto spoliehania sa na parsovanie reťazca
// rozoberieme komponenty ručne a poskladáme Date cez viacargumentový
// konštruktor `new Date(y, m, d, h, min, s)`, ktorý je vo VŠETKÝCH
// prehliadačoch vždy lokálny — žiadna nejednoznačnosť.
// Hodnota, ktorá už má "Z"/offset (z DB, alebo zo zrkadlenia Calendar
// udalosti), sa iba prevedie na Date normálne (offset je jednoznačný).
export function localDateTimeToISOString(value: string): string {
  const hasOffset = /Z$|[+-]\d{2}:\d{2}$/.test(value);
  if (hasOffset) return new Date(value).toISOString();
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?/);
  if (!m) return new Date(value).toISOString();
  const [, y, mo, d, h, mi, s] = m;
  return new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    s ? Number(s) : 0
  ).toISOString();
}

// Opačný smer — absolútny okamih (ISO reťazec s offsetom, typicky z DB)
// naformátuje na "YYYY-MM-DDTHH:mm" v LOKÁLNOM čase, presne formát, aký
// čaká <input type="datetime-local">. Nepoužívať `.toISOString().slice(0,
// 16)` — to by vrátilo UTC hodiny/minúty, nie lokálne (rovnaký druh chyby
// ako vyššie, len opačným smerom pri otvorení úlohy na úpravu).
export function toLocalDateTimeInputValue(value: string): string {
  const d = new Date(value);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${mi}`;
}
