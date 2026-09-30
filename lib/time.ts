// Spoločná časová logika Denného agenta (NAVRH-PRESTAVBY.md, časť 4.1).
//
// Cieľ: JEDINÉ miesto, kde sa prepočítava čas medzi „miestnym časom“
// (Europe/Bratislava alebo iné APP_TIME_ZONE) a absolútnym okamihom (UTC),
// kde sa počíta, na ktoré dni patrí udalosť, a kde sa prekladajú
// celodenné udalosti Google Kalendára (exkluzívny koniec).
//
// Pravidlá:
// - Nikdy nezávisí od časového pásma zariadenia/servera — pásmo je vždy
//   parameter (server beží v UTC, telefón môže byť v zahraničí).
// - Celé dni sú reťazce "YYYY-MM-DD", nie Date o polnoci.
// - Časované úseky majú koniec EXKLUZÍVNY (udalosť 20:00–00:00 patrí iba
//   do prvého dňa).
// - Súbor je bez závislostí a bez "@/..." importov, aby ho vedeli spustiť
//   aj testy (`npm run test:time`) priamo v Node.
//
// Zatiaľ ho appka nepoužíva — je to základ pre fázu 3 prestavby. Staré
// pomocné funkcie (lib/dateUtils.ts, lib/server/googleCalendarAdmin.ts)
// sa naň prepoja postupne.

export const DEFAULT_TIME_ZONE = "Europe/Bratislava";

const MS_MIN = 60_000;
const MS_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Dátumy "YYYY-MM-DD" (čisté kalendárne dni, bez časového pásma)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function addDays(dateISO: string, days: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10); // bezpečné: dt je UTC polnoc
}

// Zoznam dní od `from` po `to` vrátane.
export function daysBetweenInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Časové pásmo
// ---------------------------------------------------------------------------

type WallParts = { y: number; m: number; d: number; h: number; mi: number; s: number };

function wallPartsAt(instantMs: number, timeZone: string): WallParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

// Posun pásma v danom okamihu v ms (napr. +2 h v lete v Bratislave).
export function offsetMs(instantMs: number, timeZone: string): number {
  const p = wallPartsAt(instantMs, timeZone);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / MS_MIN) * MS_MIN;
}

