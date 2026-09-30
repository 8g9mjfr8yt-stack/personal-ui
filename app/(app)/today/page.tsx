"use client";

// v2.2 — obrazovka Dnes nad novým modelom (NAVRH-PRESTAVBY.md, časť 6):
//   1. celodenné udalosti (štítky, „deň 2/3“)
//   2. časová os: udalosti (karty bez krúžku) + časové bloky úloh (s krúžkom),
//      čiara „teraz“
//   3. Úlohy na dnes (plán „deň“) + svetlejšie úlohy s rozmedzím, do ktorého
//      dnešok patrí
//   4. odkaz na Nestihnuté / Po termíne (pool v Kalendári)
//   5. Hotové
// Dáta: events (projekcia Google) + tasks (plán/termín), všetko cez lib/time.ts.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { recordPerf } from "@/lib/perf";
import { addDays, zonedDate, spanDayPosition, DEFAULT_TIME_ZONE } from "@/lib/time";
import { planMode, rangeIncludes } from "@/lib/model/taskPlan";
import { timeRangeLabel, deadlineLabel, shortDate } from "@/lib/model/labels";
import { getEventsInRange, setEventProject, type EventRow } from "@/lib/supabase/events";
import {
  getTasksForRange,
  getPool,
  createTaskV2,
  updateTaskV2,
  setTaskDone,
  deleteTaskV2,
  type TaskV2,
  type TaskV2Input,
} from "@/lib/supabase/tasksV2";
import { getSubtasksFor } from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";
import { usePersistedFlags, useScrollRestore } from "@/lib/usePersistedState";
import NotificationsPrompt from "@/components/NotificationsPrompt";
import TaskRow from "@/components/ui/TaskRow";
import DoneDock from "@/components/ui/DoneDock";
import EventCard from "@/components/ui/EventCard";
import EventSheet from "@/components/ui/EventSheet";
import TaskEditModalV2 from "@/components/ui/TaskEditModalV2";

type Project = { id: string; name: string; accent_color: string | null };
type TimelineItem =
  | { kind: "event"; start: number; event: EventRow }
  | { kind: "task"; start: number; task: TaskV2 };

const TZ = DEFAULT_TIME_ZONE;

