"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProjects, createProject, updateProject } from "@/lib/supabase/projects";
import {
  getAllProjectTasks,
  getTasks,
  getSubtasksFor,
  completeTask,
  uncompleteTask,
  createTask,
  updateTask,
  deleteTask,
} from "@/lib/supabase/tasks";
import ProgressRing from "@/components/ui/ProgressRing";
import TaskRow from "@/components/ui/TaskRow";
import TaskEditModal, { type TaskEditModalInitial, type TaskEditModalValues } from "@/components/ui/TaskEditModal";
import { ACCENT_SWATCHES, accentOrDefault, accentColor } from "@/lib/colorUtils";
import { sortTasksForDisplay } from "@/lib/taskSort";
import { usePersistedFlags, useScrollRestore } from "@/lib/usePersistedState";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string | null;
  deadline: string | null;
  accent_color: string | null;
};

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  due_date: string | null;
  start_date: string | null;
  scheduled_time: string | null;
  scheduled_time_end: string | null;
  context: string | null;
  estimated_minutes: number | null;
};

const GROUP_ORDER: { key: string; label: string }[] = [
  { key: "done", label: "Hotové" },
  { key: "progress", label: "Rozpracované" },
  { key: "planned", label: "Plánované" },
];

function groupKey(status: string) {
  if (status === "done") return "done";
  if (status === "in_progress") return "progress";
  return "planned";
}

type ProjectFormValues = {
  name: string;
  description: string;
  priority: string;
  deadline: string;
  accent_color: string | null;
};

function ProjectForm({
  initial,
  onSubmit,
  onCancel,
  saving,
  submitLabel,
}: {
  initial: ProjectFormValues;
  onSubmit: (v: ProjectFormValues) => void;
  onCancel: () => void;
  saving: boolean;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [priority, setPriority] = useState(initial.priority);
  const [deadline, setDeadline] = useState(initial.deadline);
  const [color, setColor] = useState<string | null>(initial.accent_color);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return;
        onSubmit({ name: name.trim(), description, priority, deadline, accent_color: color });
      }}
      className="mb-5 flex flex-col gap-2 rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
    >
      <input
        type="text"
        placeholder="Názov projektu"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-lg border border-da-border px-3 py-2 text-base"
        required
        autoFocus
      />
      <textarea
        placeholder="Popis (nepovinné)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-lg border border-da-border px-3 py-2 text-base"
        rows={2}
      />
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Priorita (nepovinné)"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-1/2 rounded-lg border border-da-border px-3 py-2 text-base"
        />
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="w-1/2 rounded-lg border border-da-border px-3 py-2 text-base"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-da-meta">Farba akcentu (nepovinné)</span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Bez vlastnej farby"
            onClick={() => setColor(null)}
            className="flex h-7 w-7 items-center justify-center rounded-full border-2"
            style={{ borderColor: color === null ? "rgb(var(--da-text))" : "transparent", background: "rgb(var(--da-chip-bg))" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--da-chip-text))" strokeWidth="2.4" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          {ACCENT_SWATCHES.map((sw) => (
            <button
              key={sw}
              type="button"
              aria-label={`Farba ${sw}`}
              onClick={() => setColor(sw)}
              className="h-7 w-7 rounded-full border-2"
              style={{ background: sw, borderColor: color === sw ? "rgb(var(--da-text))" : "transparent" }}
            />
          ))}
          <input
            type="color"
            aria-label="Vlastná farba"
            value={accentOrDefault(color)}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded-full border border-da-border bg-transparent p-0"
          />
        </div>
      </div>

      <div className="mt-1 flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="flex-grow rounded-lg bg-da-accent px-4 py-2 text-sm font-medium text-da-on-accent disabled:opacity-50"
        >
          {saving ? "Ukladám…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-da-border px-4 py-2 text-sm font-medium text-da-meta"
        >
          Zrušiť
        </button>
      </div>
    </form>
  );
}

