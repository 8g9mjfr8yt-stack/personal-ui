"use client";

import { useEffect, useState } from "react";
import { readPerf, clearPerf, PERF_EVENT, type PerfEntry } from "@/lib/perf";

// Fáza 0 — DOČASNÝ panel s meraniami rýchlosti (stránka Viac).
// Súhrn podľa typu merania (počet, medián, posledná hodnota) + posledné
// záznamy. Po vyhodnotení fázy 0 odstrániť spolu s lib/perf.ts.
function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export default function PerfPanel() {
  const [entries, setEntries] = useState<PerfEntry[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const refresh = () => setEntries(readPerf());
    refresh();
    window.addEventListener(PERF_EVENT, refresh);
    return () => window.removeEventListener(PERF_EVENT, refresh);
  }, []);

  const groups = new Map<string, number[]>();
  for (const e of entries) {
    const key = `${e.kind} · ${e.label}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e.ms);
  }

  return (
    <div className="mb-5 flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between text-left text-[11px] font-bold uppercase tracking-[0.08em] text-da-meta"
      >
        <span>Merania (dočasné) · {entries.length}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="rounded-da-card border border-da-border bg-da-card p-4 text-sm shadow-da-card">
          {entries.length === 0 ? (
            <p className="text-da-meta">
              Zatiaľ žiadne merania. Spusti hlasový rozhovor alebo otvor Dnes/Kalendár.
            </p>
          ) : (
            <>
              <table className="mb-3 w-full text-left text-[13px]">
                <thead className="text-da-meta">
                  <tr>
                    <th className="pb-1 font-medium">Meranie</th>
                    <th className="pb-1 text-right font-medium">Počet</th>
                    <th className="pb-1 text-right font-medium">Medián</th>
                    <th className="pb-1 text-right font-medium">Posledné</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from(groups.entries()).map(([key, vals]) => (
                    <tr key={key}>
                      <td className="py-0.5 pr-2">{key}</td>
                      <td className="py-0.5 text-right">{vals.length}</td>
                      <td className="py-0.5 text-right">{median(vals)} ms</td>
                      <td className="py-0.5 text-right">{vals[0]} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                type="button"
                onClick={clearPerf}
                className="text-[13px] font-medium text-da-danger"
              >
                Vymazať merania
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
