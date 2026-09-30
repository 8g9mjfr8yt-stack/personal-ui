"use client";

// v2.2 — Kalendár (NAVRH-PRESTAVBY.md, časť 6):
//   týždenný pás dní → zobrazenie vybraného dňa (DayView, rovnaké ako Dnes)
//   → POOL voľných úloh so sekciami Nestihnuté · Po termíne · Rozmedzie ·
//   Kedykoľvek a tlačidlom „Na [deň]“ (plán = vybraný deň; presun zvýši
//   počítadlo odkladaní, termín sa nemení).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordPerf } from "@/lib/perf";
import { addDays, zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";
import { planMode, plannedDays } from "@/lib/model/taskPlan";
import { shortDate } from "@/lib/model/labels";
import { getEventsInRange, type EventRow } from "@/lib/supabase/events";
import { getTasksForRange, getPool, planTaskToDay, type TaskV2 } from "@/lib/supabase/tasksV2";
import type { PoolSection } from "@/lib/model/taskPlan";
import { getSubtasksFor } from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";
import { useScrollRestore } from "@/lib/usePersistedState";
import DoneDock from "@/components/ui/DoneDock";
import DayView, { eventsOnDay, tasksOnDay } from "@/components/DayView";
import { useTaskUi, type UiProject } from "@/components/useTaskUi";

const TZ = DEFAULT_TIME_ZONE;
const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];

const SECTIONS: { key: PoolSection; label: string; danger?: boolean }[] = [
  { key: "missed", label: "Nestihnuté" },
  { key: "overdue", label: "Po termíne", danger: true },
  { key: "range", label: "Rozmedzie" },
  { key: "anytime", label: "Kedykoľvek" },
];

function mondayOf(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = nedeľa
  return addDays(dateISO, wd === 0 ? -6 : 1 - wd);
}

