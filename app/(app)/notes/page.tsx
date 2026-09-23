"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
    <div className="px-5 pt-6">
      <Link href="/more" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-da-placeholder">
        ‹ Viac
      </Link>
      <h1 className="mb-1 text-[21px] font-bold">Poznámky</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-5 mt-4 flex flex-col gap-2 rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
      >
        <input
          type="text"
          placeholder="Nadpis (nepovinné)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
        />
        <textarea
          placeholder="Poznámka"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
          rows={3}
          required
        />
        <input
          type="text"
          placeholder="Tagy oddelené čiarkou (nepovinné)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
          className="rounded-full bg-da-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Ukladám…" : "Pridať poznámku"}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-da-danger">{error}</p>}

      {notes === null && !error && (
        <p className="text-da-muted">Načítavam…</p>
      )}

      {notes !== null && notes.length === 0 && (
        <p className="text-da-muted">Zatiaľ žiadne poznámky.</p>
      )}

      {notes !== null && notes.length > 0 && (
        <ul className="flex flex-col gap-3 pb-4">
          {notes.map((n) => (
            <li
              key={n.id}
              className="rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
            >
              {n.title && <div className="text-[15px] font-bold text-da-text">{n.title}</div>}
              <div className="mt-0.5 text-sm text-da-meta">{n.content}</div>
              {n.tags && n.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {n.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-da-chip-bg px-2 py-0.5 text-[11px] text-da-chip-text"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
