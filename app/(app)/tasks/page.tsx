"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getTasks, getSubtasksFor, updateTask, createTask, deleteTask, completeTask, uncompleteTask } from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";
import TaskRow from "@/components/ui/TaskRow";
import { sortTasksForDisplay } from "@/lib/taskSort";
import { usePersistedFlags, useScrollRestore } from "@/lib/usePersistedState";
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
  scheduled_time: string | null;
  depends_on_task_id: string | null;
  parent_task_id: string | null;
  context: string | null;
  estimated_minutes: number | null;
  created_at: string;
};

type Project = { id: string; name: string; accent_color: string | null };

function taskMeta(t: Task) {
  const parts = [
    t.start_date ? `od ${t.start_date}` : null,
    t.due_date ? `termín ${t.due_date}` : "bez termínu",
    t.estimated_minutes ? `~${t.estimated_minutes} min` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

// Interaktívny zoznam úloh nad rovnakou dátovou vrstvou (lib/supabase/tasks.ts),
// akú používa aj hlasový agent — zmeny odtiaľto aj z hlasu sa navzájom
// hneď odzrkadlia. Realtime počúvanie.
//
// Denný agent 2.0 (redesign-2-0, 2026-09-23) — prerobené z jednoduchého
// zoznamu (iba Dokončiť/Zmazať/rýchly <select> na projekt) na plnohodnotné
// úpravy priamo v UI namiesto spoliehania sa na hlasové ovládanie:
// zdieľaný TaskRow (rozbalenie/podúlohy/farba projektu) + TaskEditModal
// s plným formulárom (názov, popis, projekt, priorita, termíny, presný
// čas, odhad trvania, podmienka, stav) na vytvorenie aj úpravu úlohy.
//
// 2026-09-25 — rozbalené úlohy a scroll pozícia sa ukladajú (rovnaký
// vzor ako na Dnes/Kalendár/Projekty), takže prežijú prepnutie na inú
// záložku a späť.
export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, Task[]>>({});
  const [expanded, setExpanded] = usePersistedFlags("da_tasks_expanded");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalInitial, setModalInitial] = useState<TaskEditModalInitial | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useScrollRestore("da_scroll_tasks", tasks !== null);

  async function load() {
    const supabase = createClient();
    try {
      const [taskData, projectData] = await Promise.all([
        getTasks(supabase) as Promise<Task[]>,
        getProjects(supabase) as Promise<Project[]>,
      ]);
      setTasks(taskData);
      setProjects(projectData);

      const subs = (await getSubtasksFor(supabase, taskData.map((t) => t.id))) as Task[];
      const grouped: Record<string, Task[]> = {};
      for (const s of subs) {
        const pid = s.parent_task_id as unknown as string;
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
      .channel("realtime-tasks")
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

  async function handleToggleDone(t: Task) {
    setBusyId(t.id);
    setError(null);
    try {
      const supabase = createClient();
      if (t.status === "done") await uncompleteTask(supabase, t.id);
      else await completeTask(supabase, t.id);
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa aktualizovať úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleSubtask(s: Task) {
    setBusyId(s.id);
    setError(null);
    try {
      const supabase = createClient();
      if (s.status === "done") await uncompleteTask(supabase, s.id);
      else await completeTask(supabase, s.id);
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
    setModalInitial({});
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
      <Link href="/more" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-da-placeholder">
        ‹ Viac
      </Link>

      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">Úlohy</h1>
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
      {!error && tasks !== null && (
        <p className="mb-4 text-sm text-da-meta">
          {tasks.length} {tasks.length === 1 ? "úloha" : "úloh"}
        </p>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!error && tasks === null && <p className="text-da-muted">Načítavam…</p>}

      {!error && tasks !== null && tasks.length === 0 && (
        <p className="text-da-muted">Žiadne nedokončené úlohy.</p>
      )}

      {!error && tasks !== null && tasks.length > 0 && (
        <div className="flex flex-col gap-2.5 pb-4">
          {sortTasksForDisplay(tasks).map((t) => {
            const subs = subtasksByParent[t.id] || [];
            const project = projectFor(t.project_id);
            return (
              <TaskRow
                key={t.id}
                title={t.title}
                meta={taskMeta(t)}
                done={t.status === "done"}
                busy={busyId === t.id}
                projectLabel={project?.name}
                projectColor={project?.accent_color}
                subtasks={subs.map((s) => ({ id: s.id, title: s.title, done: s.status === "done" }))}
                expanded={!!expanded[t.id]}
                onToggleDone={() => handleToggleDone(t)}
                onToggleExpand={() => setExpanded((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
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
