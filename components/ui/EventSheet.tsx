"use client";

import { useEffect } from "react";

// v2.2 — detail udalosti: čas, miesto, popis, projekt, akcie.
export default function EventSheet({
  title,
  when,
  location,
  description,
  htmlLink,
  projects,
  projectId,
  onAssignProject,
  onCreateTask,
  onClose,
}: {
  title: string;
  when: string;
  location?: string | null;
  description?: string | null;
  htmlLink?: string | null;
  projects: { id: string; name: string }[];
  projectId: string | null;
  onAssignProject: (projectId: string | null) => void;
  onCreateTask: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/30" onClick={onClose}>
      <div className="flex min-h-full items-end justify-center sm:items-center sm:p-4">
        <div
          onClick={(e) => e.stopPropagation()}
          className="flex w-full max-w-md flex-col gap-3 rounded-t-[28px] bg-da-bg p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-da-card"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-da-text">{title}</h2>
            <button type="button" aria-label="Zavrieť" onClick={onClose} className="h-8 w-8 shrink-0 text-da-muted">
              ✕
            </button>
          </div>
          <p className="text-sm text-da-meta">{when}</p>
          {location && <p className="text-sm text-da-text">📍 {location}</p>}
          {description && <p className="whitespace-pre-wrap text-sm text-da-text">{description}</p>}

          <label className="flex flex-col gap-1 text-xs text-da-meta">
            Projekt
            <select
              value={projectId || ""}
              onChange={(e) => onAssignProject(e.target.value || null)}
              className="rounded-lg border border-da-border bg-da-card px-2 py-2 text-sm text-da-text"
            >
              <option value="">— bez projektu —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={onCreateTask}
            className="rounded-lg bg-da-accent px-4 py-2.5 text-sm font-medium text-da-on-accent"
          >
            Úloha z udalosti
          </button>
          {htmlLink && (
            <a
              href={htmlLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-4 py-2.5 text-center text-sm font-medium text-da-accent"
            >
              Otvoriť v Google Kalendári
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
