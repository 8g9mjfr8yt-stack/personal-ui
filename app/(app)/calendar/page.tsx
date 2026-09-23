"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTasksInRange, getUnassignedTasks, updateTask } from "@/lib/supabase/tasks";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  scheduled_time: string | null;
  context: string | null;
};

const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const POOL_OPEN_KEY = "da_calendar_pool_open";

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function taskMeta(t: Task) {
  const time = t.scheduled_time
    ? new Date(t.scheduled_time).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })
    : null;
  const parts = [time, t.priority ? `${t.priority} priorita` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "bez času";
}

// Denný agent 2.0 — nová obrazovka Kalendár: týždenný pás dní + agenda
// vybraného dňa + spodný "pool" voľných úloh (bez due_date), ktoré sa
// dajú priradiť na aktuálne vybraný deň, alebo z daného dňa naspäť
// odstrániť (klik na riadok = due_date -> null). Otvorený/zatvorený
// stav poolu sa drží v localStorage, aby prežil prepínanie dní aj
// reload stránky.
export default function CalendarPage() {
  const today = useMemo(() => new Date(), []);
  const weekDays = useMemo(() => {
    const monday = startOfWeek(today);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [today]);

  const [selectedDay, setSelectedDay] = useState(() => toISODate(new Date()));
  const [tasksByDay, setTasksByDay] = useState<Record<string, Task[]>>({});
  const [pool, setPool] = useState<Task[] | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(POOL_OPEN_KEY);
      if (stored !== null) setPoolOpen(stored === "1");
    } catch {
      /* localStorage nedostupné — ostane defaultne zbalené */
    }
  }, []);

  function togglePool() {
    setPoolOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(POOL_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function load() {
    const supabase = createClient();
    try {
      const start = toISODate(weekDays[0]);
      const endExclusive = toISODate(
        new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate() + 1)
      );
      const [weekTasks, unassigned] = await Promise.all([
        getTasksInRange(supabase, start, endExclusive) as Promise<Task[]>,
        getUnassignedTasks(supabase) as Promise<Task[]>,
      ]);
      const grouped: Record<string, Task[]> = {};
      for (const t of weekTasks) {
        const key = t.due_date as string;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
      }
      setTasksByDay(grouped);
      setPool(unassigned);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať kalendár.");
    }
  }

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-calendar-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUnassign(taskId: string) {
    setBusyId(taskId);
    setError(null);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id: taskId, due_date: null, scheduled_time: null });
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa odstrániť úlohu z dňa.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssign(taskId: string) {
    setBusyId(taskId);
    setError(null);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id: taskId, due_date: selectedDay });
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa priradiť úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  const selectedTasks = (tasksByDay[selectedDay] || []).slice().sort((a, b) => {
    if (!a.scheduled_time && !b.scheduled_time) return 0;
    if (!a.scheduled_time) return 1;
    if (!b.scheduled_time) return -1;
    return a.scheduled_time.localeCompare(b.scheduled_time);
  });

  return (
    <div className="flex flex-col">
      <div className="px-5 pb-3 pt-6">
        <h1 className="mb-1 text-[21px] font-bold">Kalendár</h1>
      </div>

      <div className="flex justify-between gap-1 px-4 pb-4">
        {weekDays.map((d, i) => {
          const iso = toISODate(d);
          const isSelected = iso === selectedDay;
          const hasTasks = (tasksByDay[iso] || []).length > 0;
          return (
            <button
              key={iso}
              onClick={() => setSelectedDay(iso)}
              className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5"
              style={{ background: isSelected ? "#5B7F66" : "transparent" }}
            >
              <span className="text-[11px]" style={{ color: isSelected ? "#EAF1EA" : "#9A9384" }}>
                {DAY_LABELS[i]}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: isSelected ? "#FFFFFF" : "#211E1B" }}
              >
                {d.getDate()}
              </span>
              {hasTasks && !isSelected && <span className="h-1 w-1 rounded-full bg-da-accent" />}
              {(!hasTasks || isSelected) && <span className="h-1 w-1" />}
            </button>
          );
        })}
      </div>

      {error && <p className="px-5 pb-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2.5 px-5 pb-6">
        {selectedTasks.length === 0 && (
          <p className="py-6 text-center text-sm text-da-muted">Na tento deň nemáš priradené žiadne úlohy.</p>
        )}
        {selectedTasks.map((t) => (
          <button
            key={t.id}
            onClick={() => handleUnassign(t.id)}
            disabled={busyId === t.id}
            className="flex items-center gap-3.5 rounded-da-card border border-da-border bg-da-card px-4 py-3.5 text-left shadow-da-card disabled:opacity-50"
          >
            <span
              className="h-5 w-5 shrink-0 rounded-full border-2"
              style={{
                background: t.status === "done" ? "#5B7F66" : "transparent",
                borderColor: t.status === "done" ? "#5B7F66" : "#C9C2B4",
              }}
            />
            <span className="min-w-0 flex-grow">
              <span
                className="block text-[15px] font-medium"
                style={{
                  color: t.status === "done" ? "#9A9384" : "#211E1B",
                  textDecoration: t.status === "done" ? "line-through" : "none",
                }}
              >
                {t.title}
              </span>
              <span className="block text-xs text-da-meta">{taskMeta(t)}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="h-2" />

      {/* Spodný "pool" panel sa vykresľuje priamo nad BottomChrome cez
          rovnaký fixed kontext — jednoduchšie ako počítať výšku susednej
          fixed lišty, tak ho vykreslíme ako súčasť bežného toku a necháme
          mu dostatočný spodný padding v layout.tsx (pb-40 na <main>). */}
      <div className="fixed inset-x-0 bottom-[104px] z-40 mx-auto max-w-3xl px-0">
        {poolOpen && (
          <div className="max-h-[280px] overflow-y-auto rounded-t-2xl border border-b-0 border-da-border bg-white px-4 pt-3">
            {pool === null && <p className="py-3 text-sm text-da-muted">Načítavam…</p>}
            {pool !== null && pool.length === 0 && (
              <p className="py-3 text-sm text-da-muted">Žiadne voľné úlohy.</p>
            )}
            <div className="flex flex-col gap-2 pb-3">
              {pool?.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-da-border px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-grow">
                    <span className="block text-sm font-medium text-da-text">{t.title}</span>
                    {t.context && <span className="block text-xs text-da-meta">{t.context}</span>}
                  </span>
                  <button
                    onClick={() => handleAssign(t.id)}
                    disabled={busyId === t.id}
                    aria-label={`Priradiť na vybraný deň: ${t.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-da-accent text-white disabled:opacity-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={togglePool}
          className="flex w-full items-center justify-center gap-2 border-t border-da-border bg-white py-2.5 text-sm font-medium text-da-meta"
          style={{ borderRadius: poolOpen ? 0 : "16px 16px 0 0" }}
        >
          {poolOpen ? "Skryť voľné úlohy" : "Voľné úlohy na priradenie"}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: poolOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
