"use client";

import { accentOrDefault, softBg, softText } from "@/lib/colorUtils";

export type SubtaskVM = {
  id: string;
  title: string;
  done: boolean;
};

// Riadok úlohy zdieľaný medzi Dnes, Kalendár, Projekty a Úlohy (Denný
// agent 2.0).
//
// Oprava po reálnom testovaní (2026-09-23): predtým sa dalo
// rozbaliť/pridať podúlohu IBA úlohe, ktorá už nejakú podúlohu mala —
// úloha bez podúloh nemala žiadnu cestu, ako prvú podúlohu pridať.
// Teraz je šípka na rozbalenie VŽDY prítomná (nezávisle od počtu
// podúloh) a panel podúloh vždy obsahuje "+ Pridať podúlohu". Zmazanie
// bolo predtým dostupné iba pre úlohy bez podúloh a upraviť sa nedalo
// vôbec — teraz sú upraviť/zmazať vždy prítomné (keď volajúca stránka
// pošle príslušný handler), plus voliteľné "odobrať" (Kalendár:
// odstránenie z dňa, oddelené od dokončenia úlohy).
//
// `projectColor`: voliteľná farba akcentu projektu (accent_color) —
// keď je vyplnená, nahradí predvolenú šalviovú na krúžku/pilulke.
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
  projectColor,
  subtasks,
  expanded,
  busy,
  bare,
  onToggleDone,
  onToggleExpand,
  onToggleSubtask,
  onAddSubtask,
  onEdit,
  onDelete,
  onUnassign,
}: {
  title: string;
  meta?: string | null;
  done: boolean;
  projectLabel?: string | null;
  projectColor?: string | null;
  subtasks: SubtaskVM[];
  expanded: boolean;
  busy?: boolean;
  bare?: boolean;
  onToggleDone: () => void;
  onToggleExpand?: () => void;
  onToggleSubtask?: (subId: string) => void;
  onAddSubtask?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUnassign?: () => void;
}) {
  const hasSubtasks = subtasks.length > 0;
  const doneCount = subtasks.filter((s) => s.done).length;
  const accent = accentOrDefault(projectColor);

  const wrapperClass = bare
    ? "rounded-xl border border-da-border/70"
    : "rounded-da-card border border-da-border bg-da-card shadow-da-card";

  const metaParts = [meta, hasSubtasks ? `${doneCount}/${subtasks.length} podúlohy` : null].filter(
    Boolean
  );

  return (
    <div className={wrapperClass}>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <button
          type="button"
          aria-label={done ? "Vrátiť medzi nedokončené" : "Označiť ako hotové"}
          disabled={busy}
          onClick={onToggleDone}
          className="h-6 w-6 shrink-0 rounded-full border-2 disabled:opacity-50"
          style={{
            background: done ? accent : "transparent",
            borderColor: done ? accent : "#C9C2B4",
          }}
        />

        <button type="button" onClick={onToggleExpand} className="min-w-0 flex-grow text-left">
          <div
            className="text-[15px] font-semibold"
            style={{
              color: done ? "#9A9384" : "#211E1B",
              textDecoration: done ? "line-through" : "none",
            }}
          >
            {title}
          </div>
          {metaParts.length > 0 && (
            <div className="mt-0.5 text-xs text-da-meta">{metaParts.join(" · ")}</div>
          )}
          {projectLabel && (
            <span
              className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px]"
              style={{ background: softBg(projectColor), color: softText(projectColor) }}
            >
              {projectLabel}
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-0.5">
          {onEdit && (
            <button
              type="button"
              aria-label={`Upraviť: ${title}`}
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center text-da-muted"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {onUnassign && (
            <button
              type="button"
              aria-label={`Odobrať z dňa: ${title}`}
              onClick={onUnassign}
              className="flex h-7 w-7 items-center justify-center text-da-muted"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="3" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="9" y1="14" x2="15" y2="18" />
                <line x1="15" y1="14" x2="9" y2="18" />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              aria-label={`Zmazať: ${title}`}
              disabled={busy}
              onClick={onDelete}
              className="flex h-7 w-7 items-center justify-center text-da-muted disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
          <button
            type="button"
            aria-label={expanded ? "Zbaliť podúlohy" : "Rozbaliť podúlohy"}
            onClick={onToggleExpand}
            className="flex h-7 w-7 items-center justify-center text-da-muted"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-2 border-t border-da-border/70 px-4 py-3 pl-[46px]">
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2.5">
              <button
                type="button"
                aria-label={s.done ? "Vrátiť podúlohu" : "Označiť podúlohu ako hotovú"}
                onClick={() => onToggleSubtask?.(s.id)}
                className="h-[18px] w-[18px] shrink-0 rounded-full border-2"
                style={{
                  background: s.done ? accent : "transparent",
                  borderColor: s.done ? accent : "#C9C2B4",
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
          {subtasks.length === 0 && <p className="text-xs text-da-muted">Zatiaľ žiadne podúlohy.</p>}
          {onAddSubtask && (
            <button
              type="button"
              onClick={onAddSubtask}
              className="mt-1 self-start text-sm font-medium"
              style={{ color: accent }}
            >
              + Pridať podúlohu
            </button>
          )}
        </div>
      )}
    </div>
  );
}
