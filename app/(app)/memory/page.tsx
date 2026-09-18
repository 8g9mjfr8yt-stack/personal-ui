"use client";

import { useEffect, useState } from "react";
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
    <div>
      <h1 className="mb-1 text-xl font-semibold">Pamäť</h1>
      <p className="mb-4 text-sm text-neutral-500">
        Čo si agent o tebe pamätá naprieč rozhovormi — vrátane toho, čo bolo
        nahradené alebo zamietnuté. Úpravy rob hlasom („zabudni toto“, „toto
        už neplatí“), táto stránka je iba na čítanie.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex gap-2">
        {["active", "superseded", "rejected", "all"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={
              statusFilter === s
                ? "rounded-md bg-neutral-900 px-2 py-1 text-xs text-white"
                : "rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600"
            }
          >
            {s === "all" ? "Všetko" : STATUS_LABEL[s] || s}
          </button>
        ))}
      </div>

      {!error && items === null && (
        <p className="text-neutral-500">Načítavam…</p>
      )}

      {!error && items !== null && filtered && filtered.length === 0 && (
        <p className="text-neutral-500">Nič v tejto kategórii.</p>
      )}

      {!error && filtered && filtered.length > 0 && (
        <ul className="space-y-2">
          {filtered.map((m) => (
            <li key={m.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{m.content}</div>
                <span className="whitespace-nowrap rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                  {CATEGORY_LABEL[m.category] || m.category}
                </span>
              </div>
              <div className="mt-1 text-sm text-neutral-500">
                stav: {STATUS_LABEL[m.status] || m.status}
                {m.evidence ? ` · dôkaz: ${m.evidence}` : ""}
              </div>
              <div className="mt-1 text-xs text-neutral-400">
                vytvorené: {m.created_at} · upravené: {m.updated_at}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