// Denný agent 2.0 — "Projekty".
//
// Opravy/doplnky po reálnom testovaní (2026-09-23): predtým sa dal
// projekt iba vytvoriť, teraz sa dá aj upraviť (vrátane voliteľnej
// farby akcentu — migrácia 0005 — ktorá sa prenáša na jeho úlohy aj
// podúlohy naprieč celou appkou). V rámci projektu sa dá priradiť už
// existujúca úloha (predtým bez projektu/z iného projektu), pridať
// rovno nová úloha patriaca danému projektu, a každá úloha sa dá
// upraviť/zmazať (zdieľaný TaskRow + TaskEditModal ako na Dnes/Kalendár).
//
// 2026-09-25 — po reálnom testovaní: hlavička projektu mala predtým
// tri interaktívne prvky (celý riadok, ceruzku, šípku). Teraz je tam
// v zbalenom stave iba JEDNA šípka na rozbalenie — tlačidlo "Upraviť"
// sa zobrazí pod ňou až po rozbalení projektu. Rozbalené projekty/úlohy
// a scroll pozícia sa ukladajú, takže prežijú prepnutie na inú
// záložku a späť.
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [unassignedTasks, setUnassignedTasks] = useState<Task[]>([]);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, Task[]>>({});
  const [expandedProjects, setExpandedProjects] = usePersistedFlags("da_projects_expanded_projects");
  const [expandedTasks, setExpandedTasks] = usePersistedFlags("da_projects_expanded_tasks");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [savingProjectEdit, setSavingProjectEdit] = useState(false);

  const [assignPicks, setAssignPicks] = useState<Record<string, string>>({});
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);

  const [modalInitial, setModalInitial] = useState<TaskEditModalInitial | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useScrollRestore("da_scroll_projects", projects !== null);

  async function load() {
    const supabase = createClient();
    try {
      const [projectData, taskData, allOpenTasks] = await Promise.all([
        getProjects(supabase) as Promise<Project[]>,
        getAllProjectTasks(supabase) as Promise<Task[]>,
        getTasks(supabase) as Promise<Task[]>,
      ]);
      setProjects(projectData);
      setUnassignedTasks(allOpenTasks.filter((t) => !t.project_id));

      const grouped: Record<string, Task[]> = {};
      for (const t of taskData) {
        const pid = t.project_id as string;
        if (!grouped[pid]) grouped[pid] = [];
        grouped[pid].push(t);
      }
      setTasksByProject(grouped);

      const subs = (await getSubtasksFor(supabase, taskData.map((t) => t.id))) as Task[];
      const subGrouped: Record<string, Task[]> = {};
      for (const s of subs) {
        const pid = s.parent_task_id as string;
        if (!subGrouped[pid]) subGrouped[pid] = [];
        subGrouped[pid].push(s);
      }
      setSubtasksByParent(subGrouped);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať projekty.");
    }
  }

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-projects")
      .on("postgres_changes", { event: "*", schema: "public", table: "projects" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function handleCreateProject(v: ProjectFormValues) {
    setCreating(true);
    setError(null);
    try {
      const supabase = createClient();
      await createProject(supabase, {
        name: v.name,
        description: v.description.trim() || null,
        priority: v.priority.trim() || null,
        deadline: v.deadline || null,
        accent_color: v.accent_color,
      });
      setShowCreateForm(false);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa uložiť projekt.");
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateProject(id: string, v: ProjectFormValues) {
    setSavingProjectEdit(true);
    setError(null);
    try {
      const supabase = createClient();
      await updateProject(supabase, {
        id,
        name: v.name,
        description: v.description.trim() || null,
        priority: v.priority.trim() || null,
        deadline: v.deadline || null,
        accent_color: v.accent_color,
      });
      setEditingProjectId(null);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa uložiť zmeny projektu.");
    } finally {
      setSavingProjectEdit(false);
    }
  }

  async function handleToggleDone(t: Task) {
    setBusyId(t.id);
    try {
      const supabase = createClient();
      if (t.status === "done") await uncompleteTask(supabase, t.id);
      else await completeTask(supabase, t.id);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa aktualizovať úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggleSubtask(s: Task) {
    setBusyId(s.id);
    try {
      const supabase = createClient();
      if (s.status === "done") await uncompleteTask(supabase, s.id);
      else await completeTask(supabase, s.id);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa aktualizovať podúlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddSubtask(parentId: string) {
    const title = window.prompt("Názov podúlohy:");
    if (!title || !title.trim()) return;
    setBusyId(parentId);
    try {
      const supabase = createClient();
      await createTask(supabase, { title: title.trim(), parent_task_id: parentId });
      setExpandedTasks((prev) => ({ ...prev, [parentId]: true }));
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa pridať podúlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteTask(t: Task) {
    if (!confirm(`Naozaj natrvalo zmazať úlohu "${t.title}"?`)) return;
    setBusyId(t.id);
    try {
      const supabase = createClient();
      await deleteTask(supabase, t.id);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa zmazať úlohu.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReassignTask(taskId: string, projectId: string | null) {
    setBusyId(taskId);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id: taskId, project_id: projectId });
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa priradiť projekt.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssignExisting(projectId: string) {
    const taskId = assignPicks[projectId];
    if (!taskId) return;
    setBusyId(taskId);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id: taskId, project_id: projectId });
      setAssignPicks((prev) => ({ ...prev, [projectId]: "" }));
      setAssigningProjectId(null);
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa priradiť úlohu k projektu.");
    } finally {
      setBusyId(null);
    }
  }

  function openCreateTaskFor(projectId: string) {
    setModalError(null);
    setModalInitial({ project_id: projectId });
  }

  function openEditTask(t: Task) {
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
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">Projekty</h1>
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {projects === null && !error && <p className="text-da-muted">Načítavam…</p>}
      {projects !== null && projects.length === 0 && (
        <p className="text-da-muted">Zatiaľ žiadne projekty.</p>
      )}

      <div className="flex flex-col gap-3 pb-4">
        {projects?.map((p) => {
          const tasks = tasksByProject[p.id] || [];
          const doneCount = tasks.filter((t) => t.status === "done").length;
          const percent = tasks.length > 0 ? doneCount / tasks.length : 0;
          const isExpanded = !!expandedProjects[p.id];
          const accent = accentColor(p.accent_color);

          const groups: Record<string, Task[]> = { done: [], progress: [], planned: [] };
          for (const t of tasks) groups[groupKey(t.status)].push(t);

          if (editingProjectId === p.id) {
            return (
              <div key={p.id}>
                <ProjectForm
                  initial={{
                    name: p.name,
                    description: p.description || "",
                    priority: p.priority || "",
                    deadline: p.deadline || "",
                    accent_color: p.accent_color,
                  }}
                  onSubmit={(v) => handleUpdateProject(p.id, v)}
                  onCancel={() => setEditingProjectId(null)}
                  saving={savingProjectEdit}
                  submitLabel="Uložiť zmeny"
                />
              </div>
            );
          }

          return (
            <div key={p.id} className="rounded-da-card border border-da-border bg-da-card shadow-da-card">
              <div className="flex items-center gap-3.5 px-4 py-4">
                <button
                  type="button"
                  onClick={() => setExpandedProjects((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  className="flex min-w-0 flex-grow items-center gap-3.5 text-left"
                >
                  <ProgressRing percent={percent} size={34} color={accent} />
                  <span className="min-w-0 flex-grow">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: accent }}
                      />
                      <span className="block text-[15px] font-semibold">{p.name}</span>
                    </span>
                    <span className="mt-0.5 flex items-center gap-2 text-xs text-da-meta">
                      <span
                        className="rounded-full px-2 py-0.5 text-[11px]"
                        style={{
                          background: p.status === "active" ? "rgb(var(--da-accent-soft))" : "rgb(var(--da-chip-bg))",
                          color: p.status === "active" ? "rgb(var(--da-accent-soft-text))" : "rgb(var(--da-chip-text))",
                        }}
                      >
                        {p.status === "active" ? "Aktívny" : p.status === "done" ? "Hotový" : "Plánovaný"}
                      </span>
                      {p.deadline ? `deadline ${p.deadline}` : ""}
                    </span>
                  </span>
                </button>

                {/* 2026-09-25 — jediné tlačidlo na rozbalenie; "Upraviť"
                    sa zobrazí pod ním až po rozbalení projektu (predtým
                    bola ceruzka vždy viditeľná vedľa šípky). */}
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setExpandedProjects((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                    aria-label={isExpanded ? "Zbaliť projekt" : "Rozbaliť projekt"}
                    className="flex h-7 w-7 shrink-0 items-center justify-center text-da-muted"
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <button
                      type="button"
                      aria-label={`Upraviť projekt: ${p.name}`}
                      onClick={() => {
                        setEditingProjectId(p.id);
                        setShowCreateForm(false);
                      }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center text-da-muted"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>

              {p.description && <p className="px-4 pb-3 text-sm text-da-meta">{p.description}</p>}

              {isExpanded && (
                <div className="flex flex-col gap-3 border-t border-da-border px-4 py-3.5">
                  {tasks.length === 0 && (
                    <p className="text-sm text-da-muted">Zatiaľ žiadne úlohy v tomto projekte.</p>
                  )}
                  {GROUP_ORDER.filter((g) => groups[g.key].length > 0).map((g) => (
                    <div key={g.key} className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-da-muted">
                        {g.label}
                      </span>
                      {sortTasksForDisplay(groups[g.key]).map((t) => {
                        const subs = subtasksByParent[t.id] || [];
                        return (
                          <TaskRow
                            key={t.id}
                            bare
                            title={t.title}
                            priority={t.priority}
                            done={t.status === "done"}
                            busy={busyId === t.id}
                            projectColor={p.accent_color}
                            subtasks={subs.map((s) => ({ id: s.id, title: s.title, done: s.status === "done" }))}
                            expanded={!!expandedTasks[t.id]}
                            onToggleDone={() => handleToggleDone(t)}
                            onToggleExpand={() =>
                              setExpandedTasks((prev) => ({ ...prev, [t.id]: !prev[t.id] }))
                            }
                            onToggleSubtask={(subId) => {
                              const sub = subs.find((s) => s.id === subId);
                              if (sub) handleToggleSubtask(sub);
                            }}
                            onAddSubtask={() => handleAddSubtask(t.id)}
                            onEdit={() => openEditTask(t)}
                            onDelete={() => handleDeleteTask(t)}
                            projects={(projects || []).map((pr) => ({ id: pr.id, name: pr.name }))}
                            currentProjectId={t.project_id}
                            onAssignProject={(pid) => handleReassignTask(t.id, pid)}
                          />
                        );
                      })}
                    </div>
                  ))}

                  <div className="flex items-center gap-2 border-t border-da-border/70 pt-3">
                    <button
                      type="button"
                      aria-label="Nová úloha v projekte"
                      onClick={() => openCreateTaskFor(p.id)}
                      className="flex h-7 w-7 shrink-0 items-center justify-center"
                      style={{ color: accent }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>

                    {assigningProjectId === p.id ? (
                      <div className="flex min-w-0 flex-grow justify-end gap-2">
                        <select
                          value={assignPicks[p.id] || ""}
                          onChange={(e) => setAssignPicks((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          className="min-w-0 max-w-[65%] rounded-lg border border-da-border px-2 py-1.5 text-sm"
                        >
                          <option value="">— vyber existujúcu úlohu —</option>
                          {unassignedTasks.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handleAssignExisting(p.id)}
                          disabled={!assignPicks[p.id]}
                          className="shrink-0 rounded-lg bg-da-accent px-3 py-1.5 text-xs font-medium text-da-on-accent disabled:opacity-50"
                        >
                          Priradiť
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAssigningProjectId(p.id)}
                        className="ml-auto text-sm font-medium text-da-meta"
                      >
                        Priradiť existujúcu úlohu…
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCreateForm && (
        <ProjectForm
          initial={{ name: "", description: "", priority: "", deadline: "", accent_color: null }}
          onSubmit={handleCreateProject}
          onCancel={() => setShowCreateForm(false)}
          saving={creating}
          submitLabel="Pridať projekt"
        />
      )}

      <div className="flex justify-end pb-6">
        <button
          type="button"
          aria-label="Nový projekt"
          onClick={() => {
            setShowCreateForm((v) => !v);
            setEditingProjectId(null);
          }}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-da-chip-bg text-da-chip-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {modalInitial && (
        <TaskEditModal
          initial={modalInitial}
          projects={(projects || []).map((p) => ({ id: p.id, name: p.name }))}
          saving={modalSaving}
          error={modalError}
          onSave={handleModalSave}
          onClose={() => setModalInitial(null)}
        />
      )}
    </div>
  );
}
