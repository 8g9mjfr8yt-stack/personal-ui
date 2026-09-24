"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getTasksInRange,
  getSubtasksFor,
  completeTask,
  uncompleteTask,
  createTask,
  updateTask,
  deleteTask,
} from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";
import { todayISO } from "@/lib/dateUtils";
import { sortTasksForDisplay } from "@/lib/taskSort";
import { usePersistedFlags, useScrollRestore } from "@/lib/usePersistedState";
import NotificationsPrompt from "@/components/NotificationsPrompt";
import TaskRow from "@/components/ui/TaskRow";
import TaskEditModal, { type TaskEditModalInitial, type TaskEditModalValues } from "@/components/ui/TaskEditModal";

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  project_id: string | null;
  due_date: string | null;
  start_date: string | null;
  assigned_date: string | null;
  scheduled_time: string | null;
  scheduled_time_end: string | null;
  parent_task_id: string | null;
  context: string | null;
  estimated_minutes: number | null;
  google_event_id: string | null;
};

type Project = { id: string; name: string; accent_color: string | null };

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

function isAllDayGoogleEvent(t: Task) {
  return !!t.google_event_id && !t.scheduled_time;
}

// Kompaktný meta text pre Dnes — čas (priorita a počet podúloh sa
// zobrazujú až po rozbalení, pozri TaskRow `compactMeta`). `day` je vždy
// dnešný dátum (Dnes zobrazuje iba jeden deň) — rovnaká logika ako
// taskMeta v app/(app)/calendar/page.tsx, pozri tam podrobný komentár.
function taskMeta(t: Task, day: string): string | null {
  if (isAllDayGoogleEvent(t)) return "celý deň";
  if (!t.scheduled_time) return null;

  const isMultiDay = !!(
    t.google_event_id &&
    t.start_date &&
    t.due_date &&
    t.start_date !== t.due_date
  );
  const startTime = formatTime(t.scheduled_time);
  const endTime = t.scheduled_time_end ? formatTime(t.scheduled_time_end) : null;

  if (!isMultiDay) {
    return endTime ? `${startTime}–${endTime}` : startTime;
  }
  if (day === t.start_date) return `od ${startTime} - celý deň`;
  if (day === t.due_date) return `celý deň - do ${endTime ?? startTime}`;
  return "celý deň";
}

