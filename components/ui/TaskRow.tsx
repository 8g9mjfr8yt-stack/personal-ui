"use client";

import { useState } from "react";
import type React from "react";
import { accentColor, softBg, softText } from "@/lib/colorUtils";
import ProgressRing from "@/components/ui/ProgressRing";
import { priorityDisplay } from "@/lib/taskSort";

export type SubtaskVM = {
  id: string;
  title: string;
  done: boolean;
};

export type TaskRowProject = { id: string; name: string };

// Riadok úlohy zdieľaný medzi Dnes, Kalendár, Projekty a Úlohy (Denný
// agent 2.0).
//
// `compactMeta` (Dnes/Kalendár, nastavuje volajúca stránka):
// - v zbalenom stave sa zobrazuje LEN názov a (ak je) pridelený
//   projekt — žiadny riadok s časom/prioritou/počtom podúloh a žiadne
//   "bez času"; "⋮" menu je skryté.
// - ak úloha má presný čas, zobrazí sa až POD riadkom s projektom
//   (aj v zbalenom stave).
// - "⋮" menu sa objaví až po rozbalení, umiestnené POD šípkou na
//   rozbalenie (nie vedľa názvu).
// - 2026-09-24: priorita a počet podúloh sa v kompaktnom režime
//   NEZOBRAZUJÚ vôbec (ani po rozbalení) — priorita sa naďalej
//   zobrazuje len mimo compactMeta (Projekty), pozri nižšie.
// Mimo compactMeta (Projekty/Úlohy) je správanie nezmenené: meta text,
// priorita (ak je predaná) aj počet podúloh v jednom riadku pred
// projektom, "⋮" vždy vedľa názvu, šípka vždy na pravom okraji.
//
// `projectColor`: voliteľná farba akcentu projektu (accent_color) —
// keď je vyplnená, nahradí predvolenú šalviovú na krúžku/pilulke.
//
// `bare`: na Dnes je každá úloha svoja vlastná biela karta (default).
// V Projekty je task-row už vnorený v bielej karte projektu, takže tam
// dostáva `bare` — bez vlastného pozadia/okraja/tieňa, len jemný horný
// rámik namiesto samostatnej karty.
//
// Denný agent 2.1:
// - krúžok úlohy je ProgressRing — prázdny, s podúlohami ukazuje podiel
//   hotových podúloh (bez čísla), hotová úloha = plný krúžok s fajkou;
//   podúlohy majú menší krúžok v rovnakom štýle.
// - `faded`: menej výrazná karta pre sekciu "Hotové" (Dnes/Kalendár,
//   components/ui/DoneDock.tsx).
export default function TaskRow({
  title,
  meta,
  priority,
  compactMeta,
  done,
  projectLabel,
  projectColor,
  subtasks,
  expanded,
  busy,
  bare,
  faded,
  onToggleDone,
  onToggleExpand,
  onToggleSubtask,
  onDeleteSubtask,
  onAddSubtask,
  onEdit,
  onDelete,
  onUnassign,
  projects,
  currentProjectId,
  onAssignProject,
  trailingAction,
  expandedDetail,
  projectBelow,
  expandedActions,
  leading,
  leadingWidth = 0,
}: {
  title: string;
  meta?: string | null;
  priority?: string | null;
  compactMeta?: boolean;
  done: boolean;
  projectLabel?: string | null;
  projectColor?: string | null;
  subtasks: SubtaskVM[];
  expanded: boolean;
  busy?: boolean;
  bare?: boolean;
  faded?: boolean;
  onToggleDone: () => void;
  onToggleExpand?: () => void;
  onToggleSubtask?: (subId: string) => void;
  onDeleteSubtask?: (subId: string) => void;
  onAddSubtask?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onUnassign?: () => void;
  projects?: TaskRowProject[];
  currentProjectId?: string | null;
  onAssignProject?: (projectId: string | null) => void;
  // nahradí šípku na rozbalenie (rozbaľuje sa potom klikom na názov)
  trailingAction?: React.ReactNode;
  // text zobrazený iba po rozbalení (napr. termín)
  expandedDetail?: string | null;
  // pilulka projektu až po rozbalení, pod deliacou čiarou (pool)
  projectBelow?: boolean;
  // ďalšie akcie po rozbalení (Dnes: Odložiť na zajtra / iný deň)
  expandedActions?: React.ReactNode;
  // Dnes/Kalendár: čas pred krúžkom, v rovnakom stĺpci ako čas udalostí
  leading?: React.ReactNode;
  leadingWidth?: number;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSubtasks = subtasks.length > 0;
  const doneCount = subtasks.filter((s) => s.done).length;
  const accent = accentColor(projectColor);
  const ringPercent = done ? 1 : hasSubtasks ? doneCount / subtasks.length : 0;

  const hasMenu = !!(onEdit || onDelete || onUnassign || (onAssignProject && projects));
  const showMenuButton = compactMeta ? expanded && hasMenu : hasMenu;

  const wrapperClass = faded
    ? "rounded-da-card border border-da-border bg-transparent opacity-60"
    : bare
    ? "rounded-xl border border-da-border/70"
    : "rounded-da-card border border-da-border bg-da-card shadow-da-card";

  const priorityLabel = priorityDisplay(priority);
  const subtaskCountLabel = hasSubtasks ? `${doneCount}/${subtasks.length} podúlohy` : null;

  // Priorita a počet podúloh sa (2026-09-24) zobrazujú už len v
  // nekompaktnom režime (Projekty) — v kompaktnom (Dnes/Kalendár) je táto
  // informácia zámerne preč, nech rozbalená úloha nezaberá zbytočný riadok.
  const metaParts = [priorityLabel, meta, subtaskCountLabel].filter(Boolean);

  const menuButton = (extraClass: string) =>
    showMenuButton && (
      <button
        type="button"
        aria-label="Ďalšie možnosti"
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className={`flex h-6 w-6 shrink-0 items-center justify-center text-da-muted ${extraClass}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="5" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>
    );

  const menuPopup = (pos: string) =>
    menuOpen &&
    hasMenu && (
        <>
          <button
            type="button"
            aria-label="Zavrieť menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className={`absolute ${pos} z-50 flex w-56 flex-col gap-0.5 rounded-2xl border border-da-border bg-da-card p-1.5 shadow-lg`}>
            {onAssignProject && projects && (
              <label className="flex flex-col gap-1 rounded-xl px-2.5 py-1.5 text-xs text-da-meta">
                Priradiť k projektu
                <select
                  value={currentProjectId || ""}
                  onChange={(e) => {
                    onAssignProject(e.target.value || null);
                    setMenuOpen(false);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg border border-da-border bg-da-card px-2 py-1 text-sm text-da-text"
                >
                  <option value="">— bez projektu —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onEdit();
                }}
                className="rounded-xl px-2.5 py-2 text-left text-sm font-medium text-da-text hover:bg-da-bg"
              >
                Upraviť
              </button>
            )}
            {onUnassign && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onUnassign();
                }}
                className="rounded-xl px-2.5 py-2 text-left text-sm font-medium text-da-text hover:bg-da-bg"
              >
                Odobrať z dňa
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDelete();
                }}
                className="rounded-xl px-2.5 py-2 text-left text-sm font-medium text-da-danger hover:bg-da-bg"
              >
                Zmazať
              </button>
            )}
          </div>
        </>
      );

  return (
    <div className={`relative ${wrapperClass}`}>
      <div className={`flex items-center ${compactMeta ? `gap-4 px-3 ${faded ? "py-1.5" : "py-2"}` : `gap-2 px-4 ${faded ? "py-2.5" : "py-3.5"}`}`}>
        {leading && (
          <span
            style={{ width: leadingWidth }}
            className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-da-meta"
          >
            {leading}
          </span>
        )}
        <button
          type="button"
          aria-label={done ? "Vrátiť medzi nedokončené" : "Označiť ako hotové"}
          disabled={busy}
          onClick={onToggleDone}
          className="flex h-6 w-6 shrink-0 items-center justify-center disabled:opacity-50"
        >
          <ProgressRing percent={ringPercent} size={compactMeta ? 20 : 24} strokeWidth={compactMeta ? 2.5 : 3} color={accent} check={done} />
        </button>

        {compactMeta ? (
          // kompaktný riadok: názov a projekt vedľa seba, meta (čas) pod nimi
          <button type="button" onClick={onToggleExpand} className="min-w-0 flex-grow text-left">
            <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={`min-w-0 text-sm font-semibold ${done ? "text-da-muted line-through" : "text-da-text"}`}>
                {title}
              </span>
              {projectLabel && !projectBelow && (
                <span
                  className="shrink-0 rounded-full px-1.5 py-px text-[10px]"
                  style={{ background: softBg(projectColor), color: softText(projectColor) }}
                >
                  {projectLabel}
                </span>
              )}
            </span>
            {meta && <span className="mt-0.5 block text-xs text-da-meta">{meta}</span>}
          </button>
        ) : (
          <div className="flex min-w-0 flex-grow items-start gap-1">
            <button type="button" onClick={onToggleExpand} className="min-w-0 flex-grow text-left">
              <span
                className={`block text-[15px] font-semibold ${done ? "text-da-muted line-through" : "text-da-text"}`}
              >
                {title}
              </span>
              {metaParts.length > 0 && (
                <span className="mt-0.5 block text-xs text-da-meta">{metaParts.join(" · ")}</span>
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
            {menuButton("mt-0.5")}
          </div>
        )}

        <div className="flex shrink-0 flex-col items-center gap-1.5">
          {trailingAction ?? (
          <button
            type="button"
            aria-label={expanded ? "Zbaliť" : "Rozbaliť"}
            onClick={onToggleExpand}
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
              style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
          )}
        </div>
      </div>

      {!compactMeta && menuPopup("right-3 top-[52px]")}

      {expanded && (
        <div
          className={`relative flex flex-col border-t border-da-border/70 ${compactMeta ? "gap-1 px-3 py-1.5" : "gap-2 px-4 py-3 pl-[46px]"}`}
          style={compactMeta ? { paddingLeft: 12 + (leading ? leadingWidth + 16 : 0) + 24 + 16 } : undefined}
        >
          {/* kompaktný režim: „⋮“ až pod deliacou čiarou, zarovnané so stĺpcom
              šípky/„−“ — horná časť karty sa po rozbalení nemení */}
          {compactMeta && (
            <div className="absolute right-[14px] top-1">{menuButton("")}</div>
          )}
          {compactMeta && menuPopup("right-3 top-8")}
          {/* pool: projekt a detail (termín) v jednom riadku */}
          {(expandedDetail || (projectLabel && projectBelow)) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pr-8">
              {projectLabel && projectBelow && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{ background: softBg(projectColor), color: softText(projectColor) }}
                >
                  {projectLabel}
                </span>
              )}
              {expandedDetail && <span className="text-xs text-da-meta">{expandedDetail}</span>}
            </div>
          )}
          {expandedActions}
          {subtasks.map((s) => (
            <div key={s.id} className="flex items-center gap-2">
              <button
                type="button"
                aria-label={s.done ? "Vrátiť podúlohu" : "Označiť podúlohu ako hotovú"}
                onClick={() => onToggleSubtask?.(s.id)}
                className="flex h-4 w-4 shrink-0 items-center justify-center"
              >
                <ProgressRing percent={s.done ? 1 : 0} size={16} strokeWidth={2.2} color={accent} check={s.done} />
              </button>
              <span className={`min-w-0 flex-grow text-[13px] ${s.done ? "text-da-muted line-through" : "text-da-text"}`}>
                {s.title}
              </span>
              {onDeleteSubtask && (
                <button
                  type="button"
                  aria-label={`Zmazať podúlohu: ${s.title}`}
                  onClick={() => onDeleteSubtask(s.id)}
                  className="flex h-5 w-5 shrink-0 items-center justify-center text-da-muted"
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {onAddSubtask && (
            <button
              type="button"
              aria-label="Pridať podúlohu"
              onClick={onAddSubtask}
              className="-ml-[2px] flex h-5 w-5 shrink-0 items-center justify-center"
              style={{ color: accent }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
