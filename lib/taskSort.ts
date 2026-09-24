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

// Zobrazovaný slovenský štítok priority — DB/hlasový agent môžu uložiť
// buď anglickú ("high") alebo slovenskú ("vysoká") hodnotu, tu sa obe
// zjednotia na jeden slovenský tvar použitý v UI (napr. TaskRow).
const PRIORITY_LABEL: Record<string, string> = {
  vysoká: "vysoká",
  high: "vysoká",
  stredná: "stredná",
  medium: "stredná",
  nízka: "nízka",
  low: "nízka",
};

export function priorityRank(p?: string | null): number {
  if (!p) return 0;
  return PRIORITY_RANK[p.trim().toLowerCase()] ?? 0;
}

export function priorityDisplay(p?: string | null): string | null {
  if (!p) return null;
  const label = PRIORITY_LABEL[p.trim().toLowerCase()];
  return label ? `${label} priorita` : null;
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

// Poradie v poole "voľných úloh na priradenie" (Kalendár): najprv podľa
// priority (najvyššia hore), v rámci rovnakej priority podľa najbližšieho
// termínu (Termín/due_date) — úloha bez termínu sa v rámci svojej priority
// radí až za úlohy s termínom (počíta sa ako "najvzdialenejší" termín).
// Najmenej prioritné/bez priority úlohy s najvzdialenejším (alebo žiadnym)
// termínom tak skončia úplne na konci.
export function comparePoolTasks(
  a: { priority?: string | null; due_date?: string | null },
  b: { priority?: string | null; due_date?: string | null }
): number {
  const rankDiff = priorityRank(b.priority) - priorityRank(a.priority);
  if (rankDiff !== 0) return rankDiff;
  const ad = a.due_date;
  const bd = b.due_date;
  if (ad && bd) return ad.localeCompare(bd);
  if (ad && !bd) return -1;
  if (!ad && bd) return 1;
  return 0;
}

export function sortPoolTasks<T extends { priority?: string | null; due_date?: string | null }>(
  tasks: T[]
): T[] {
  return tasks.slice().sort(comparePoolTasks);
}
