"use client";

import { useState } from "react";
import { accentOrDefault, softBg, softText } from "@/lib/colorUtils";

export type SubtaskVM = {
  id: string;
  title: string;
  done: boolean;
};

export type TaskRowProject = { id: string; name: string };

// Riadok úlohy zdieľaný medzi Dnes, Kalendár, Projekty a Úlohy (Denný
// agent 2.0).
//
// 2026-09-23 — po reálnom testovaní: rozbalenie/pridanie podúlohy je
// vždy dostupné (nezávisle od počtu podúloh), pribudlo upraviť/zmazať.
// 2026-09-24 — ďalšia úprava podľa spätnej väzby: tri samostatné bočné
// tlačidlá (ceruzka/kôš/šípka) nahradené JEDNÝM tlačidlom "⋮", ktoré
// otvorí menu so všetkými možnosťami (vrátane novej "Priradiť k
// projektu" priamo v menu, bez nutnosti otvárať celý formulár).
// Rozbaľovanie zostáva ako predtým — klikom na samotný riadok úlohy
// (teraz aj s malou šípkou-indikátorom rovno v ňom, nie ako vlastné
// tlačidlo).
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
  projects,
  currentProjectId,
  onAssignProject,
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
  projects?: TaskRowProject[];
  currentProjectId?: string | null;
  onAssignProject?: (projectId: string | null) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const hasSubtasks = subtasks.length > 0;
  const doneCount = subtasks.filter((s) => s.done).length;
  const accent = accentOrDefault(projectColor);

  const hasMenu = !!(onEdit || onDelete || onUnassign || (onAssignProject && projects));

  const wrapperClass = bare
    ? "rounded-xl border border-da-border/70"
    : "rounded-da-card border border-da-border bg-da-card shadow-da-card";

  const metaParts = [meta, hasSubtasks ? `${doneCount}/${subtasks.length} podúlohy` : null].filter(
    Boolean
  );

  return (
    <div className={`relative ${wrapperClass}`}>
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

        <button type="button" onClick={onToggleExpand} className="flex min-w-0 flex-grow items-start gap-1.5 text-left">
          <span className="min-w-0 flex-grow">
            <span
              className="block text-[15px] font-semibold"
              style={{
                color: done ? "#9A9384" : "#211E1B",
                textDecoration: done ? "line-through" : "none",
              }}
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
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#C9C2B4"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mt-1 shrink-0"
            style={{ transform: expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>

        {hasMenu && (
          <button
            type="button"
            aria-label="Ďalšie možnosti"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-7 w-7 shrink-0 items-center justify-center text-da-muted"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="12" cy="19" r="1.7" />
            </svg>
          </button>
        )}
      </div>

      {menuOpen && hasMenu && (
        <>
          <button
            type="button"
            aria-label="Zavrieť menu"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-3 top-[52px] z-50 flex w-56 flex-col gap-0.5 rounded-2xl border border-da-border bg-white p-1.5 shadow-lg">
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
                  className="rounded-lg border border-da-border px-2 py-1 text-sm text-da-text"
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
      )}

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
