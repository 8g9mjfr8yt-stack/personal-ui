// v2.2 — texty pre zobrazenie času a termínu (spoločné pre Dnes/Kalendár).
import { zonedDate, zonedTime, DEFAULT_TIME_ZONE } from "@/lib/time";
import { isOverdue, type TaskPlanRow } from "@/lib/model/taskPlan";

const TZ = DEFAULT_TIME_ZONE;

// Čas úseku z pohľadu jedného dňa: "10:00–11:00", "od 22:00", "do 01:00",
// "celý deň" (stredný deň viacdňového úseku).
export function timeRangeLabel(startAt: string, endAt: string, day: string): string {
  const sDay = zonedDate(startAt, TZ);
  const eDay = zonedDate(new Date(new Date(endAt).getTime() - 1), TZ);
  const s = zonedTime(startAt, TZ);
  const e = zonedTime(endAt, TZ);
  if (sDay === day && eDay === day) return `${s}–${e}`;
  if (sDay === day) return `od ${s}`;
  if (eDay === day) return `do ${e}`;
  return "celý deň";
}

const WEEKDAYS = ["ne", "po", "ut", "st", "št", "pi", "so"];

export function shortDate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${wd} ${d}. ${m}.`;
}

// Štítok termínu: { text, overdue }.
export function deadlineLabel(t: TaskPlanRow, now: Date = new Date()): { text: string; overdue: boolean } | null {
  if (!t.due_date) return null;
  const overdue = isOverdue(t, now, TZ);
  const time = t.due_time ? ` ${t.due_time.slice(0, 5)}` : "";
  if (overdue) return { text: `po termíne (${shortDate(t.due_date)}${time})`, overdue: true };
  const today = zonedDate(now, TZ);
  if (t.due_date === today) return { text: `dnes do${time || " konca dňa"}`, overdue: false };
  return { text: `do ${shortDate(t.due_date)}${time}`, overdue: false };
}
