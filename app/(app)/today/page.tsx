"use client";

// v2.2 — obrazovka Dnes (NAVRH-PRESTAVBY.md, časť 6). Zobrazenie dňa rieši
// components/DayView.tsx, akcie úloh components/useTaskUi.tsx (zdieľané s
// Kalendárom).

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordPerf } from "@/lib/perf";
import { addDays, zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";
import { getEventsInRange, type EventRow } from "@/lib/supabase/events";
import { getTasksForRange, getPool, type TaskV2 } from "@/lib/supabase/tasksV2";
import { getSubtasksFor } from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";
import { usePersistedFlags, useScrollRestore } from "@/lib/usePersistedState";
import NotificationsPrompt from "@/components/NotificationsPrompt";
import DoneDock from "@/components/ui/DoneDock";
import DayView, { tasksOnDay } from "@/components/DayView";
import { useTaskUi, type UiProject } from "@/components/useTaskUi";

const TZ = DEFAULT_TIME_ZONE;

export default function TodayPage() {
  const [today, setToday] = useState(() => zonedDate(new Date(), TZ));
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskV2[] | null>(null);
  const [poolCounts, setPoolCounts] = useState({ missed: 0, overdue: 0 });
  const [projects, setProjects] = useState<UiProject[]>([]);
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, TaskV2[]>>({});
  const [expanded, setExpanded] = usePersistedFlags("da_today_expanded");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useScrollRestore("da_scroll_today", tasks !== null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const perfStart = performance.now();
    const day = zonedDate(new Date(), TZ);
    setToday(day);
    try {
      const [ev, ts, pool, pr] = await Promise.all([
        getEventsInRange(supabase, day, addDays(day, 1), TZ),
        getTasksForRange(supabase, day, addDays(day, 1), TZ),
        getPool(supabase),
        getProjects(supabase) as Promise<UiProject[]>,
      ]);
      setEvents(ev);
      setTasks(ts);
      setPoolCounts({ missed: pool.missed.length, overdue: pool.overdue.length });
      setProjects(pr);
      const subs = (await getSubtasksFor(supabase, ts.map((t) => t.id))) as TaskV2[];
      const grouped: Record<string, TaskV2[]> = {};
      for (const s of subs) (grouped[s.parent_task_id as string] ||= []).push(s);
      setSubtasksByParent(grouped);
      setError(null);
      recordPerf("stránka", "Dnes – načítanie", performance.now() - perfStart);
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa načítať deň.");
    }
  }, []);

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 300);
  }, [load]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-today-v22")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, reload)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [load, reload]);

  const ui = useTaskUi({
    day: today,
    projects,
    subtasksByParent,
    setTasks,
    setSubtasksByParent,
    expanded,
    setExpanded,
    reload,
    setError,
  });

  const loading = tasks === null || events === null;
  const done = tasks ? tasksOnDay(tasks, today).done : [];
  const pendingPool = poolCounts.missed + poolCounts.overdue;

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col px-5 pt-6">
      <h1 className="mb-1 text-[21px] font-bold">Dnes</h1>
      <p className="mb-4 text-sm text-da-meta">
        {new Date().toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long", timeZone: TZ })}
      </p>

      <NotificationsPrompt />
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading && !error && <p className="text-da-muted">Načítavam…</p>}

      {!loading && (
        <>
          <DayView
            day={today}
            events={events!}
            tasks={tasks!}
            now={now}
            renderTask={ui.renderTask}
            onOpenEvent={ui.setOpenEvent}
            emptyText="Na dnes nemáš naplánované žiadne úlohy."
          />

          <div className="flex items-center justify-between pb-4">
            {pendingPool > 0 ? (
              <Link href="/calendar" className="text-sm font-medium text-da-danger">
                ⚠ {poolCounts.missed > 0 ? `Nestihnuté (${poolCounts.missed})` : ""}
                {poolCounts.missed > 0 && poolCounts.overdue > 0 ? " · " : ""}
                {poolCounts.overdue > 0 ? `Po termíne (${poolCounts.overdue})` : ""} →
              </Link>
            ) : (
              <span />
            )}
            <button
              type="button"
              aria-label="Nová úloha"
              onClick={() => ui.openCreate(null)}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-da-chip-bg text-da-chip-text"
            >
              +
            </button>
          </div>

          <DoneDock count={done.length}>{done.map((t) => ui.renderTask(t, { faded: true }))}</DoneDock>
        </>
      )}

      {ui.overlays}
    </div>
  );
}
