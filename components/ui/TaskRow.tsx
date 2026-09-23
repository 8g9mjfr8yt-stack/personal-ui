"use client";

import ProgressRing from "./ProgressRing";

export type SubtaskVM = {
  id: string;
  title: string;
  done: boolean;
};

// Riadok úlohy zdieľaný medzi Dnes a Projekty (Denný agent 2.0):
// - bez podúloh: krúžok je priamo tlačidlo na dokončenie/vrátenie úlohy.
// - s podúlohami: celý riadok rozbaľuje/zbaľuje zoznam podúloh, krúžok
//   ukazuje podiel dokončených podúloh (bez čísla).
// Hotové úlohy NIKDY nemiznú zo zoznamu — len sa vizuálne odlíšia
// (stlmená farba, prečiarknutie).
//
// `bare`: na Dnes je každá úloha svoja vlastná biela karta (default).
// V Projekty je task-row už vnorený v bielej karte projektu, takže tam
// dostáva `bare` — bez vlastného pozadia/okraja/tieňa, len jemný horný
// rámik namiesto samostatnej karty.
export default function TaskRow({
  title,
  meta,
  done,
  projectLabel,
  subtasks,
  expanded,
  busy,
  bare,
  onToggleDone,
  onToggleExpand,
  onToggleSubtask,
  onAddSubtask,
  onDelete,
}: {
  title: string;
  meta?: string | null;
  done: boolean;
  projectLabel?: string | null;
  subtasks: SubtaskVM[];
  expanded: boolean;
  busy?: boolean;
  bare?: boolean;
  onToggleDone: () => void;
  onToggleExpand?: () => void;
  onToggleSubtask?: (subId: string) => void;
  onAddSubtask?: () => void;
  onDelete?: () => void;
}) {
  const hasSubtasks = subtasks.length > 0;
  const doneCount = subtasks.filter((s) => s.done).length;
  const ringPercent = hasSubtasks ? doneCount / subtasks.length : done ? 1 : 0;

  const wrapperClass = bare
    ? "rounded-xl border border-da-border/70"
    : "rounded-da-card border border-da-border bg-da-card shadow-da-card";

  return (
    <div className={wrapperClass}>
      <div
        role={hasSubtasks ? "button" : undefined}
        tabIndex={hasSubtasks ? 0 : undefined}
        onClick={hasSubtasks ? onToggleExpand : undefined}
        onKeyDown={
          hasSubtasks
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onToggleExpand?.();
                }
              }
            : undefined
        }
        className={`flex items-center gap-3.5 px-4 py-3.5 ${hasSubtasks ? "cursor-pointer" : ""}`}
      >
        {hasSubtasks ? (
          <span className="shrink-0">
            <ProgressRing percent={ringPercent} />
          </span>
        ) : (
          <button
            type="button"
            aria-label={done ? "Vrátiť medzi nedokončené" : "Označiť ako hotové"}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onToggleDone();
            }}
            className="h-6 w-6 shrink-0 rounded-full border-2 disabled:opacity-50"
            style={{
              background: done ? "#5B7F66" : "transparent",
              borderColor: done ? "#5B7F66" : "#C9C2B4",
            }}
          />
        )}

        <div className="min-w-0 flex-grow">
          <div
            className="text-[15px] font-semibold"
            style={{
              color: done ? "#9A9384" : "#211E1B",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {title}
          </div>
          {meta && <div className="mt-0.5 text-xs text-da-meta">{meta}</div>}
          {projectLabel && (
            <span className="mt-1.5 inline-block rounded-full bg-da-accent-soft px-2 py-0.5 text-[11px] text-da-accent-soft-text">
              {projectLabel}
            </span>
          )}
        </div>

        {hasSubtasks && (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9A9384"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}

        {!hasSubtasks && onDelete && (
          <button
            type="button"
            aria-label={`Zmazať: ${title}`}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="flex h-6 w-6 shrink-0 items-center justify-center text-da-muted disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {hasSubtasks && expanded && (
        <div className="flex flex-col gap-2 border-t border-da-border/70 px-4 py-3 pl-[52px]">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label={s.done ? "Vrátiť podúlohu" : "Označiť podúlohu ako hotovú"}
                onClick={() => onToggleSubtask?.(s.id)}
                className="h-[18px] w-[18px] shrink-0 rounded-full border-2"
                style={{
                  background: s.done ? "#5B7F66" : "transparent",
                  borderColor: s.done ? "#5B7F66" : "#C9C2B4",
                }}
              />
              <span
                className="text-sm"
                style={{ color: s.done ? "#9A9384" : "#211E1B", textDecoration: s.done ? "line-through" : "none" }}
              >
                {s.title}
              </span>
            </div>
          ))}
          {onAddSubtask && (
            <button type="button" onClick={onAddSubtask} className="mt-1 self-start text-sm font-medium text-da-accent">
              + Pridať podúlohu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
