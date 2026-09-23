"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getTasksInRange,
  getUnassignedTasks,
  getSubtasksFor,
  updateTask,
  completeTask,
  uncompleteTask,
  createTask,
  deleteTask,
} from "@/lib/supabase/tasks";
import { getProjects } from "@/lib/supabase/projects";
import { toISODate, startOfWeek, fromISODate, todayISO } from "@/lib/dateUtils";
import { sortTasksForDisplay } from "@/lib/taskSort";
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
  scheduled_time: string | null;
  parent_task_id: string | null;
  context: string | null;
  estimated_minutes: number | null;
};

type Project = { id: string; name: string; accent_color: string | null };

const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const POOL_OPEN_KEY = "da_calendar_pool_open";
const SELECTED_DAY_KEY = "da_calendar_selected_day";

function taskMeta(t: Task) {
  const time = t.scheduled_time
    ? new Date(t.scheduled_time).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" })
    : null;
  const parts = [time, t.priority ? `${t.priority} priorita` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "bez času";
}

// Denný agent 2.0 — "Kalendár": týždenný pás dní + agenda vybraného dňa
// + spodný "pool" voľných úloh (bez due_date).
//
// Opravy po reálnom testovaní (2026-09-23):
// - toISODate teraz číta lokálne komponenty dátumu (lib/dateUtils),
//   nie toISOString() — pôvodná verzia pri kladnom časovom pásme
//   posúvala všetky dni v páse o jeden deň dozadu, takže sa napr.
//   pod dnešným dátumom v skutočnosti zvýrazňoval zajtrajší deň.
// - vybraný deň sa teraz ukladá do localStorage (rovnaký vzor ako
//   poolOpen), takže prežije prepnutie na inú stránku a späť.
// - klik na úlohu v agende dňa už úlohu automaticky NEODSTRÁNI z dňa —
//   krúžok dokončí/vráti úlohu (ako na Dnes), rozbalenie ukáže/pridá
//   podúlohy, ceruzka upraví, a samostatná ikona (kalendár s krížikom)
//   slúži na explicitné odobratie z dňa.
export default function CalendarPage() {
  // weekAnchorISO určuje, ktorý týždeň je zobrazený — predtým bol
  // natvrdo "tento týždeň" (zmrazené pri mount), takže sa nedalo
  // prepnúť na iný. Teraz sa dá posúvať dopredu/dozadu aj skočiť na
  // ľubovoľný dátum (pozri goToWeekOffset/jumpToDate nižšie).
  const [weekAnchorISO, setWeekAnchorISO] = useState(() => todayISO());
  const weekDays = useMemo(() => {
    const monday = startOfWeek(fromISODate(weekAnchorISO));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, [weekAnchorISO]);
  const weekLabel = `${weekDays[0].getDate()}. – ${weekDays[6].getDate()}. ${weekDays[6].toLocaleDateString(
    "sk-SK",
    { month: "short" }
  )}`;
  const weekIsoSet = useMemo(() => new Set(weekDays.map((d) => toISODate(d))), [weekDays]);

  const [selectedDay, setSelectedDayState] = useState(() => toISODate(new Date()));
  const [tasksByDay, setTasksByDay] = useState<Record<string, Task[]>>({});
  const [subtasksByParent, setSubtasksByParent] = useState<Record<string, Task[]>>({});
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [pool, setPool] = useState<Task[] | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalInitial, setModalInitial] = useState<TaskEditModalInitial | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(POOL_OPEN_KEY);
      if (stored !== null) setPoolOpen(stored === "1");
    } catch {
      /* localStorage nedostupné — ostane defaultne zbalené */
    }
    try {
      const storedDay = window.localStorage.getItem(SELECTED_DAY_KEY);
      // Obnovíme uložený deň iba ak patrí do aktuálne zobrazeného
      // týždňa — inak by sa v páse dní nezvýraznilo nič a agenda by
      // ukazovala prázdny deň, ktorého úlohy sa vôbec nenačítali.
      if (storedDay && weekIsoSet.has(storedDay)) {
        setSelectedDayState(storedDay);
      }
    } catch {
      /* localStorage nedostupné — ostane dnešný deň */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setSelectedDay(iso: string) {
    setSelectedDayState(iso);
    try {
      window.localStorage.setItem(SELECTED_DAY_KEY, iso);
    } catch {
      /* ignore */
    }
  }

  function goToWeekOffset(days: number) {
    // Posunie aj vybraný deň o rovnaký počet dní, nie iba zobrazený
    // týždeň — inak by po prepnutí týždňa zostal vybraný deň z
    // predchádzajúceho týždňa (mimo nového rozsahu), agenda by teda
    // ukazovala prázdno a v páse dní by nič nebolo zvýraznené.
    const nextAnchor = fromISODate(weekAnchorISO);
    nextAnchor.setDate(nextAnchor.getDate() + days);
    setWeekAnchorISO(toISODate(nextAnchor));

    const nextSelected = fromISODate(selectedDay);
    nextSelected.setDate(nextSelected.getDate() + days);
    setSelectedDay(toISODate(nextSelected));
  }

  function jumpToDate(iso: string) {
    if (!iso) return;
    setWeekAnchorISO(iso);
    setSelectedDay(iso);
  }

  function goToday() {
    const iso = todayISO();
    setWeekAnchorISO(iso);
    setSelectedDay(iso);
  }

  function togglePool() {
    setPoolOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(POOL_OPEN_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function load() {
    const supabase = createClient();
    try {
      const start = toISODate(weekDays[0]);
      const endExclusive = toISODate(
        new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate() + 1)
      );
      const [weekTasks, unassigned, projectData] = await Promise.all([
        getTasksInRange(supabase, start, endExclusive) as Promise<Task[]>,
        getUnassignedTasks(supabase) as Promise<Task[]>,
        getProjects(supabase) as Promise<Project[]>,
      ]);
      const grouped: Record<string, Task[]> = {};
      for (const t of weekTasks) {
        const key = t.due_date as string;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(t);
      }
      setTasksByDay(grouped);
      setPool(unassigned);
      setProjects(projectData);

      const subs = (await getSubtasksFor(supabase, weekTasks.map((t) => t.id))) as Task[];
      const subGrouped: Record<string, Task[]> = {};
      for (const s of subs) {
        const pid = s.parent_task_id as string;
        if (!subGrouped[pid]) subGrouped[pid] = [];
        subGrouped[pid].push(s);
      }
      setSubtasksByParent(subGrouped);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať kalendár.");
    }
  }

  useEffect(() => {
    load();
    const supabase = createClient();
    const channel = supabase
      .channel("realtime-calendar-tasks")
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekDays]);

  function projectFor(id: string | null) {
    if (!id) return null;
    return projects.find((p) => p.id === id) || null;
  }

  async function handleUnassign(taskId: string) {
    setBusyId(taskId);
    setError(null);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id: taskId, due_date: null, scheduled_time: null });
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa odstrániť úlohu z dňa.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAssign(taskId: string) {
    setBusyId(taskId);
    setError(null);
    try {
      const supabase = createClient();
      await updateTask(supabase, { id: taskId, due_date: selectedDay });
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa priradiť úlohu.");
    } finally {
      setBusyId(null);
    }
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
      setError((err as Error)?.message || "Nepodarilo sa aktualizovať úlohu.");
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
      setError((err as Error)?.message || "Nepodarilo sa aktualizovať podúlohu.");
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
      setExpandedTasks((prev) => ({ ...prev, [parentId]: true }));
      await load();
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa pridať podúlohu.");
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
      setError((err as Error)?.message || "Nepodarilo sa zmazať úlohu.");
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
      setError((err as Error)?.message || "Nepodarilo sa priradiť projekt.");
    } finally {
      setBusyId(null);
    }
  }

  function openCreate() {
    setModalError(null);
    setModalInitial({ due_date: selectedDay });
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

  const selectedTasks = sortTasksForDisplay(tasksByDay[selectedDay] || []);

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between px-5 pb-3 pt-6">
        <h1 className="text-[21px] font-bold">Kalendár</h1>
        <button
          type="button"
          aria-label="Nová úloha na vybraný deň"
          onClick={openCreate}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-da-accent text-white"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <button
          type="button"
          aria-label="Predchádzajúci týždeň"
          onClick={() => goToWeekOffset(-7)}
          className="flex h-7 w-7 shrink-0 items-center justify-center text-da-meta"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={goToday} className="text-xs font-medium text-da-meta">
            {weekLabel}
          </button>
          <input
            type="date"
            aria-label="Skočiť na dátum"
            value={selectedDay}
            onChange={(e) => jumpToDate(e.target.value)}
            className="rounded-lg border border-da-border bg-da-card px-1.5 py-0.5 text-xs text-da-meta"
          />
        </div>
        <button
          type="button"
          aria-label="Nasledujúci týždeň"
          onClick={() => goToWeekOffset(7)}
          className="flex h-7 w-7 shrink-0 items-center justify-center text-da-meta"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      <div className="flex justify-between gap-1 px-4 pb-4">
        {weekDays.map((d, i) => {
          const iso = toISODate(d);
          const isSelected = iso === selectedDay;
          const hasTasks = (tasksByDay[iso] || []).length > 0;
          return (
            <button
              key={iso}
              onClick={() => setSelectedDay(iso)}
              className="flex flex-1 flex-col items-center gap-1 rounded-2xl py-2.5"
              style={{ background: isSelected ? "#5B7F66" : "transparent" }}
            >
              <span className="text-[11px]" style={{ color: isSelected ? "#EAF1EA" : "#9A9384" }}>
                {DAY_LABELS[i]}
              </span>
              <span
                className="text-sm font-semibold"
                style={{ color: isSelected ? "#FFFFFF" : "#211E1B" }}
              >
                {d.getDate()}
              </span>
              {hasTasks && !isSelected && <span className="h-1 w-1 rounded-full bg-da-accent" />}
              {(!hasTasks || isSelected) && <span className="h-1 w-1" />}
            </button>
          );
        })}
      </div>

      {error && <p className="px-5 pb-3 text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2.5 px-5 pb-6">
        {selectedTasks.length === 0 && (
          <p className="py-6 text-center text-sm text-da-muted">Na tento deň nemáš priradené žiadne úlohy.</p>
        )}
        {selectedTasks.map((t) => {
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
              expanded={!!expandedTasks[t.id]}
              onToggleDone={() => handleToggleDone(t)}
              onToggleExpand={() => setExpandedTasks((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
              onToggleSubtask={(subId) => {
                const sub = subs.find((s) => s.id === subId);
                if (sub) handleToggleSubtask(sub);
              }}
              onAddSubtask={() => handleAddSubtask(t.id)}
              onEdit={() => openEdit(t)}
              onDelete={() => handleDelete(t)}
              onUnassign={() => handleUnassign(t.id)}
              projects={projects.map((pr) => ({ id: pr.id, name: pr.name }))}
              currentProjectId={t.project_id}
              onAssignProject={(pid) => handleAssignProject(t.id, pid)}
            />
          );
        })}
      </div>

      <div className="h-2" />

      {/* Spodný "pool" panel sa vykresľuje priamo nad BottomChrome cez
          rovnaký fixed kontext — jednoduchšie ako počítať výšku susednej
          fixed lišty, tak ho vykreslíme ako súčasť bežného toku a necháme
          mu dostatočný spodný padding v layout.tsx (pb-40 na <main>). */}
      <div className="fixed inset-x-0 bottom-[104px] z-40 mx-auto max-w-3xl px-0">
        {poolOpen && (
          <div className="max-h-[280px] overflow-y-auto rounded-t-2xl border border-b-0 border-da-border bg-white px-4 pt-3">
            {pool === null && <p className="py-3 text-sm text-da-muted">Načítavam…</p>}
            {pool !== null && pool.length === 0 && (
              <p className="py-3 text-sm text-da-muted">Žiadne voľné úlohy.</p>
            )}
            <div className="flex flex-col gap-2 pb-3">
              {pool?.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-da-border px-3.5 py-2.5"
                >
                  <span className="min-w-0 flex-grow">
                    <span className="block text-sm font-medium text-da-text">{t.title}</span>
                    {t.context && <span className="block text-xs text-da-meta">{t.context}</span>}
                  </span>
                  <button
                    type="button"
                    aria-label={`Upraviť: ${t.title}`}
                    onClick={() => openEdit(t)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center text-da-muted"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label={`Zmazať: ${t.title}`}
                    onClick={() => handleDelete(t)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center text-da-muted"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleAssign(t.id)}
                    disabled={busyId === t.id}
                    aria-label={`Priradiť na vybraný deň: ${t.title}`}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-da-accent text-white disabled:opacity-50"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={togglePool}
          className="flex w-full items-center justify-center gap-2 border-t border-da-border bg-white py-2.5 text-sm font-medium text-da-meta"
          style={{ borderRadius: poolOpen ? 0 : "16px 16px 0 0" }}
        >
          {poolOpen ? "Skryť voľné úlohy" : "Voľné úlohy na priradenie"}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: poolOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
          >
            <polyline points="18 15 12 9 6 15" />
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
