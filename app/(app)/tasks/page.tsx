"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTasks } from "@/lib/supabase/tasks";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  scheduled_time: string | null;
  created_at: string;
};

// Poznámka: jednoduchý zoznam úloh (zatiaľ len na čítanie), postavený nad
// rovnakou dátovou vrstvou (lib/supabase/tasks.ts), akú používa aj hlasový
// agent (Fáza 4.4) — takže sem sa dá kedykoľvek prísť skontrolovať, čo sa
// reálne uložilo do databázy.
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    getTasks(supabase)
      .then((data) => setTasks(data as Task[]))
      .catch((err) => {
        console.error("Chyba pri načítaní úloh:", err);
        setError(err?.message || "Nepodarilo sa načítať úlohy.");
      });
  }, []);

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Tasks</h1>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!error && tasks === null && (
        <p className="text-neutral-500">Načítavam…</p>
      )}

      {!error && tasks !== null && tasks.length === 0 && (
        <p className="text-neutral-500">Žiadne nedokončené úlohy.</p>
      )}

      {!error && tasks !== null && tasks.length > 0 && (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="font-medium">{t.title}</div>
              <div className="text-sm text-neutral-500">
                {t.due_date ? `termín: ${t.due_date}` : "bez termínu"}
                {t.scheduled_time ? ` · čas: ${t.scheduled_time}` : ""}
                {t.priority ? ` · priorita: ${t.priority}` : ""}
                {" · "}
                stav: {t.status}
              </div>
              {t.description && (
                <div className="mt-1 text-sm text-neutral-600">{t.description}</div>
              )}
              <div className="mt-1 text-xs text-neutral-400">
                id: {t.id} · vytvorené: {t.created_at}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
