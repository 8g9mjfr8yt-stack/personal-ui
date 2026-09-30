"use client";

// v2.2 — editor úlohy nad novým modelom (NAVRH-PRESTAVBY.md, časť 6):
//   Kedy: Kedykoľvek · Deň · Rozmedzie · Deň + čas
//   Termín: vypnutý / dátum / dátum + čas (iba skutočný deadline)
// Časy sa zadávajú v miestnom čase a prevádzajú cez lib/time.ts.

import { useEffect, useState, type FormEvent } from "react";
import { localToUtc, zonedDate, zonedTime, DEFAULT_TIME_ZONE } from "@/lib/time";
import { planMode, validatePlan, type PlanMode } from "@/lib/model/taskPlan";
import type { TaskV2, TaskV2Input } from "@/lib/supabase/tasksV2";

export type TaskEditProject = { id: string; name: string };

const MODES: { key: PlanMode; label: string }[] = [
  { key: "anytime", label: "Kedykoľvek" },
  { key: "day", label: "Deň" },
  { key: "range", label: "Rozmedzie" },
  { key: "block", label: "Deň + čas" },
];

const inputCls = "rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text";

export default function TaskEditModalV2({
  initial,
  defaultDay,
  projects,
  onSave,
  onClose,
  onDelete,
  saving,
  error,
}: {
  initial: Partial<TaskV2> | null; // null = nová úloha
  defaultDay: string; // pre novú úlohu / prepnutie režimu
  projects: TaskEditProject[];
  onSave: (values: TaskV2Input & { title: string }) => void;
  onClose: () => void;
  onDelete?: () => void;
  saving?: boolean;
  error?: string | null;
}) {
  const tz = DEFAULT_TIME_ZONE;
  const i = initial || {};
  const isEdit = !!i.id;

  const [title, setTitle] = useState(i.title || "");
  const [description, setDescription] = useState(i.description || "");
  const [projectId, setProjectId] = useState(i.project_id || "");
  const [priority, setPriority] = useState(i.priority || "");
  const [mode, setMode] = useState<PlanMode>(initial ? planMode(i) : "day");
  const [day, setDay] = useState(
    i.plan_start_date || (i.plan_start_at ? zonedDate(i.plan_start_at, tz) : defaultDay)
  );
  const [rangeEnd, setRangeEnd] = useState(i.plan_end_date || day);
  const [startTime, setStartTime] = useState(i.plan_start_at ? zonedTime(i.plan_start_at, tz) : "09:00");
  const [endTime, setEndTime] = useState(i.plan_end_at ? zonedTime(i.plan_end_at, tz) : "10:00");
  const [hasDue, setHasDue] = useState(!!i.due_date);
  const [dueDate, setDueDate] = useState(i.due_date || defaultDay);
  const [dueTime, setDueTime] = useState(i.due_time ? i.due_time.slice(0, 5) : "");
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    i.estimated_minutes != null ? String(i.estimated_minutes) : ""
  );
  const [context, setContext] = useState(i.context || "");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function buildPlan(): Pick<TaskV2Input, "plan_start_date" | "plan_end_date" | "plan_start_at" | "plan_end_at"> {
    const empty = { plan_start_date: null, plan_end_date: null, plan_start_at: null, plan_end_at: null };
    if (mode === "day") return { ...empty, plan_start_date: day };
    if (mode === "range") return { ...empty, plan_start_date: day, plan_end_date: rangeEnd };
    if (mode === "block") {
      return {
        ...empty,
        plan_start_at: localToUtc(`${day}T${startTime}`, tz),
        plan_end_at: localToUtc(`${day}T${endTime}`, tz),
      };
    }
    return empty;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    const plan = buildPlan();
    const values: TaskV2Input & { title: string } = {
      title: title.trim(),
      description: description.trim() || null,
      project_id: projectId || null,
      priority: priority || null,
      ...plan,
      due_date: hasDue ? dueDate : null,
      due_time: hasDue && dueTime ? dueTime : null,
      estimated_minutes: estimatedMinutes.trim() ? Number(estimatedMinutes) : null,
      context: context.trim() || null,
    };
    const err =
      validatePlan(values) ||
      (values.estimated_minutes != null && values.estimated_minutes <= 0 ? "Odhad musí byť kladný." : null);
    setFormError(err);
    if (err) return;
    onSave(values);
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-black/30" onClick={onClose}>
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <form
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col gap-3 rounded-t-[28px] bg-da-bg p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-da-card"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-da-text">{isEdit ? "Upraviť úlohu" : "Nová úloha"}</h2>
            <button type="button" aria-label="Zavrieť" onClick={onClose} className="flex h-8 w-8 items-center justify-center text-da-muted">
              ✕
            </button>
          </div>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          <input
            type="text"
            placeholder="Názov úlohy"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`w-full px-3 ${inputCls}`}
            required
            autoFocus={!isEdit}
          />
          <textarea
            placeholder="Popis (nepovinné)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`w-full px-3 ${inputCls}`}
          />

          <div className="flex gap-2">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`w-1/2 ${inputCls}`}>
              <option value="">— bez projektu —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={`w-1/2 ${inputCls}`}>
              <option value="">bez priority</option>
              <option value="low">nízka</option>
              <option value="medium">stredná</option>
              <option value="high">vysoká</option>
            </select>
          </div>

          {/* KEDY */}
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-da-meta">Kedy</span>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-da-chip-bg p-1">
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`rounded-md px-1 py-1.5 text-[12px] font-medium ${
                    mode === m.key ? "bg-da-card text-da-text shadow-da-card" : "text-da-meta"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {mode === "day" && <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputCls} />}
            {mode === "range" && (
              <div className="flex gap-2">
                <label className="flex w-1/2 flex-col gap-1 text-xs text-da-meta">
                  Od
                  <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={inputCls} />
                </label>
                <label className="flex w-1/2 flex-col gap-1 text-xs text-da-meta">
                  Do
                  <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className={inputCls} />
                </label>
              </div>
            )}
            {mode === "block" && (
              <div className="flex gap-2">
                <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className={`w-[44%] ${inputCls}`} />
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`w-[28%] ${inputCls}`} />
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`w-[28%] ${inputCls}`} />
              </div>
            )}
            {mode === "block" && <p className="text-xs text-da-meta">Časový blok sa zobrazí aj v Google Kalendári (oranžovou).</p>}
          </div>

          {/* TERMÍN */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-da-text">
              <input type="checkbox" checked={hasDue} onChange={(e) => setHasDue(e.target.checked)} />
              Termín (deadline)
            </label>
            {hasDue && (
              <div className="flex gap-2">
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`w-2/3 ${inputCls}`} />
                <input
                  type="time"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                  className={`w-1/3 ${inputCls}`}
                  aria-label="Čas termínu (nepovinné)"
                />
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              placeholder="Odhad (min)"
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              className={`w-1/3 ${inputCls}`}
            />
            <input
              type="text"
              placeholder="Podmienka (napr. keď bude pekne)"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className={`w-2/3 ${inputCls}`}
            />
          </div>

          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="mt-1 rounded-lg bg-da-accent px-4 py-2.5 text-sm font-medium text-da-on-accent disabled:opacity-50"
          >
            {saving ? "Ukladám…" : isEdit ? "Uložiť zmeny" : "Vytvoriť úlohu"}
          </button>
          {isEdit && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="rounded-lg px-4 py-2.5 text-sm font-medium text-da-danger disabled:opacity-50"
            >
              Zmazať úlohu
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
