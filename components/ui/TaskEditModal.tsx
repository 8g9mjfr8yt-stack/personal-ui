"use client";

import { useState, type FormEvent } from "react";

export type TaskEditModalProject = { id: string; name: string };

export type TaskEditModalInitial = {
  id?: string;
  title?: string;
  description?: string | null;
  priority?: string | null;
  project_id?: string | null;
  due_date?: string | null;
  start_date?: string | null;
  scheduled_time?: string | null;
  estimated_minutes?: number | null;
  context?: string | null;
  status?: string | null;
};

export type TaskEditModalValues = {
  title: string;
  description: string | null;
  priority: string | null;
  project_id: string | null;
  due_date: string | null;
  start_date: string | null;
  scheduled_time: string | null;
  estimated_minutes: number | null;
  context: string | null;
  status: string;
};

// Zdieľaný formulár na vytvorenie NOVEJ aj úpravu EXISTUJÚCEJ úlohy —
// používaný z Dnes, Kalendár, Projekty aj Úlohy (Denný agent 2.0, oprava
// po reálnom testovaní: predtým sa dala úloha vytvoriť/podrobne upraviť
// iba cez hlasového agenta, teraz priamo aj v UI, naprieč všetkými
// obrazovkami).
export default function TaskEditModal({
  initial,
  projects,
  onSave,
  onClose,
  saving,
  error,
}: {
  initial: TaskEditModalInitial;
  projects: TaskEditModalProject[];
  onSave: (values: TaskEditModalValues) => void;
  onClose: () => void;
  saving?: boolean;
  error?: string | null;
}) {
  const [title, setTitle] = useState(initial.title || "");
  const [description, setDescription] = useState(initial.description || "");
  const [priority, setPriority] = useState(initial.priority || "");
  const [projectId, setProjectId] = useState(initial.project_id || "");
  const [dueDate, setDueDate] = useState(initial.due_date || "");
  const [startDate, setStartDate] = useState(initial.start_date || "");
  const [scheduledTime, setScheduledTime] = useState(
    initial.scheduled_time ? initial.scheduled_time.slice(0, 16) : ""
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initial.estimated_minutes != null ? String(initial.estimated_minutes) : ""
  );
  const [context, setContext] = useState(initial.context || "");
  const [status, setStatus] = useState(initial.status || "todo");

  const isEdit = !!initial.id;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      description: description.trim() || null,
      priority: priority.trim() || null,
      project_id: projectId || null,
      due_date: dueDate || null,
      start_date: startDate || null,
      scheduled_time: scheduledTime ? new Date(scheduledTime).toISOString() : null,
      estimated_minutes: estimatedMinutes.trim() ? Number(estimatedMinutes) : null,
      context: context.trim() || null,
      status,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-md flex-col gap-3 overflow-y-auto rounded-t-[28px] bg-da-bg p-5 sm:rounded-da-card"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-da-text">{isEdit ? "Upraviť úlohu" : "Nová úloha"}</h2>
          <button
            type="button"
            aria-label="Zavrieť"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center text-da-muted"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <input
          type="text"
          placeholder="Názov úlohy"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-da-border bg-da-card px-3 py-2 text-sm text-da-text"
          required
          autoFocus
        />

        <textarea
          placeholder="Popis (nepovinné)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-da-border bg-da-card px-3 py-2 text-sm text-da-text"
        />

        <div className="flex gap-2">
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-1/2 rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
          >
            <option value="">— bez projektu —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-1/2 rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
          >
            <option value="">bez priority</option>
            <option value="low">nízka</option>
            <option value="medium">stredná</option>
            <option value="high">vysoká</option>
          </select>
        </div>

        <div className="flex gap-2">
          <label className="flex w-1/2 flex-col gap-1 text-xs text-da-meta">
            Od (nepovinné)
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
            />
          </label>
          <label className="flex w-1/2 flex-col gap-1 text-xs text-da-meta">
            Termín
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
            />
          </label>
        </div>

        <div className="flex gap-2">
          <label className="flex w-1/2 flex-col gap-1 text-xs text-da-meta">
            Presný čas (nepovinné)
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
            />
          </label>
          <label className="flex w-1/2 flex-col gap-1 text-xs text-da-meta">
            Odhad (min)
            <input
              type="number"
              min="0"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              className="rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
            />
          </label>
        </div>

        <input
          type="text"
          placeholder="Podmienka/spúšťač (nepovinné, napr. 'keď bude pekný víkend')"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          className="w-full rounded-lg border border-da-border bg-da-card px-3 py-2 text-sm text-da-text"
        />

        {isEdit && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
          >
            <option value="todo">stav: todo</option>
            <option value="in_progress">stav: in_progress</option>
            <option value="done">stav: done</option>
          </select>
        )}

        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="mt-1 rounded-lg bg-da-accent px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Ukladám…" : isEdit ? "Uložiť zmeny" : "Vytvoriť úlohu"}
        </button>
      </form>
    </div>
  );
}