// Miestny dátum a čas okamihu v pásme.
export function zonedDate(instant: Date | string | number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = wallPartsAt(new Date(instant).getTime(), timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function zonedTime(instant: Date | string | number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = wallPartsAt(new Date(instant).getTime(), timeZone);
  return `${pad(p.h)}:${pad(p.mi)}`;
}

// "YYYY-MM-DDTHH:mm:ss" v miestnom čase pásma (formát pre hlasového agenta).
export function zonedDateTime(instant: Date | string | number, timeZone: string = DEFAULT_TIME_ZONE): string {
  const p = wallPartsAt(new Date(instant).getTime(), timeZone);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}`;
}

// Prevod „naivného“ miestneho času (bez posunu, napr. z hlasu alebo z
// <input type="datetime-local">) na UTC ISO reťazec.
// - Hodnota s posunom ("Z" alebo "+02:00") sa iba normalizuje.
// - Pri jesennom prechode (čas nastane 2×, napr. 25. 10. 02:30) sa berie
//   PRVÝ výskyt (letný čas).
// - Pri jarnom prechode (čas neexistuje, napr. 28. 3. 02:30) sa posunie
//   dopredu o dĺžku medzery (→ 03:30 letného času).
export function localToUtc(value: string, timeZone: string = DEFAULT_TIME_ZONE): string {
  if (/Z$|[+-]\d{2}:\d{2}$/.test(value)) return new Date(value).toISOString();
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) throw new Error(`Neplatný miestny čas: "${value}"`);
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);

  const before = offsetMs(wall - MS_DAY, timeZone);
  const after = offsetMs(wall + MS_DAY, timeZone);
  const candidates = [...new Set([before, after])]
    .map((off) => wall - off)
    .filter((t) => wall - t === offsetMs(t, timeZone))
    .sort((a, b) => a - b);

  const t = candidates.length ? candidates[0] : wall - before; // medzera → posun dopredu
  return new Date(t).toISOString();
}

// Začiatok a koniec (exkluzívny) miestneho dňa ako UTC okamihy.
// Deň prechodu na zimný čas má 25 h, na letný 23 h.
export function dayBounds(dateISO: string, timeZone: string = DEFAULT_TIME_ZONE): { start: string; end: string } {
  return {
    start: localToUtc(`${dateISO}T00:00:00`, timeZone),
    end: localToUtc(`${addDays(dateISO, 1)}T00:00:00`, timeZone),
  };
}

// ---------------------------------------------------------------------------
// Úseky (udalosti, časové bloky) a dni, na ktoré patria
// ---------------------------------------------------------------------------

export type Span =
  | { allDay: true; startDate: string; endDate: string } // endDate VRÁTANE
  | { allDay: false; startAt: string; endAt: string }; // endAt EXKLUZÍVNE

export function isValidSpan(span: Span): boolean {
  if (span.allDay) {
    return isISODate(span.startDate) && isISODate(span.endDate) && span.endDate >= span.startDate;
  }
  const a = new Date(span.startAt).getTime();
  const b = new Date(span.endAt).getTime();
  return Number.isFinite(a) && Number.isFinite(b) && b >= a;
}

// Na ktoré miestne dni sa úsek zobrazí.
export function spanDays(span: Span, timeZone: string = DEFAULT_TIME_ZONE): string[] {
  if (!isValidSpan(span)) return [];
  if (span.allDay) return daysBetweenInclusive(span.startDate, span.endDate);
  const startMs = new Date(span.startAt).getTime();
  const endMs = new Date(span.endAt).getTime();
  const first = zonedDate(startMs, timeZone);
  // Koniec je exkluzívny: udalosť končiaca presne o polnoci nepatrí do
  // nasledujúceho dňa. Nulové trvanie (koniec = začiatok) = jeden deň.
  const last = endMs > startMs ? zonedDate(endMs - 1, timeZone) : first;
  return daysBetweenInclusive(first, last);
}

// Prekrýva úsek daný miestny deň? (Rovnaké pravidlo, aké bude v SQL.)
export function spanOverlapsDay(span: Span, dateISO: string, timeZone: string = DEFAULT_TIME_ZONE): boolean {
  if (!isValidSpan(span)) return false;
  if (span.allDay) return span.startDate <= dateISO && span.endDate >= dateISO;
  const { start, end } = dayBounds(dateISO, timeZone);
  const s = new Date(span.startAt).getTime();
  const e = new Date(span.endAt).getTime();
  const ds = new Date(start).getTime();
  const de = new Date(end).getTime();
  if (e === s) return s >= ds && s < de;
  return s < de && e > ds;
}

// Pozícia dňa v rámci viacdňového úseku, napr. { index: 2, total: 3 } → „deň 2/3“.
export function spanDayPosition(
  span: Span,
  dateISO: string,
  timeZone: string = DEFAULT_TIME_ZONE
): { index: number; total: number } | null {
  const days = spanDays(span, timeZone);
  const i = days.indexOf(dateISO);
  return i === -1 ? null : { index: i + 1, total: days.length };
}

// ---------------------------------------------------------------------------
// Google Kalendár
// ---------------------------------------------------------------------------

type GoogleTime = { date?: string; dateTime?: string; timeZone?: string };

// Udalosť z Google API → Span. Celodenná udalosť má v Googli koniec
// EXKLUZÍVNY (deň PO poslednom dni) — tu sa prevedie na posledný deň vrátane.
export function spanFromGoogle(start: GoogleTime, end: GoogleTime): Span {
  if (start.date) {
    const endExclusive = end.date || addDays(start.date, 1);
    const endDate = addDays(endExclusive, -1);
    return { allDay: true, startDate: start.date, endDate: endDate < start.date ? start.date : endDate };
  }
  if (!start.dateTime) throw new Error("Google udalosť nemá začiatok.");
  const startAt = new Date(start.dateTime).toISOString();
  const endAt = end.dateTime ? new Date(end.dateTime).toISOString() : startAt;
  return { allDay: false, startAt, endAt };
}

// Span → polia start/end pre Google API.
export function spanToGoogle(span: Span, timeZone: string = DEFAULT_TIME_ZONE): { start: GoogleTime; end: GoogleTime } {
  if (span.allDay) {
    return { start: { date: span.startDate }, end: { date: addDays(span.endDate, 1) } };
  }
  return {
    start: { dateTime: span.startAt, timeZone },
    end: { dateTime: span.endAt, timeZone },
  };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
