"use client";

// v2.2 — udalosť z Google Kalendára na Dnes/Kalendári: karta BEZ krúžku
// (udalosť sa nedá odškrtnúť, nie je nikdy „po termíne“).
export default function EventCard({
  title,
  timeLabel,
  location,
  dayLabel,
  onOpen,
  timeWidth,
}: {
  title: string;
  timeLabel: string | null;
  location?: string | null;
  dayLabel?: string | null; // napr. „deň 2/3“
  onOpen: () => void;
  // Dnes/Kalendár: pevná šírka stĺpca času + medzera za krúžok úloh,
  // aby názov udalosti začínal zarovno s názvami úloh
  timeWidth?: number;
}) {
  // kompaktný jeden riadok: čas · názov · (deň x/y, miesto)
  const meta = [dayLabel, location].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-xl bg-da-chip-bg/60 px-3 py-1.5 text-left"
    >
      <span
        style={timeWidth ? { width: timeWidth } : undefined}
        className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-da-meta"
      >
        {timeLabel || "celý deň"}
      </span>
      {timeWidth ? <span aria-hidden="true" className="w-6 shrink-0" /> : null}
      <span className="min-w-0 truncate text-sm font-medium text-da-text">{title}</span>
      {meta && <span className="ml-auto min-w-0 shrink truncate text-xs text-da-meta">{meta}</span>}
    </button>
  );
}
