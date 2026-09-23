"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProjects, createProject } from "@/lib/supabase/projects";
import {
  getAllProjectTasks,
  getSubtasksFor,
  completeTask,
  uncompleteTask,
  createTask,
} from "@/lib/supabase/tasks";
import ProgressRing from "@/components/ui/ProgressRing";
import TaskRow from "@/components/ui/TaskRow";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string | null;
  deadline: string | null;
};

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  project_id: string | null;
  parent_task_id: string | null;
  due_date: string | null;
  scheduled_time: string | null;
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

// Denný agent 2.0 — "Projekty": malé "+" namiesto širokého prerušovaného
// tlačidla, rozbaliteľné karty projektov so skupinami Hotové →
// Rozpracované → Plánované (podľa tasks.status), úlohy s podúlohami sa
// dajú rozbaliť samostatne (zdieľaný TaskRow ako na Dnes).
export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({});
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, Task[]>>({});
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    try {
      const [projectData, taskData] = await Promise.all([
        getProjects(supabase) as Promise<Project[]>,
        getAllProjectTasks(supabase) as Promise<Task[]>,
      ]);
      setProjects(projectData);

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

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      await createProject(supabase, {
        name: name.trim(),
        description: description.trim() || null,
        priority: priority.trim() || null,
        deadline: deadline || null,
      });
      setName("");
      setDescription("");
      setPriority("");
      setDeadline("");
      setShowForm(false);
      await load();
    } catch (err) {
      const e2 = err as Error;
      setError(e2?.message || "Nepodarilo sa uložiť projekt.");
    } finally {
      setSaving(false);
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

  const activeCount = projects?.filter((p) => p.status === "active").length ?? 0;
  const plannedCount = projects?.filter((p) => p.status !== "active" && p.status !== "done").length ?? 0;

  return (
    <div className="px-5 pt-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-[21px] font-bold">Projekty</h1>
        <button
          type="button"
          aria-label="Nový projekt"
          onClick={() => setShowForm((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-da-accent text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      {projects !== null && (
        <p className="mb-4 text-sm text-da-meta">
          {activeCount} aktívne{plannedCount > 0 ? ` · ${plannedCount} plánovaných` : ""}
        </p>
      )}

      {showForm && (
        <form
          onSubmit={handleCreateProject}
          className="mb-5 flex flex-col gap-2 rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
        >
          <input
            type="text"
            placeholder="Názov projektu"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-da-border px-3 py-2 text-sm"
            required
          />
          <textarea
            placeholder="Popis (nepovinné)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-da-border px-3 py-2 text-sm"
            rows={2}
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Priorita (nepovinné)"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-1/2 rounded-lg border border-da-border px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-1/2 rounded-lg border border-da-border px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-lg bg-da-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Ukladám…" : "Pridať projekt"}
          </button>
        </form>
      )}

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

          const groups: Record<string, Task[]> = { done: [], progress: [], planned: [] };
          for (const t of tasks) groups[groupKey(t.status)].push(t);

          return (
            <div key={p.id} className="rounded-da-card border border-da-border bg-da-card shadow-da-card">
              <button
                type="button"
                onClick={() =>
                  setExpandedProjects((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                }
                className="flex w-full items-center gap-3.5 px-4 py-4 text-left"
              >
                <ProgressRing percent={percent} size={34} />
                <span className="min-w-0 flex-grow">
                  <span className="block text-[15px] font-semibold">{p.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-da-meta">
                    <span
                      className="rounded-full px-2 py-0.5 text-[11px]"
                      style={{
                        background: p.status === "active" ? "#E7EFE7" : "#F1EEE7",
                        color: p.status === "active" ? "#3F5C48" : "#8A8172",
                      }}
                    >
                      {p.status === "active" ? "Aktívny" : p.status === "done" ? "Hotový" : "Plánovaný"}
                    </span>
                    {p.deadline ? `deadline ${p.deadline}` : ""}
                  </span>
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9A9384"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>

              {p.description && (
                <p className="px-4 pb-3 text-sm text-da-meta">{p.description}</p>
              )}

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
                      {groups[g.key].map((t) => {
                        const subs = subtasksByParent[t.id] || [];
                        return (
                          <TaskRow
                            key={t.id}
                            bare
                            title={t.title}
                            done={t.status === "done"}
                            busy={busyId === t.id}
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
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
