"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProjects, createProject, deleteProject } from "@/lib/supabase/projects";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string | null;
  deadline: string | null;
  created_at: string;
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");
  const [deadline, setDeadline] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const supabase = createClient();
    try {
      const data = await getProjects(supabase);
      setProjects(data as Project[]);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať projekty.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      await createProject(supabase, {
        name: name.trim(),
        description: description.trim() || null,
        priority: priority.trim() || null,
        deadline: deadline || null,
      });
      setName("");
      setDescription("");
      setPriority("");
      setDeadline("");
      await load();
    } catch (err) {
      const e2 = err as Error;
      setError(e2?.message || "Nepodarilo sa uložiť projekt.");
    } finally {
      setSaving(false);
    }
  }

  // Zmazanie projektu — pridané po živom teste 2026-09-14 (predtým sa
  // testovacie/zbytočné projekty nemali ako odstrániť ani z UI, ani hlasom).
  // Neruší úlohy/poznámky/inšpiráciu priradené k projektu, len im zruší
  // project_id (on delete set null v schema.sql).
  async function handleDelete(id: string, projectName: string) {
    if (
      !confirm(
        `Naozaj natrvalo zmazať projekt "${projectName}"? Úlohy/poznámky priradené k nemu ostanú, len sa im zruší priradenie.`
      )
    )
      return;
    setBusyId(id);
    setError(null);
    try {
      const supabase = createClient();
      await deleteProject(supabase, id);
      await load();
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa zmazať projekt.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Projects</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-2 rounded-lg border border-neutral-200 p-3"
      >
        <input
          type="text"
          placeholder="Názov projektu"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          required
        />
        <textarea
          placeholder="Popis (nepovinné)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
        />
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Priorita (nepovinné)"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-1/2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-1/2 rounded-md border border-neutral-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Ukladám…" : "Pridať projekt"}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {projects === null && !error && (
        <p className="text-neutral-500">Načítavam…</p>
      )}

      {projects !== null && projects.length === 0 && (
        <p className="text-neutral-500">Zatiaľ žiadne projekty.</p>
      )}

      {projects !== null && projects.length > 0 && (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium">{p.name}</div>
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  disabled={busyId === p.id}
                  className="shrink-0 rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 disabled:opacity-50"
                >
                  Zmazať
                </button>
              </div>
              <div className="text-sm text-neutral-500">
                stav: {p.status}
                {p.priority ? ` · priorita: ${p.priority}` : ""}
                {p.deadline ? ` · deadline: ${p.deadline}` : ""}
              </div>
              {p.description && (
                <div className="mt-1 text-sm text-neutral-600">
                  {p.description}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
