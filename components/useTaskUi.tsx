"use client";

// v2.2 — spoločná logika úloh pre Dnes a Kalendár: vykreslenie riadku úlohy
// (TaskRow), akcie (odškrtnúť optimisticky, podúloha, zmazať, projekt),
// editor úlohy a detail udalosti.

import { useState, type Dispatch, type SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import { zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";
import { planMode } from "@/lib/model/taskPlan";
import { timeRangeLabel, deadlineLabel, shortDate } from "@/lib/model/labels";
import { setEventProject, type EventRow } from "@/lib/supabase/events";
import { createTaskV2, updateTaskV2, setTaskDone, deleteTaskV2, type TaskV2, type TaskV2Input } from "@/lib/supabase/tasksV2";
import TaskRow from "@/components/ui/TaskRow";
import EventSheet from "@/components/ui/EventSheet";
import TaskEditModalV2 from "@/components/ui/TaskEditModalV2";
import { isTaskDone } from "@/components/DayView";

const TZ = DEFAULT_TIME_ZONE;
export type UiProject = { id: string; name: string; accent_color: string | null };

export function useTaskUi({
  day,
  projects,
  subtasksByParent,
  setTasks,
  setSubtasksByParent,
  expanded,
  setExpanded,
  reload,
  setError,
}: {
  day: string;
  projects: UiProject[];
  subtasksByParent: Record<string, TaskV2[]>;
  setTasks: Dispatch<SetStateAction<TaskV2[] | null>>;
  setSubtasksByParent: Dispatch<SetStateAction<Record<string, TaskV2[]>>>;
  expanded: Record<string, boolean>;
  setExpanded: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  reload: () => void;
  setError: (msg: string | null) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ task: Partial<TaskV2> | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<EventRow | null>(null);

  const projectFor = (id: string | null) => (id ? projects.find((p) => p.id === id) || null : null);

  async function run(id: string, fn: () => Promise<unknown>, msg: string) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError((err as Error)?.message || msg);
      reload();
    } finally {
      setBusyId(null);
    }
  }

  function toggleDone(t: TaskV2) {
    const done = !isTaskDone(t);
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
    setTasks((prev) => prev && prev.filter((x) => x.id !== t.id));
    run(t.id, () => deleteTaskV2(createClient(), t), "Nepodarilo sa zmazať úlohu.");
  }

  // „Odobrať z dňa“: plán sa vyprázdni → úloha sa vráti do poolu
  // (Kedykoľvek / Po termíne). Bol to blok → updateTaskV2 zmaže udalosť v Google.
  function unplan(t: TaskV2) {
    setTasks((prev) => prev && prev.filter((x) => x.id !== t.id));
    run(
      t.id,
      () =>
        updateTaskV2(createClient(), t.id, { plan_start_date: null, plan_end_date: null, plan_start_at: null, plan_end_at: null }).then(() =>
          reload()
        ),
      "Nepodarilo sa odobrať úlohu z dňa."
    );
  }

  function openCreate(initial: Partial<TaskV2> | null = null) {
    setModalError(null);
    setEditing({ task: initial });
  }

  function openEdit(t: TaskV2) {
    setModalError(null);
    setEditing({ task: t });
  }

  async function save(values: TaskV2Input & { title: string }) {
    setSaving(true);
    setModalError(null);
    try {
      const supabase = createClient();
      if (editing?.task?.id) await updateTaskV2(supabase, editing.task.id, values);
      else await createTaskV2(supabase, values);
      setEditing(null);
      reload();
    } catch (err) {
      setModalError((err as Error)?.message || "Nepodarilo sa uložiť úlohu.");
    } finally {
      setSaving(false);
    }
  }

  function renderTask(t: TaskV2, opts: { faded?: boolean; extra?: string | null } = {}) {
    const subs = subtasksByParent[t.id] || [];
    const project = projectFor(t.project_id);
    const dl = deadlineLabel(t);
    const parts = [
      planMode(t) === "block" ? timeRangeLabel(t.plan_start_at!, t.plan_end_at!, day) : null,
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
        done={isTaskDone(t)}
        busy={busyId === t.id}
        projectLabel={project?.name}
        projectColor={project?.accent_color}
        subtasks={subs.map((s) => ({ id: s.id, title: s.title, done: isTaskDone(s) }))}
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
        onEdit={() => openEdit(t)}
        onDelete={() => remove(t)}
        onUnassign={!t.parent_task_id && planMode(t) !== "anytime" ? () => unplan(t) : undefined}
        projects={projects}
        currentProjectId={t.project_id}
        onAssignProject={(pid) => run(t.id, () => updateTaskV2(createClient(), t.id, { project_id: pid }), "Nepodarilo sa priradiť projekt.")}
      />
    );
  }

  function eventWhen(e: EventRow): string {
    if (e.all_day) {
      return e.start_date === e.end_date
        ? `${shortDate(e.start_date!)}, celý deň`
        : `${shortDate(e.start_date!)} – ${shortDate(e.end_date!)}`;
    }
    const s = zonedDate(e.start_at!, TZ);
    const eDay = zonedDate(new Date(Date.parse(e.end_at!) - 1), TZ);
    return s === eDay
      ? `${shortDate(s)}, ${timeRangeLabel(e.start_at!, e.end_at!, s)}`
      : `${shortDate(s)} ${timeRangeLabel(e.start_at!, e.end_at!, s)} – ${shortDate(eDay)} ${timeRangeLabel(e.start_at!, e.end_at!, eDay)}`;
  }

  const overlays = (
    <>
      {editing && (
        <TaskEditModalV2
          initial={editing.task}
          defaultDay={day}
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
            openCreate({
              title: `Pripraviť: ${ev.title}`,
              project_id: ev.project_id,
              plan_start_date: ev.all_day ? ev.start_date : zonedDate(ev.start_at!, TZ),
            });
          }}
          onClose={() => setOpenEvent(null)}
        />
      )}
    </>
  );

  return { renderTask, openCreate, openEdit, remove, run, busyId, setOpenEvent, overlays };
}