export default function CalendarPage() {
  const today = zonedDate(new Date(), TZ);
  const [selectedDay, setSelectedDayState] = useState(today);
  const weekStart = useMemo(() => mondayOf(selectedDay), [selectedDay]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskV2[] | null>(null);
  const [pool, setPool] = useState<Record<PoolSection, TaskV2[]> | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [projects, setProjects] = useState<UiProject[]>([]);
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, TaskV2[]>>({});
  const [expanded, setExpandedState] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useScrollRestore("da_scroll_calendar", tasks !== null);

  // Kalendár sa vždy otvára na dnešku (vybraný deň sa nepamätá).
  const setSelectedDay = (iso: string) => setSelectedDayState(iso);

  const weekStartRef = useRef(weekStart);
  weekStartRef.current = weekStart;

  const load = useCallback(async () => {
    const supabase = createClient();
    const perfStart = performance.now();
    const start = weekStartRef.current;
    const end = addDays(start, 7);
    try {
      const [ev, ts, pl, pr] = await Promise.all([
        getEventsInRange(supabase, start, end, TZ),
        getTasksForRange(supabase, start, end, TZ),
        getPool(supabase),
        getProjects(supabase) as Promise<UiProject[]>,
      ]);
      setEvents(ev);
      setTasks(ts);
      setPool(pl);
      setProjects(pr);
      const poolIds = (Object.values(pl) as TaskV2[][]).flat().map((t) => t.id);
      const subs = (await getSubtasksFor(supabase, [...ts.map((t) => t.id), ...poolIds])) as TaskV2[];
      const grouped: Record<string, TaskV2[]> = {};
      for (const s of subs) (grouped[s.parent_task_id as string] ||= []).push(s);
      setSubtasksByParent(grouped);
      setError(null);
      recordPerf("stránka", "Kalendár – načítanie", performance.now() - perfStart);
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa načítať kalendár.");
    }
  }, []);

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 300);
  }, [load]);

  useEffect(() => {
    load();
  }, [weekStart, load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-calendar-v22")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, reload)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [reload]);

  const ui = useTaskUi({
    day: selectedDay,
    projects,
    subtasksByParent,
    setTasks,
    setSubtasksByParent,
    expanded,
    setExpanded: (fn) => setExpandedState(fn),
    reload,
    setError,
    unplanButton: true,
  });

  function planToSelected(t: TaskV2) {
    // optimisticky: zmizne z poolu hneď
    setPool((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      for (const k of Object.keys(next) as PoolSection[]) next[k] = next[k].filter((x) => x.id !== t.id);
      return next;
    });
    ui.run(t.id, () => planTaskToDay(createClient(), t, selectedDay).then(() => reload()), "Nepodarilo sa naplánovať úlohu.");
  }

  function poolMeta(t: TaskV2, section: PoolSection): string {
    const parts: string[] = [];
    const mode = planMode(t);
    if (section === "missed" || section === "overdue") {
      if (mode === "day") parts.push(`plán ${shortDate(t.plan_start_date!)}`);
      if (mode === "block") parts.push(`plán ${shortDate(zonedDate(t.plan_start_at!, TZ))}`);
      if (mode === "range") parts.push(`rozmedzie do ${shortDate(t.plan_end_date!)}`);
    }
    if (section === "range") parts.push(`${shortDate(t.plan_start_date!)} – ${shortDate(t.plan_end_date!)}`);
    if ((t.postponed_count || 0) >= 2) parts.push(`odložené ${t.postponed_count}×`);
    return parts.join(" · ");
  }

  const hasItems = (day: string) =>
    (events ? eventsOnDay(events, day).length > 0 : false) ||
    (tasks ? tasks.some((t) => plannedDays(t, TZ).includes(day) && !t.completed_at) : false);

  const done = tasks ? tasksOnDay(tasks, selectedDay).done : [];
  const urgent = pool ? pool.missed.length + pool.overdue.length : 0;
  const poolTotal = pool ? SECTIONS.reduce((n, s) => n + pool[s.key].length, 0) : 0;
  const [, sm, sd] = selectedDay.split("-").map(Number);

  return (
    <div className="flex min-h-[calc(100dvh-6rem)] flex-col">
      <div className="px-5 pb-3 pt-6">
        <h1 className="text-[21px] font-bold">Kalendár</h1>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 pb-2">
        <button type="button" onClick={() => setSelectedDay(today)} className="text-xs font-medium text-da-meta">
          {shortDate(weekDays[0])} – {shortDate(weekDays[6])}
        </button>
        <input
          type="date"
          aria-label="Skočiť na dátum"
          value={selectedDay}
          onChange={(e) => e.target.value && setSelectedDay(e.target.value)}
          className="rounded-lg border border-da-border bg-da-card px-1.5 py-0.5 text-xs text-da-meta"
        />
      </div>

      <div className="flex items-center gap-1 px-2 pb-4">
        <button type="button" aria-label="Predchádzajúci týždeň" onClick={() => setSelectedDay(addDays(selectedDay, -7))} className="h-7 w-7 shrink-0 text-da-meta">
          ‹
        </button>
        <div className="flex flex-1 justify-between gap-1">
          {weekDays.map((iso, i) => {
            const isSelected = iso === selectedDay;
            return (
              <button
                key={iso}
                onClick={() => setSelectedDay(iso)}
                className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5"
                style={{ background: isSelected ? "rgb(var(--da-accent))" : "transparent" }}
              >
                <span className={`text-[11px] ${isSelected ? "text-da-on-accent/85" : iso === today ? "font-bold text-da-accent" : "text-da-muted"}`}>
                  {DAY_LABELS[i]}
                </span>
                <span className={`text-sm font-semibold ${isSelected ? "text-da-on-accent" : "text-da-text"}`}>
                  {Number(iso.slice(8))}
                </span>
                <span className={`h-1 w-1 rounded-full ${hasItems(iso) && !isSelected ? "bg-da-accent" : ""}`} />
              </button>
            );
          })}
        </div>
        <button type="button" aria-label="Nasledujúci týždeň" onClick={() => setSelectedDay(addDays(selectedDay, 7))} className="h-7 w-7 shrink-0 text-da-meta">
          ›
        </button>
      </div>

      {error && <p className="px-5 pb-3 text-sm text-red-600">{error}</p>}

      <div className="px-5">
        {tasks === null || events === null ? (
          <p className="text-da-muted">Načítavam…</p>
        ) : (
          <DayView
            day={selectedDay}
            events={events}
            tasks={tasks}
            now={now}
            renderTask={ui.renderTask}
            onOpenEvent={ui.setOpenEvent}
            emptyText="Na tento deň nemáš naplánované úlohy."
          />
        )}
        <div className="flex justify-end pb-4">
          <button
            type="button"
            aria-label="Nová úloha na vybraný deň"
            onClick={() => ui.openCreate(null)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-da-chip-bg text-da-chip-text"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-auto min-h-[44px] px-5">
        <DoneDock count={done.length} bottomOffset={44}>
          {done.map((t) => ui.renderTask(t, { faded: true }))}
        </DoneDock>
      </div>

      {/* POOL */}
      <div className="fixed inset-x-0 bottom-[64px] z-40 mx-auto max-w-3xl">
        {poolOpen && (
          <div
            className="max-h-[55dvh] overflow-y-auto rounded-t-2xl border border-b-0 border-da-border bg-da-card px-4 pt-3"
            style={{ boxShadow: "var(--da-float-shadow)" }}
          >
            {pool === null && <p className="py-3 text-sm text-da-muted">Načítavam…</p>}
            {pool !== null && poolTotal === 0 && <p className="py-3 text-sm text-da-muted">Žiadne voľné úlohy.</p>}
            {pool !== null &&
              SECTIONS.filter((s) => pool[s.key].length > 0).map((s) => (
                <div key={s.key} className="pb-3">
                  <div className={`mb-2 text-[11px] font-bold uppercase tracking-[0.08em] ${s.danger ? "text-da-danger" : "text-da-meta"}`}>
                    {s.label} ({pool[s.key].length})
                  </div>
                  <div className="flex flex-col gap-2">
                    {pool[s.key].map((t) =>
                      ui.renderTask(t, {
                        pool: { label: `Na ${sd}. ${sm}.`, onPlan: () => planToSelected(t), detail: poolMeta(t, s.key) || null },
                      })
                    )}
                  </div>
                </div>
              ))}
          </div>
        )}
        <button
          onClick={() => setPoolOpen((o) => !o)}
          className="flex w-full items-center justify-center gap-2 border-t border-da-border bg-da-card py-2.5 text-sm font-medium text-da-meta"
          style={{ borderRadius: poolOpen ? 0 : "16px 16px 0 0" }}
        >
          {poolOpen ? "Skryť voľné úlohy" : `Voľné úlohy (${poolTotal})`}
          {!poolOpen && urgent > 0 && <span className="text-da-danger">· ⚠ {urgent}</span>}
        </button>
      </div>

      {ui.overlays}
    </div>
  );
}
