"use client";

// v2.2 — zobrazenie jedného dňa (spoločné pre Dnes a Kalendár):
//   celodenné udalosti → časová os (udalosti + bloky úloh, čiara „teraz“)
//   → Úlohy na deň + rozmedzia (svetlejšie).
// Hotové úlohy vracia `doneTasks()` — rodič ich dá do DoneDock.

import type { ReactNode } from "react";
import { spanDayPosition, spanDays, zonedDate, DEFAULT_TIME_ZONE } from "@/lib/time";
import { planMode, plannedDays, rangeIncludes } from "@/lib/model/taskPlan";
import { timeRangeLabel, shortDate } from "@/lib/model/labels";
import type { EventRow } from "@/lib/supabase/events";
import type { TaskV2 } from "@/lib/supabase/tasksV2";
import EventCard from "@/components/ui/EventCard";

const TZ = DEFAULT_TIME_ZONE;

export const isTaskDone = (t: TaskV2) => t.status === "done" || !!t.completed_at;

export function eventDayLabel(e: EventRow, day: string): string | null {
  const span = e.all_day
    ? { allDay: true as const, startDate: e.start_date!, endDate: e.end_date! }
    : { allDay: false as const, startAt: e.start_at!, endAt: e.end_at! };
  const p = spanDayPosition(span, day, TZ);
  return p && p.total > 1 ? `deň ${p.index}/${p.total}` : null;
}

export function eventsOnDay(events: EventRow[], day: string): EventRow[] {
  return events.filter((e) =>
    e.all_day
      ? e.start_date! <= day && e.end_date! >= day
      : spanDays({ allDay: false, startAt: e.start_at!, endAt: e.end_at! }, TZ).includes(day)
  );
}

export function tasksOnDay(tasks: TaskV2[], day: string) {
  const blocks = tasks.filter((t) => planMode(t) === "block" && plannedDays(t, TZ).includes(day));
  const dayTasks = tasks.filter((t) => planMode(t) === "day" && t.plan_start_date === day);
  const rangeTasks = tasks.filter((t) => rangeIncludes(t, day));
  return { blocks, dayTasks, rangeTasks, done: [...blocks, ...dayTasks, ...rangeTasks].filter(isTaskDone) };
}

export default function DayView({
  day,
  events,
  tasks,
  now,
  renderTask,
  onOpenEvent,
  emptyText,
}: {
  day: string;
  events: EventRow[];
  tasks: TaskV2[];
  now: number;
  renderTask: (t: TaskV2, opts?: { faded?: boolean; extra?: string | null }) => ReactNode;
  onOpenEvent: (e: EventRow) => void;
  emptyText: string;
}) {
  const dayEvents = eventsOnDay(events, day);
  const { blocks, dayTasks, rangeTasks } = tasksOnDay(tasks, day);
  const allDay = dayEvents.filter((e) => e.all_day);
  const timeline = [
    ...dayEvents.filter((e) => !e.all_day).map((e) => ({ kind: "event" as const, start: Date.parse(e.start_at!), e })),
    ...blocks.filter((t) => !isTaskDone(t)).map((t) => ({ kind: "task" as const, start: Date.parse(t.plan_start_at!), t })),
  ].sort((a, b) => a.start - b.start);
  const isToday = day === zonedDate(new Date(now), TZ);
  const nowIndex = isToday ? timeline.findIndex((it) => it.start > now) : -2;
  const openDay = dayTasks.filter((t) => !isTaskDone(t));
  const openRange = rangeTasks.filter((t) => !isTaskDone(t));

  const nowLine = (
    <div className="flex items-center gap-2 py-1 text-[11px] font-semibold text-da-danger">
      <span className="h-px flex-grow bg-da-danger/60" />
      teraz {new Date(now).toLocaleTimeString("sk-SK", { hour: "2-digit", minute: "2-digit", timeZone: TZ })}
      <span className="h-px flex-grow bg-da-danger/60" />
    </div>
  );

  return (
    <>
      {allDay.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {allDay.map((e) => {
            const pos = eventDayLabel(e, day);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onOpenEvent(e)}
                className="rounded-full bg-da-chip-bg px-3 py-1 text-[13px] text-da-chip-text"
              >
                {e.title}
                {pos ? ` · ${pos}` : ""}
              </button>
            );
          })}
        </div>
      )}

      {timeline.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {timeline.map((it, idx) => (
            <div key={it.kind === "event" ? `e-${it.e.id}` : `t-${it.t.id}`} className="flex flex-col gap-2">
              {idx === nowIndex && nowLine}
              {it.kind === "event" ? (
                <EventCard
                  title={it.e.title}
                  timeLabel={timeRangeLabel(it.e.start_at!, it.e.end_at!, day)}
                  location={it.e.location}
                  dayLabel={eventDayLabel(it.e, day)}
                  onOpen={() => onOpenEvent(it.e)}
                />
              ) : (
                renderTask(it.t)
              )}
            </div>
          ))}
          {isToday && nowIndex === -1 && nowLine}
        </div>
      )}

      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-da-meta">Úlohy</div>
      {openDay.length === 0 && openRange.length === 0 && <p className="mb-3 text-sm text-da-muted">{emptyText}</p>}
      <div className="flex flex-col gap-2.5 pb-3">
        {openDay.map((t) => renderTask(t))}
        {openRange.map((t) =>
          renderTask(t, { faded: true, extra: `rozmedzie ${shortDate(t.plan_start_date!)} – ${shortDate(t.plan_end_date!)}` })
        )}
      </div>
    </>
  );
}
