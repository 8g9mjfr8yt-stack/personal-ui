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
import { taskDisplayDays } from "@/lib/taskCalendar";
import { sortTasksForDisplay, sortPoolTasks, priorityDisplay } from "@/lib/taskSort";
import { softBg, softText } from "@/lib/colorUtils";
import { usePersistedFlags, useScrollRestore } from "@/lib/usePersistedState";
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

const DAY_LABELS = ["Po", "Ut", "St", "Št", "Pi", "So", "Ne"];
const POOL_OPEN_KEY = "da_calendar_pool_open";
const SELECTED_DAY_KEY = "da_calendar_selected_day";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit" });
}

function formatShortDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d}.${m}.`;
}

function isAllDayGoogleEvent(t: Task) {
  return !!t.google_event_id && !t.scheduled_time;
}

// Kompaktný meta text pre Kalendár — čas (priorita a počet podúloh sa
// zobrazujú až po rozbalení, pozri TaskRow `compactMeta`). `day` je deň,
// pre ktorý sa riadok práve vykresľuje — pri viacdňovej Google Calendar
// udalosti (pozri taskDisplayDays v lib/taskCalendar.ts) sa totiž ten istý
// task vykresľuje naraz vo viacerých dňoch a text sa musí líšiť podľa
// toho, či ide o deň začiatku/konca/medziľahlý deň.
//
// 2026-09-24 — predtým sa zobrazoval iba začiatok (scheduled_time), teraz:
// - celodenná Google Calendar udalosť (bez scheduled_time) → vždy "celý
//   deň", na každom dni svojho rozsahu.
// - viacdňová ČASOVANÁ udalosť: deň začiatku "od HH:MM - celý deň", deň
//   konca "celý deň - do HH:MM", medziľahlé dni "celý deň".
// - bežná úloha s konkrétnym časom na jednom dni → "HH:MM" (alebo
//   "HH:MM–HH:MM", ak má aj scheduled_time_end).
// - bez akéhokoľvek konkrétneho časového údaju → null (TaskRow riadok s
//   časom vôbec nevykreslí).
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
//   podúlohy, menu "⋮" upraví, a "Odobrať z dňa" v tom istom menu
//   slúži na explicitné odobratie z dňa.
//
// 2026-09-25 — po reálnom testovaní: rozbalené úlohy a scroll pozícia
// sa teraz ukladajú, takže po prepnutí na inú záložku a späť zostane
// obrazovka presne taká, akú používateľ opustil.
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
  const [expandedTasks, setExpandedTasks] = usePersistedFlags("da_calendar_expanded_tasks");
  const [pool, setPool] = useState<Task[] | null>(null);
  const [poolOpen, setPoolOpen] = useState(false);
  // Rozbalenie voľnej úlohy v poole (šípka) a jej "⋮" menu s
  // upraviť/vymazať — dve nezávislé, na id kľúčované mapy, pozri
  // vykreslenie poolu nižšie.
  const [poolRowOpen, setPoolRowOpen] = useState<Record<string, boolean>>({});
  const [poolMenuOpen, setPoolMenuOpen] = useState<Record<string, boolean>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [modalInitial, setModalInitial] = useState<TaskEditModalInitial | null>(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  useScrollRestore("da_scroll_calendar", pool !== null);

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
      // Presné umiestnenie (na ktorý deň/dni sa úloha zobrazí) rieši
      // zdieľaná taskDisplayDays() (lib/taskCalendar.ts) — viacdňová
      // Google Calendar udalosť sa vykreslí do KAŽDÉHO dňa svojho
      // rozsahu (je to stále ten istý riadok v `tasks`, takže úprava z
      // ktoréhokoľvek dňa mení tú istú udalosť všade), zatiaľ čo bežná
      // úloha s Od/Termín "plánovacím oknom" (bez konkrétneho času, bez
      // priradenia) sa vôbec nezobrazí — tá patrí do poolu voľných úloh
      // (getUnassignedTasks, lib/supabase/tasks.ts).
      const grouped: Record<string, Task[]> = {};
      for (const t of weekTasks) {
        for (const day of taskDisplayDays(t)) {
          if (!grouped[day]) grouped[day] = [];
          grouped[day].push(t);
        }
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
      const t = (tasksByDay[selectedDay] || []).find((x) => x.id === taskId);
      if (t?.assigned_date) {
        // Priradené z poolu cez assigned_date (úloha s Od/Termín
        // "plánovacím oknom", pozri lib/taskCalendar.ts) — "Odobrať z
        // dňa" iba zruší toto priradenie; pôvodné start_date/due_date
        // ostávajú nedotknuté, takže sa úloha vráti do poolu so svojím
        // pôvodným rozpätím zachovaným.
        await updateTask(supabase, { id: taskId, assigned_date: null });
      } else {
        await updateTask(supabase, {
          id: taskId,
          due_date: null,
          scheduled_time: null,
          scheduled_time_end: null,
        });
      }
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
      const t = pool?.find((p) => p.id === taskId);
      // Úloha s Od/Termín "plánovacím oknom" (bez konkrétneho času, bez
      // Google prepojenia) sa priraďuje cez samostatný `assigned_date` —
      // pôvodné start_date/due_date ostávajú nedotknuté, takže "Odobrať
      // z dňa" ich vie neskôr obnoviť (pozri lib/taskCalendar.ts).
      const isWindowTask =
        !!t &&
        !t.google_event_id &&
        !t.scheduled_time &&
        !!t.start_date &&
        !!t.due_date &&
        t.start_date !== t.due_date;
      if (isWindowTask) {
        await updateTask(supabase, { id: taskId, assigned_date: selectedDay });
      } else {
        await updateTask(supabase, { id: taskId, due_date: selectedDay });
      }
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

  const selectedTasks = sortTasksForDisplay(tasksByDay[selectedDay] || []);

  return (
    <div className="flex flex-col">
      <div className="px-5 pb-3 pt-6">
        <h1 className="text-[21px] font-bold">Kalendár</h1>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 pb-2">
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

      <div className="flex items-center gap-1 px-2 pb-4">
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
        <div className="flex flex-1 justify-between gap-1">
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
              meta={taskMeta(t, selectedDay)}
              priority={t.priority}
              compactMeta
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

      <div className="flex justify-end px-5 pb-4">
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

      <div className="h-2" />

      {/* Spodný "pool" panel sa vykresľuje priamo nad BottomChrome cez
          rovnaký fixed kontext — jednoduchšie ako počítať výšku susednej
          fixed lišty, tak ho vykreslíme ako súčasť bežného toku a necháme
          mu dostatočný spodný padding v layout.tsx (pb-24 na <main>). */}
      <div className="fixed inset-x-0 bottom-[64px] z-40 mx-auto max-w-3xl px-0">
        {poolOpen && (
          <div className="max-h-[280px] overflow-y-auto rounded-t-2xl border border-b-0 border-da-border bg-white px-4 pt-3">
            {pool === null && <p className="py-3 text-sm text-da-muted">Načítavam…</p>}
            {pool !== null && pool.length === 0 && (
              <p className="py-3 text-sm text-da-muted">Žiadne voľné úlohy.</p>
            )}
            <div className="flex flex-col gap-2 pb-3">
              {(pool ? sortPoolTasks(pool) : []).map((t) => {
                const project = projectFor(t.project_id);
                const rowOpen = !!poolRowOpen[t.id];
                const menuOpen = !!poolMenuOpen[t.id];
                return (
                  <div
                    key={t.id}
                    className="flex flex-col gap-2 rounded-2xl border border-dashed border-da-border px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-grow truncate text-sm font-medium text-da-text">
                        {t.title}
                      </span>
                      {project && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[11px]"
                          style={{ background: softBg(project.accent_color), color: softText(project.accent_color) }}
                        >
                          {project.name}
                        </span>
                      )}
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
                      <button
                        type="button"
                        aria-label={rowOpen ? "Skryť možnosti" : "Ďalšie možnosti"}
                        onClick={() =>
                          setPoolRowOpen((prev) => {
                            const next = { ...prev, [t.id]: !prev[t.id] };
                            if (!next[t.id]) setPoolMenuOpen((m) => ({ ...m, [t.id]: false }));
                            return next;
                          })
                        }
                        className="flex h-7 w-7 shrink-0 items-center justify-center text-da-muted"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          style={{ transform: rowOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    </div>

                    {rowOpen && (
                      <div className="flex flex-col gap-2 border-t border-da-border/60 pt-2">
                        {(priorityDisplay(t.priority) || t.context || t.due_date) && (
                          <div className="flex flex-col gap-1">
                            {priorityDisplay(t.priority) && (
                              <span className="text-xs text-da-meta">{priorityDisplay(t.priority)}</span>
                            )}
                            {t.context && <span className="text-xs text-da-meta">{t.context}</span>}
                            {t.due_date && (
                              <span className="text-xs text-da-meta">
                                {t.start_date && t.start_date !== t.due_date
                                  ? `Od ${formatShortDate(t.start_date)} do ${formatShortDate(t.due_date)}`
                                  : `Termín ${formatShortDate(t.due_date)}`}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex items-center justify-end gap-2">
                        {menuOpen && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setPoolMenuOpen((prev) => ({ ...prev, [t.id]: false }));
                                openEdit(t);
                              }}
                              className="rounded-full px-2.5 py-1 text-xs font-medium text-da-text hover:bg-da-bg"
                            >
                              Upraviť
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPoolMenuOpen((prev) => ({ ...prev, [t.id]: false }));
                                handleDelete(t);
                              }}
                              className="rounded-full px-2.5 py-1 text-xs font-medium text-da-danger hover:bg-da-bg"
                            >
                              Vymazať
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          aria-label="Ďalšie možnosti"
                          onClick={() => setPoolMenuOpen((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
                          className="flex h-7 w-7 shrink-0 items-center justify-center text-da-muted"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="1.7" />
                            <circle cx="12" cy="12" r="1.7" />
                            <circle cx="12" cy="19" r="1.7" />
                          </svg>
                        </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
