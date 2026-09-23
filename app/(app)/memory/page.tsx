"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getAllMemory } from "@/lib/supabase/memory";

type Memory = {
  id: string;
  content: string;
  category: string;
  status: string;
  evidence: string | null;
  created_at: string;
  updated_at: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  fact: "Fakt",
  preference: "Preferencia",
  pattern: "Vzorec",
  hypothesis: "Hypotéza",
  rule: "Pravidlo",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Platné",
  superseded: "Nahradené",
  rejected: "Zamietnuté",
};

// Read-only stránka transparentnosti pamäte (pozri PROJECT.md časť 23,
// "Transparentnosť pamäte" / "Kontrola pamäte používateľom"). Zámerne bez
// úprav priamo tu — pamäť sa mení cez hlasového agenta (remember/
// update_memory/forget_memory), toto je iba okno na to, čo si agent
// naozaj pamätá, vrátane toho, čo bolo nahradené alebo zamietnuté.
export default function MemoryPage() {
  const [items, setItems] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("active");

  async function load() {
    const supabase = createClient();
    try {
      const data = await getAllMemory(supabase);
      setItems(data as Memory[]);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať pamäť.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = items?.filter((m) =>
    statusFilter === "all" ? true : m.status === statusFilter
  );

  return (
    <div className="px-5 pt-6">
      <Link href="/more" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-da-placeholder">
        ‹ Viac
      </Link>

      <h1 className="mb-1 text-[21px] font-bold">Pamäť</h1>
      <p className="mb-4 text-sm text-da-meta">
        Čo si agent o tebe pamätá naprieč rozhovormi — vrátane toho, čo bolo
        nahradené alebo zamietnuté. Úpravy rob hlasom („zabudni toto“, „toto
        už neplatí“), táto stránka je iba na čítanie.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex gap-2 overflow-x-auto">
        {["active", "superseded", "rejected", "all"].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={
              statusFilter === s
                ? "shrink-0 rounded-full bg-da-accent px-3.5 py-2 text-xs font-semibold text-white"
                : "shrink-0 rounded-full bg-da-chip-bg px-3.5 py-2 text-xs text-da-chip-text"
            }
          >
            {s === "all" ? "Všetko" : STATUS_LABEL[s] || s}
          </button>
        ))}
      </div>

      {!error && items === null && (
        <p className="text-da-muted">Načítavam…</p>
      )}

      {!error && items !== null && filtered && filtered.length === 0 && (
        <p className="text-da-muted">Nič v tejto kategórii.</p>
      )}

      {!error && filtered && filtered.length > 0 && (
        <div className="flex flex-col gap-3 pb-4">
          {filtered.map((m) => (
            <div
              key={m.id}
              className="rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[15px] font-medium">{m.content}</div>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-da-accent-soft px-2 py-0.5 text-[11px] text-da-accent-soft-text">
                  {CATEGORY_LABEL[m.category] || m.category}
                </span>
              </div>
              <div
                className="mt-1.5 text-sm"
                style={{
                  color:
                    m.status === "active"
                      ? "#3F5C48"
                      : m.status === "rejected"
                      ? "#B4776B"
                      : "#9A9384",
                }}
              >
                {STATUS_LABEL[m.status] || m.status}
                {m.evidence ? ` · dôkaz: ${m.evidence}` : ""}
              </div>
              <div className="mt-1.5 text-xs text-da-muted">
                Zdroj: vytvorené {m.created_at} · aktualizované {m.updated_at}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
