"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getTasksInRange,
  getSubtasksFor,
  completeTask,
  uncompleteTask,
  createTask,
} from "@/lib/supabase/tasks";
import NotificationsPrompt from "@/components/NotificationsPrompt";
import TaskRow from "@/components/ui/TaskRow";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  due_date: string | null;
  scheduled_time: string | null;
  parent_task_id: string | null;
};

function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function taskMeta(t: Task) {
  const time = t.scheduled_time
    ? new Date(t.scheduled_time).toLocaleTimeString("sk-SK", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
  const parts = [time, t.priority ? `${t.priority} priorita` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "bez času";
}

// Denný agent 2.0 — "Dnes": rovnaká dátová vrstva ako predtým (tasks s
// due_date = dnes), ale hotové úlohy teraz OSTÁVAJÚ v zozname (len
// vizuálne odlíšené) a pribudli podúlohy (parent_task_id, migrácia
// 0004) — krúžok vedľa úlohy ukazuje podiel dokončených podúloh.
export default function TodayPage() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, Task[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    try {
      const { start, end } = todayRange();
      const taskData = (await getTasksInRange(supabase, start, end)) as Task[];
      setTasks(taskData);

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

  return (
    <div className="px-5 pt-6">
      <h1 className="mb-1 text-[21px] font-bold">Dnes</h1>
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
        <div className="flex flex-col gap-2.5">
          {tasks.map((t) => {
            const subs = subtasksByParent[t.id] || [];
            return (
              <TaskRow
                key={t.id}
                title={t.title}
                meta={taskMeta(t)}
                done={t.status === "done"}
                busy={busyId === t.id}
                subtasks={subs.map((s) => ({ id: s.id, title: s.title, done: s.status === "done" }))}
                expanded={!!expanded[t.id]}
                onToggleDone={() => handleToggleDone(t)}
                onToggleExpand={() => handleToggleExpand(t.id)}
                onToggleSubtask={(subId) => {
                  const sub = subs.find((s) => s.id === subId);
                  if (sub) handleToggleSubtask(sub);
                }}
                onAddSubtask={() => handleAddSubtask(t.id)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
