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
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-da-card border border-da-border bg-da-chip-bg/60 px-4 py-3 text-left"
    >
      <span className="mt-0.5 w-[78px] shrink-0 text-[13px] font-semibold tabular-nums text-da-meta">
        {timeLabel || "celý deň"}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[15px] font-medium text-da-text">{title}</span>
        {(location || dayLabel) && (
          <span className="truncate text-xs text-da-meta">{[dayLabel, location].filter(Boolean).join(" · ")}</span>
        )}
      </span>
    </button>
  );
}
