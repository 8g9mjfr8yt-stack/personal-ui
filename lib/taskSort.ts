// Zdieľané poradie úloh naprieč Dnes/Kalendár/Projekty/Úlohy (Denný
// agent 2.0): úlohy s presným naplánovaným časom idú prvé, zoradené
// podľa času; úlohy bez presného času idú za nimi, zoradené podľa
// priority (najvyššia hore). Neznáma/chýbajúca priorita ide nakoniec.
const PRIORITY_RANK: Record<string, number> = {
  vysoká: 3,
  high: 3,
  stredná: 2,
  medium: 2,
  nízka: 1,
  low: 1,
};

function priorityRank(p?: string | null): number {
  if (!p) return 0;
  return PRIORITY_RANK[p.trim().toLowerCase()] ?? 0;
}

export function compareTasksForDisplay(
  a: { scheduled_time?: string | null; priority?: string | null },
  b: { scheduled_time?: string | null; priority?: string | null }
): number {
  const at = a.scheduled_time;
  const bt = b.scheduled_time;
  if (at && bt) return at.localeCompare(bt);
  if (at && !bt) return -1;
  if (!at && bt) return 1;
  return priorityRank(b.priority) - priorityRank(a.priority);
}

export function sortTasksForDisplay<T extends { scheduled_time?: string | null; priority?: string | null }>(
  tasks: T[]
): T[] {
  return tasks.slice().sort(compareTasksForDisplay);
}
