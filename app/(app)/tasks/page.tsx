"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getTasks, updateTask, completeTask, deleteTask } from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  project_id: string | null;
  due_date: string | null;
  start_date: string | null;
  scheduled_time: string | null;
  depends_on_task_id: string | null;
  context: string | null;
  estimated_minutes: number | null;
  created_at: string;
};

type Project = {
  id: string;
  name: string;
};

// Interaktívny zoznam úloh nad rovnakou dátovou vrstvou (lib/supabase/tasks.ts),
// akú používa aj hlasový agent (Fáza 4.4) — takže zmeny odtiaľto aj z hlasu sa
// navzájom hneď odzrkadlia. Pridané Realtime počúvanie (2026-09-17).
// Vizuál prerobený na Denný agent 2.0 (2026-09-22) — dátová vrstva a
// handlery bez zmeny.
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    try {
      const [taskData, projectData] = await Promise.all([
        getTasks(supabase),
        getProjects(supabase),
      ]);
      setTasks(taskData as Task[]);
      setProjects(projectData as Project[]);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať úlohy.");
    }
  }

  useEffect(() => {
    // 1. Prvé načítanie pri otvorení stránky
    load();

    // 2. Nastavenie Realtime odberu
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-tasks")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        () => {
          // Pri akejkoľvek zmene (INSERT, UPDATE, DELETE) zavoláme load().
          // Toto zaručí, že sa aplikuje tvoje vlastné filtrovanie a zoraďovanie z getTasks.
          load();
        }
      )
      .subscribe();

    // 3. Upratanie pri odchode zo stránky
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function projectName(id: string | null) {
    if (!id) return null;
    return projects?.find((p) => p.id === id)?.name || null;
  }

  async function handleComplete(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const supabase = createClient();
      await completeTask(supabase, id);
      // load() sa tu už volať nemusí, zavolá ho Realtime, ale necháme to pre istotu
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa dokončiť úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Naozaj natrvalo zmazať úlohu "${title}"?`)) return;
    setBusyId(id);
    setError(null);
    try {
      const supabase = createClient();
      await deleteTask(supabase, id);
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa zmazať úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleProjectChange(id: string, newProjectId: string) {
    setBusyId(id);
    setError(null);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id, project_id: newProjectId || null });
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa priradiť projekt.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="px-5 pt-6">
      <Link
        href="/more"
        className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-da-placeholder"
      >
        ‹ Viac
      </Link>

      <h1 className="mb-1 text-[21px] font-bold">Úlohy</h1>
      {!error && tasks !== null && (
        <p className="mb-4 text-sm text-da-meta">
          {tasks.length} {tasks.length === 1 ? "úloha" : "úloh"}
        </p>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!error && tasks === null && (
        <p className="text-da-muted">Načítavam…</p>
      )}

      {!error && tasks !== null && tasks.length === 0 && (
        <p className="text-da-muted">Žiadne nedokončené úlohy.</p>
      )}

      {!error && tasks !== null && tasks.length > 0 && (
        <ul className="flex flex-col gap-2.5 pb-4">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="rounded-da-card border border-da-border bg-da-card px-4 py-3.5 shadow-da-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-grow text-[15px] font-semibold text-da-text">
                  {t.title}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleComplete(t.id)}
                    disabled={busyId === t.id}
                    className="rounded-full bg-da-accent px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Dokončiť
                  </button>
                  <button
                    onClick={() => handleDelete(t.id, t.title)}
                    disabled={busyId === t.id}
                    className="rounded-full border border-da-danger/40 px-3 py-1 text-xs font-medium text-da-danger disabled:opacity-50"
                  >
                    Zmazať
                  </button>
                </div>
              </div>

              <div className="mt-0.5 text-xs text-da-meta">
                {t.start_date ? `od: ${t.start_date} ` : ""}
                {t.due_date ? `termín: ${t.due_date}` : "bez termínu"}
                {t.scheduled_time ? ` · čas: ${t.scheduled_time}` : ""}
                {t.priority ? ` · priorita: ${t.priority}` : ""}
                {t.estimated_minutes ? ` · ~${t.estimated_minutes} min` : ""}
                {" · "}
                stav: {t.status}
              </div>

              {t.description && (
                <div className="mt-2 text-sm text-da-text">{t.description}</div>
              )}
              {t.context && (
                <div className="mt-1 text-sm text-da-meta">
                  podmienka: {t.context}
                </div>
              )}

              <div className="mt-3 flex items-center gap-2">
                <label className="text-xs text-da-meta">Projekt:</label>
                <select
                  value={t.project_id || ""}
                  onChange={(e) => handleProjectChange(t.id, e.target.value)}
                  disabled={busyId === t.id}
                  className="rounded-lg border border-da-border px-2 py-1 text-xs disabled:opacity-50"
                >
                  <option value="">— bez projektu —</option>
                  {projects?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-da-placeholder">
                <span>
                  id: {t.id} · vytvorené: {t.created_at}
                </span>
                {projectName(t.project_id) && (
                  <span className="rounded-full bg-da-chip-bg px-2 py-0.5 text-[11px] text-da-chip-text">
                    {projectName(t.project_id)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