export default function TodayPage() {
  const [today, setToday] = useState(() => zonedDate(new Date(), TZ));
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [tasks, setTasks] = useState<TaskV2[] | null>(null);
  const [poolCounts, setPoolCounts] = useState({ missed: 0, overdue: 0 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, TaskV2[]>>({});
  const [expanded, setExpanded] = usePersistedFlags("da_today_expanded");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ task: Partial<TaskV2> | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<EventRow | null>(null);
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
        getProjects(supabase) as Promise<Project[]>,
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

  // Jedno načítanie po sérii zmien (realtime posiela viac udalostí naraz).
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 300);
  }, [load]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-today-v22")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, scheduleReload)
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(tick);
    };
  }, [load, scheduleReload]);

  const projectFor = (id: string | null) => (id ? projects.find((p) => p.id === id) || null : null);

  // --- akcie -----------------------------------------------------------------
  async function run(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error)?.message || msg);
      scheduleReload();
    } finally {
      setBusyId(null);
    }
  }

  function toggleDone(t: TaskV2) {
    const done = !(t.status === "done" || !!t.completed_at);
    // optimistické UI — krúžok sa zmení hneď
    const patch = { status: done ? "done" : "todo", completed_at: done ? new Date().toISOString() : null };
    setTasks((prev) => prev && prev.map((x) => (x.id === t.id ? { ...x, ...patch } : x)));
    setSubtasksByParent((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = next[k].map((x) => (x.id === t.id ? { ...x, ...patch } : x));
      return next;
    });
    run(t.id, () => setTaskDone(createClient(), t, done), "Nepodarilo sa uložiť.");
  }

  function addSubtask(parent: TaskV2) {
    const title = window.prompt("Názov podúlohy:");
    if (!title?.trim()) return;
    setExpanded((prev) => ({ ...prev, [parent.id]: true }));
    run(parent.id, () => createTaskV2(createClient(), { title, parent_task_id: parent.id }), "Nepodarilo sa pridať podúlohu.");
  }

  function remove(t: TaskV2) {
    if (!confirm(`Naozaj natrvalo zmazať úlohu "${t.title}"?`)) return;
    run(t.id, () => deleteTaskV2(createClient(), t), "Nepodarilo sa zmazať úlohu.");
  }

  async function save(values: TaskV2Input & { title: string }) {
    setSaving(true);
    setModalError(null);
    try {
      const supabase = createClient();
      if (editing?.task?.id) await updateTaskV2(supabase, editing.task.id, values);
      else await createTaskV2(supabase, values);
      setEditing(null);
      scheduleReload();
    } catch (err) {
      setModalError((err as Error)?.message || "Nepodarilo sa uložiť úlohu.");
    } finally {
      setSaving(false);
    }
  }

  // --- rozdelenie dňa ----------------------------------------------------------
  const all = tasks || [];
  const isDone = (t: TaskV2) => t.status === "done" || !!t.completed_at;
  const blocks = all.filter((t) => planMode(t) === "block");
  const dayTasks = all.filter((t) => planMode(t) === "day" && t.plan_start_date === today);
  const rangeTasks = all.filter((t) => rangeIncludes(t, today));

  const allDayEvents = (events || []).filter((e) => e.all_day);
  const timeline: TimelineItem[] = [
    ...(events || []).filter((e) => !e.all_day).map((e) => ({ kind: "event" as const, start: Date.parse(e.start_at!), event: e })),
    ...blocks.filter((t) => !isDone(t)).map((t) => ({ kind: "task" as const, start: Date.parse(t.plan_start_at!), task: t })),
  ].sort((a, b) => a.start - b.start);
  const nowIndex = timeline.findIndex((it) => it.start > now);

  const openDay = dayTasks.filter((t) => !isDone(t));
  const openRange = rangeTasks.filter((t) => !isDone(t));
  const done = [...blocks, ...dayTasks, ...rangeTasks].filter(isDone);

  function renderTask(t: TaskV2, opts: { faded?: boolean; extra?: string | null } = {}) {
    const subs = subtasksByParent[t.id] || [];
    const project = projectFor(t.project_id);
    const dl = deadlineLabel(t);
    const parts = [
      planMode(t) === "block" ? timeRangeLabel(t.plan_start_at!, t.plan_end_at!, today) : null,
      opts.extra,
      t.estimated_minutes ? `~${t.estimated_minutes} min` : null,
      dl ? (dl.overdue ? `⚠ ${dl.text}` : dl.text) : null,
      t.gcal_sync_state === "error" ? "⚠ nesynchronizované s Google" : null,
    ].filter(Boolean);
    return (
      <TaskRow
        key={t.id}
        faded={opts.faded}
        title={t.title}
        meta={parts.join(" · ") || null}
        priority={t.priority}
        compactMeta
        done={isDone(t)}
        busy={busyId === t.id}
        projectLabel={project?.name}
        projectColor={project?.accent_color}
        subtasks={subs.map((s) => ({ id: s.id, title: s.title, done: isDone(s) }))}
        expanded={!!expanded[t.id]}
        onToggleDone={() => toggleDone(t)}
        onToggleExpand={() => setExpanded((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
        onToggleSubtask={(id) => {
          const s = subs.find((x) => x.id === id);
          if (s) toggleDone(s);
        }}
        onDeleteSubtask={(id) => {
          const s = subs.find((x) => x.id === id);
          if (s) remove(s);
        }}
        onAddSubtask={() => addSubtask(t)}
        onEdit={() => {
          setModalError(null);
          setEditing({ task: t });
        }}
        onDelete={() => remove(t)}
        projects={projects}
        currentProjectId={t.project_id}
        onAssignProject={(pid) => run(t.id, () => updateTaskV2(createClient(), t.id, { project_id: pid }), "Nepodarilo sa priradiť projekt.")}
      />
    );
  }

  function eventWhen(e: EventRow): string {
    if (e.all_day) {
      return e.start_date === e.end_date ? `${shortDate(e.start_date!)}, celý deň` : `${shortDate(e.start_date!)} – ${shortDate(e.end_date!)}`;
    }
    const s = zonedDate(e.start_at!, TZ);
    return `${shortDate(s)}, ${timeRangeLabel(e.start_at!, e.end_at!, s)}`;
  }

  function dayPos(e: EventRow) {
    const span = e.all_day
      ? { allDay: true as const, startDate: e.start_date!, endDate: e.end_date! }
      : { allDay: false as const, startAt: e.start_at!, endAt: e.end_at! };
    const p = spanDayPosition(span, today, TZ);
    return p && p.total > 1 ? `deň ${p.index}/${p.total}` : null;
  }

  const nowLine = (
    <div key="now" className="flex items-center gap-2 py-1 text-[11px] font-semibold text-da-danger">
      <span className="h-px flex-grow bg-da-danger/60" />
      teraz {new Date(now).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}
      <span className="h-px flex-grow bg-da-danger/60" />
    </div>
  );

  const loading = tasks === null || events === null;
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
          {allDayEvents.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {allDayEvents.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setOpenEvent(e)}
                  className="rounded-full bg-da-chip-bg px-3 py-1 text-[13px] text-da-chip-text"
                >
                  {e.title}
                  {dayPos(e) ? ` · ${dayPos(e)}` : ""}
                </button>
              ))}
            </div>
          )}

          {timeline.length > 0 && (
            <div className="mb-4 flex flex-col gap-2">
              {timeline.map((it, idx) => (
                <div key={it.kind === "event" ? `e-${it.event.id}` : `t-${it.task.id}`} className="flex flex-col gap-2">
                  {idx === nowIndex && nowLine}
                  {it.kind === "event" ? (
                    <EventCard
                      title={it.event.title}
                      timeLabel={timeRangeLabel(it.event.start_at!, it.event.end_at!, today)}
                      location={it.event.location}
                      dayLabel={dayPos(it.event)}
                      onOpen={() => setOpenEvent(it.event)}
                    />
                  ) : (
                    renderTask(it.task)
                  )}
                </div>
              ))}
              {nowIndex === -1 && nowLine}
            </div>
          )}

          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-da-meta">Úlohy na dnes</div>
          {openDay.length === 0 && openRange.length === 0 && (
            <p className="mb-3 text-sm text-da-muted">Na dnes nemáš naplánované žiadne úlohy.</p>
          )}
          <div className="flex flex-col gap-2.5 pb-3">
            {openDay.map((t) => renderTask(t))}
            {openRange.map((t) =>
              renderTask(t, { faded: true, extra: `rozmedzie ${shortDate(t.plan_start_date!)} – ${shortDate(t.plan_end_date!)}` })
            )}
          </div>

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
              onClick={() => {
                setModalError(null);
                setEditing({ task: null });
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-da-chip-bg text-da-chip-text"
            >
              +
            </button>
          </div>

          <DoneDock count={done.length}>{done.map((t) => renderTask(t, { faded: true }))}</DoneDock>
        </>
      )}

      {editing && (
        <TaskEditModalV2
          initial={editing.task}
          defaultDay={today}
          projects={projects}
          saving={saving}
          error={modalError}
          onSave={save}
          onClose={() => setEditing(null)}
          onDelete={
            editing.task?.id
              ? () => {
                  const t = editing.task as TaskV2;
                  setEditing(null);
                  remove(t);
                }
              : undefined
          }
        />
      )}

      {openEvent && (
        <EventSheet
          title={openEvent.title}
          when={eventWhen(openEvent)}
          location={openEvent.location}
          description={openEvent.description}
          htmlLink={openEvent.html_link}
          projects={projects}
          projectId={openEvent.project_id}
          onAssignProject={(pid) => {
            const ev = openEvent;
            setOpenEvent({ ...ev, project_id: pid });
            setEventProject(createClient(), ev.id, pid).catch((err) => setError((err as Error).message));
          }}
          onCreateTask={() => {
            const ev = openEvent;
            setOpenEvent(null);
            setModalError(null);
            setEditing({
              task: {
                title: `Pripraviť: ${ev.title}`,
                project_id: ev.project_id,
                plan_start_date: ev.all_day ? ev.start_date : zonedDate(ev.start_at!, TZ),
              },
            });
          }}
          onClose={() => setOpenEvent(null)}
        />
      )}
    </div>
  );
}