// Denný agent 2.0 — "Dnes": tasks s due_date = dnes (oprava
// 2026-09-23: dnešný rozsah sa teraz počíta cez lokálne dateUtils,
// pôvodný toISOString().slice(0,10) mohol pri kladnom časovom pásme
// vrátiť včerajší dátum). Hotové úlohy OSTÁVAJÚ v zozname (len
// vizuálne odlíšené). Každá úloha sa dá rozbaliť/pridať jej podúlohu
// bez ohľadu na to, či už nejakú má, upraviť (celý formulár vrátane
// projektu) aj zmazať.
//
// 2026-09-25 — po reálnom testovaní: rozbalené úlohy a scroll pozícia
// sa teraz ukladajú (usePersistedFlags/useScrollRestore), takže po
// prepnutí na inú záložku a späť zostane obrazovka presne taká, akú
// používateľ opustil.
export default function TodayPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, Task[]>>({});
  const [expanded, setExpanded] = usePersistedFlags("da_today_expanded");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalInitial, setModalInitial] = useState<TaskEditModalInitial | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useScrollRestore("da_scroll_today", tasks !== null);

  async function load() {
    const supabase = createClient();
    try {
      const today = todayISO();
      // Koniec rozsahu (exkluzívne) = zajtra, počítané z lokálnych
      // komponentov dátumu (pozri dateUtils.toISODate) — nie cez
      // toISOString(), ktorá by pre kladné časové pásmo mohla posunúť
      // dátum o deň.
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const end = new Date(tomorrowDate.getFullYear(), tomorrowDate.getMonth(), tomorrowDate.getDate());
      const endISO = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(
        end.getDate()
      ).padStart(2, "0")}`;

      const [taskData, projectData] = await Promise.all([
        getTasksInRange(supabase, today, endISO) as Promise<Task[]>,
        getProjects(supabase) as Promise<Project[]>,
      ]);
      setTasks(taskData);
      setProjects(projectData);

      const subs = (await getSubtasksFor(
        supabase,
        taskData.map((t) => t.id)
      )) as Task[];
      const grouped: Record<string, Task[]> = {};
      for (const s of subs) {
        const pid = s.parent_task_id as string;
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(s);
      }
      setSubtasksByParent(grouped);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať úlohy.");
    }
  }

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-today-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function projectFor(id: string | null) {
    if (!id) return null;
    return projects.find((p) => p.id === id) || null;
  }

  async function handleToggleDone(task: Task) {
    setBusyId(task.id);
    setError(null);
    try {
      const supabase = createClient();
      if (task.status === "done") {
        await uncompleteTask(supabase, task.id);
      } else {
        await completeTask(supabase, task.id);
      }
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa aktualizovať úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  function handleToggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  async function handleToggleSubtask(sub: Task) {
    setBusyId(sub.id);
    setError(null);
    try {
      const supabase = createClient();
      if (sub.status === "done") {
        await uncompleteTask(supabase, sub.id);
      } else {
        await completeTask(supabase, sub.id);
      }
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa aktualizovať podúlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddSubtask(parentId: string) {
    const title = window.prompt("Názov podúlohy:");
    if (!title || !title.trim()) return;
    setBusyId(parentId);
    setError(null);
    try {
      const supabase = createClient();
      await createTask(supabase, { title: title.trim(), parent_task_id: parentId });
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa pridať podúlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(t: Task) {
    if (!confirm(`Naozaj natrvalo zmazať úlohu "${t.title}"?`)) return;
    setBusyId(t.id);
    setError(null);
    try {
      const supabase = createClient();
      await deleteTask(supabase, t.id);
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa zmazať úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssignProject(taskId: string, projectId: string | null) {
    setBusyId(taskId);
    setError(null);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id: taskId, project_id: projectId });
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa priradiť projekt.");
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setModalError(null);
    setModalInitial({ due_date: todayISO() });
  }

  function openEdit(t: Task) {
    setModalError(null);
    setModalInitial({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      project_id: t.project_id,
      due_date: t.due_date,
      start_date: t.start_date,
      scheduled_time: t.scheduled_time,
      scheduled_time_end: t.scheduled_time_end,
      estimated_minutes: t.estimated_minutes,
      context: t.context,
      status: t.status,
    });
  }

  async function handleModalSave(values: TaskEditModalValues) {
    if (!modalInitial) return;
    setModalSaving(true);
    setModalError(null);
    try {
      const supabase = createClient();
      if (modalInitial.id) {
        await updateTask(supabase, { id: modalInitial.id, ...values });
      } else {
        await createTask(supabase, values);
      }
      setModalInitial(null);
      await load();
    } catch (err) {
      const e = err as Error;
      setModalError(e?.message || "Nepodarilo sa uložiť úlohu.");
    } finally {
      setModalSaving(false);
    }
  }

  return (
    <div className="px-5 pt-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">Dnes</h1>
      </div>
      <p className="mb-4 text-sm text-da-meta">
        {new Date().toLocaleDateString("sk-SK", { weekday: "long", day: "numeric", month: "long" })}
      </p>

      <NotificationsPrompt />

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!error && tasks === null && <p className="text-da-muted">Načítavam…</p>}

      {!error && tasks !== null && tasks.length === 0 && (
        <p className="text-da-muted">Na dnes nemáš žiadne naplánované úlohy.</p>
      )}

      {tasks !== null && tasks.length > 0 && (
        <div className="flex flex-col gap-2.5 pb-4">
          {sortTasksForDisplay(tasks).map((t) => {
            const subs = subtasksByParent[t.id] || [];
            const project = projectFor(t.project_id);
            return (
              <TaskRow
                key={t.id}
                title={t.title}
                meta={taskMeta(t, todayISO())}
                priority={t.priority}
                compactMeta
                done={t.status === "done"}
                busy={busyId === t.id}
                projectLabel={project?.name}
                projectColor={project?.accent_color}
                subtasks={subs.map((s) => ({ id: s.id, title: s.title, done: s.status === "done" }))}
                expanded={!!expanded[t.id]}
                onToggleDone={() => handleToggleDone(t)}
                onToggleExpand={() => handleToggleExpand(t.id)}
                onToggleSubtask={(subId) => {
                  const sub = subs.find((s) => s.id === subId);
                  if (sub) handleToggleSubtask(sub);
                }}
                onAddSubtask={() => handleAddSubtask(t.id)}
                onEdit={() => openEdit(t)}
                onDelete={() => handleDelete(t)}
                projects={projects}
                currentProjectId={t.project_id}
                onAssignProject={(pid) => handleAssignProject(t.id, pid)}
              />
            );
          })}
        </div>
      )}

      <div className="flex justify-end pb-4">
        <button
          type="button"
          aria-label="Nová úloha"
          onClick={openCreate}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-da-accent text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {modalInitial && (
        <TaskEditModal
          initial={modalInitial}
          projects={projects}
          saving={modalSaving}
          error={modalError}
          onSave={handleModalSave}
          onClose={() => setModalInitial(null)}
        />
      )}
    </div>
  );
}
