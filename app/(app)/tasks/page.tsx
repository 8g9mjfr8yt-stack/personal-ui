"use client";

// v2.2 — Úlohy (Viac → Úlohy): všetky nedokončené úlohy v novom modeli
// plánu a termínu, rozdelené do sekcií
//   Nestihnuté · Po termíne · Dnes · Naplánované · Rozmedzie · Kedykoľvek.
// Zrkadlá Google udalostí (legacy_mirror) sa nezobrazujú. Karta úlohy,
// editor a akcie sú zdieľané s Dnes/Kalendárom (components/useTaskUi.tsx).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";
import { planMode, plannedDays, poolSection } from "@/lib/model/taskPlan";
import { getOpenTasks, type TaskV2 } from "@/lib/supabase/tasksV2";
import { getSubtasksFor } from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";
import { usePersistedFlags, useScrollRestore } from "@/lib/usePersistedState";
import { useTaskUi, type UiProject } from "@/components/useTaskUi";

const TZ = DEFAULT_TIME_ZONE;

type SectionKey = "missed" | "overdue" | "today" | "planned" | "range" | "anytime";
const SECTIONS: { key: SectionKey; label: string; danger?: boolean }[] = [
  { key: "missed", label: "Nestihnuté" },
  { key: "overdue", label: "Po termíne", danger: true },
  { key: "today", label: "Dnes" },
  { key: "planned", label: "Naplánované" },
  { key: "range", label: "Rozmedzie" },
  { key: "anytime", label: "Kedykoľvek" },
];

function sectionOf(t: TaskV2, today: string, now: Date): SectionKey {
  const pool = poolSection(t, now, TZ);
  if (pool) return pool; // missed / overdue / range / anytime
  return plannedDays(t, TZ).includes(today) ? "today" : "planned";
}

// dátum na zoradenie v rámci sekcie
function sortKey(t: TaskV2): string {
  const mode = planMode(t);
  if (mode === "block") return t.plan_start_at!;
  if (mode === "day" || mode === "range") return t.plan_start_date!;
  return t.due_date || "9999";
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskV2[] | null>(null);
  const [projects, setProjects] = useState<UiProject[]>([]);
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, TaskV2[]>>({});
  const [expanded, setExpanded] = usePersistedFlags("da_tasks_expanded");
  const [error, setError] = useState<string | null>(null);
  useScrollRestore("da_scroll_tasks", tasks !== null);

  const load = useCallback(async () => {
    const supabase = createClient();
    try {
      const [ts, pr] = await Promise.all([getOpenTasks(supabase), getProjects(supabase) as Promise<UiProject[]>]);
      setTasks(ts);
      setProjects(pr);
      const subs = (await getSubtasksFor(supabase, ts.map((t) => t.id))) as TaskV2[];
      const grouped: Record<string, TaskV2[]> = {};
      for (const s of subs) (grouped[s.parent_task_id as string] ||= []).push(s);
      setSubtasksByParent(grouped);
      setError(null);
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa načítať úlohy.");
    }
  }, []);

  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current);
    reloadTimer.current = setTimeout(() => load(), 300);
  }, [load]);

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-tasks-v22")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, reload]);

  const today = zonedDate(new Date(), TZ);
  const ui = useTaskUi({
    day: today,
    projects,
    subtasksByParent,
    setTasks,
    setSubtasksByParent,
    expanded,
    setExpanded,
    reload,
    setError,
  });

  const sections = useMemo(() => {
    const out: Record<SectionKey, TaskV2[]> = { missed: [], overdue: [], today: [], planned: [], range: [], anytime: [] };
    if (!tasks) return out;
    const now = new Date();
    for (const t of tasks) out[sectionOf(t, today, now)].push(t);
    for (const k of Object.keys(out) as SectionKey[]) {
      out[k].sort((a, b) =>
        k === "overdue"
          ? (a.due_date || "").localeCompare(b.due_date || "")
          : k === "anytime"
          ? (a.due_date || "9999").localeCompare(b.due_date || "9999") || b.created_at.localeCompare(a.created_at)
          : sortKey(a).localeCompare(sortKey(b))
      );
    }
    return out;
  }, [tasks, today]);

  const count = tasks?.length ?? 0;

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
          onClick={() => ui.openCreate({})}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-da-chip-bg text-da-chip-text"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
      {!error && tasks !== null && (
        <p className="mb-4 text-sm text-da-meta">
          {count} {count === 1 ? "úloha" : count >= 2 && count <= 4 ? "úlohy" : "úloh"}
        </p>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {!error && tasks === null && <p className="text-da-muted">Načítavam…</p>}
      {!error && tasks !== null && count === 0 && <p className="text-da-muted">Žiadne nedokončené úlohy.</p>}

      {tasks !== null &&
        SECTIONS.filter((s) => sections[s.key].length > 0).map((s) => (
          <div key={s.key} className="pb-5">
            <div className={`mb-2 text-[11px] font-bold uppercase tracking-[0.08em] ${s.danger ? "text-da-danger" : "text-da-meta"}`}>
              {s.label} ({sections[s.key].length})
            </div>
            <div className="flex flex-col gap-2.5">{sections[s.key].map((t) => ui.renderTask(t, { showPlan: true }))}</div>
          </div>
        ))}

      {ui.overlays}
    </div>
  );
}
