// Fáza 0 prestavby (NAVRH-PRESTAVBY.md, 2026-09-30) — DOČASNÉ merania
// rýchlosti. Ukladá posledných 80 meraní iba do localStorage tohto
// zariadenia (nič do databázy) a zobrazuje ich v sekcii „Merania“ na
// stránke Viac. Po vyhodnotení fázy 0 sa má celý súbor aj panel odstrániť.

export type PerfEntry = { t: string; kind: string; label: string; ms: number };

const KEY = "da_perf_log";
const MAX = 300;
export const PERF_EVENT = "da-perf";

export function readPerf(): PerfEntry[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PerfEntry[]) : [];
  } catch {
    return [];
  }
}

export function recordPerf(kind: string, label: string, ms: number) {
  const entry: PerfEntry = { t: new Date().toISOString(), kind, label, ms: Math.round(ms) };
  // eslint-disable-next-line no-console
  console.log(`[perf] ${kind} · ${label}: ${entry.ms} ms`);
  try {
    const arr = readPerf();
    arr.unshift(entry);
    window.localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
    window.dispatchEvent(new Event(PERF_EVENT));
  } catch {
    // localStorage nemusí byť dostupné (súkromné okno) — meranie iba v konzole.
  }
}

export function clearPerf() {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(PERF_EVENT));
  } catch {
    // ignoruj
  }
}
