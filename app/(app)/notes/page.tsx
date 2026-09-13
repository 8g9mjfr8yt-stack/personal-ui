"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getNotes, createNote } from "@/lib/supabase/notes";

type Note = {
  id: string;
  title: string | null;
  content: string;
  tags: string[] | null;
  created_at: string;
};

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    try {
      const data = await getNotes(supabase);
      setNotes(data as Note[]);
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať poznámky.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await createNote(supabase, {
        title: title.trim() || null,
        content: content.trim(),
        tags: parsedTags,
      });
      setTitle("");
      setContent("");
      setTags("");
      await load();
    } catch (err) {
      const e2 = err as Error;
      setError(e2?.message || "Nepodarilo sa uložiť poznámku.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Notes</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-2 rounded-lg border border-neutral-200 p-3"
      >
        <input
          type="text"
          placeholder="Nadpis (nepovinné)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Poznámka"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={3}
          required
        />
        <input
          type="text"
          placeholder="Tagy oddelené čiarkou (nepovinné)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Ukladám…" : "Pridať poznámku"}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {notes === null && !error && (
        <p className="text-neutral-500">Načítavam…</p>
      )}

      {notes !== null && notes.length === 0 && (
        <p className="text-neutral-500">Zatiaľ žiadne poznámky.</p>
      )}

      {notes !== null && notes.length > 0 && (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border border-neutral-200 p-3">
              {n.title && <div className="font-medium">{n.title}</div>}
              <div className="text-sm text-neutral-600">{n.content}</div>
              {n.tags && n.tags.length > 0 && (
                <div className="mt-1 text-xs text-neutral-400">
                  {n.tags.join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
