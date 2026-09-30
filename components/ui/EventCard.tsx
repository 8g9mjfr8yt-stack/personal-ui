"use client";

// v2.2 — udalosť z Google Kalendára na Dnes/Kalendári: karta BEZ krúžku
// (udalosť sa nedá odškrtnúť, nie je nikdy „po termíne“).
export default function EventCard({
  title,
  timeLabel,
  location,
  dayLabel,
  onOpen,
}: {
  title: string;
  timeLabel: string | null;
  location?: string | null;
  dayLabel?: string | null; // napr. „deň 2/3“
  onOpen: () => void;
}) {
  // kompaktný jeden riadok: čas · názov · (deň x/y, miesto)
  const meta = [dayLabel, location].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-baseline gap-2.5 rounded-xl bg-da-chip-bg/60 px-3 py-1.5 text-left"
    >
      <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-da-meta">{timeLabel || "celý deň"}</span>
      <span className="min-w-0 truncate text-sm font-medium text-da-text">{title}</span>
      {meta && <span className="ml-auto min-w-0 shrink truncate text-xs text-da-meta">{meta}</span>}
    </button>
  );
}
