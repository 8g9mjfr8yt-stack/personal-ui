"use client";

// v2.2 — Zápisník (nahrádza Inbox, Inšpiráciu a Poznámky). Navrchu sekcia
// „Nové“ (posledných 7 dní, bez projektu a bez úlohy) — odvodený pohľad,
// nie uložený stav. Filtre podľa obsahu: obrázok / link / text / projekt.

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getProjects } from "@/lib/supabase/projects";
import {
  getEntries,
  createEntry,
  deleteEntry,
  updateEntry,
  uploadEntryPhoto,
  getPhotoUrls,
  entryToTask,
  type Entry,
} from "@/lib/supabase/notebook";

type Project = { id: string; name: string };
type Filter = "all" | "photo" | "link" | "text";

const SOURCE_LABEL: Record<string, string> = {
  voice: "hlas",
  text: "text",
  photo: "fotka",
  link: "link",
  share: "zdieľané",
  migrated: "",
};

export default function NotebookPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [projects, setProjects] = useState<Project[]>([]);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [projectFilter, setProjectFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (q?: string) => {
    const supabase = createClient();
    try {
      const [list, pr] = await Promise.all([getEntries(supabase, q), getProjects(supabase) as Promise<Project[]>]);
      setEntries(list);
      setProjects(pr);
      const paths = list.map((e) => e.storage_path).filter(Boolean) as string[];
      setPhotoUrls(await getPhotoUrls(supabase, paths));
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa načítať zápisník.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await createEntry(createClient(), { text });
      setText("");
      await load(query);
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa uložiť.");
    } finally {
      setBusy(false);
    }
  }

  async function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const supabase = createClient();
      const path = await uploadEntryPhoto(supabase, file);
      await createEntry(supabase, { text, storage_path: path });
      setText("");
      await load(query);
    } catch (err) {
      setError((err as Error)?.message || "Nepodarilo sa uložiť fotku.");
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load(query);
    } catch (err) {
      setError((err as Error)?.message || "Akcia zlyhala.");
    } finally {
      setBusy(false);
    }
  }

  const weekAgo = Date.now() - 7 * 86_400_000;
  const matches = (e: Entry) =>
    (filter === "all" ||
      (filter === "photo" && !!e.storage_path) ||
      (filter === "link" && !!e.source_url) ||
      (filter === "text" && !e.storage_path && !e.source_url)) &&
    (!projectFilter || e.project_id === projectFilter);
  const list = (entries || []).filter(matches);
  const isNew = (e: Entry) => Date.parse(e.created_at) > weekAgo && !e.project_id && !e.converted_task_id;
  const fresh = list.filter(isNew);
  const rest = list.filter((e) => !isNew(e));

  function card(e: Entry) {
    const url = e.storage_path ? photoUrls[e.storage_path] : null;
    const src = SOURCE_LABEL[e.input_source];
    return (
      <div key={e.id} className={`flex flex-col gap-2 rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card ${e.converted_task_id ? "opacity-60" : ""}`}>
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={e.title || "fotka"} className="max-h-72 w-full rounded-xl object-cover" />
        )}
        {e.title && <div className="text-[15px] font-semibold text-da-text">{e.title}</div>}
        {e.content && <div className="whitespace-pre-wrap text-sm text-da-text">{e.content}</div>}
        {e.source_url && (
          <a href={e.source_url} target="_blank" rel="noreferrer" className="truncate text-sm text-da-accent underline">
            {e.source_url}
          </a>
        )}
        {e.why_saved && <div className="text-xs italic text-da-meta">{e.why_saved}</div>}
        <div className="flex flex-wrap items-center gap-2 text-xs text-da-meta">
          <span>{new Date(e.created_at).toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "2-digit" })}</span>
          {src && <span>· {src}</span>}
          {e.converted_task_id && <span>· → úloha</span>}
          <select
            value={e.project_id || ""}
            onChange={(ev) => act(() => updateEntry(createClient(), e.id, { project_id: ev.target.value || null }))}
            className="ml-auto rounded-md border border-da-border bg-da-card px-1.5 py-0.5 text-xs text-da-text"
          >
            <option value="">bez projektu</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          {!e.converted_task_id && (
            <button type="button" disabled={busy} onClick={() => act(() => entryToTask(createClient(), e))} className="rounded-full bg-da-chip-bg px-2.5 py-1 text-xs font-medium text-da-chip-text">
              Urobiť úlohu
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => confirm("Zmazať zápis?") && act(() => deleteEntry(createClient(), e.id))}
            className="rounded-full px-2.5 py-1 text-xs font-medium text-da-danger"
          >
            Zmazať
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-5 pb-8 pt-6">
      <h1 className="text-[21px] font-bold">Zápisník</h1>

      <div className="flex flex-col gap-2 rounded-da-card border border-da-border bg-da-card p-3 shadow-da-card">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Myšlienka, nápad, link…"
          rows={2}
          className="w-full resize-none bg-transparent text-sm text-da-text outline-none"
        />
        <div className="flex items-center justify-between">
          <input ref={fileRef} type="file" accept="image/*" onChange={addPhoto} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="text-sm text-da-meta">
            📷 Fotka
          </button>
          <button type="button" onClick={add} disabled={busy || !text.trim()} className="rounded-full bg-da-accent px-3 py-1 text-sm font-medium text-da-on-accent disabled:opacity-50">
            Uložiť
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <input
          type="search"
          placeholder="Hľadať…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load(query)}
          className="rounded-lg border border-da-border bg-da-card px-3 py-2 text-sm text-da-text"
        />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "photo", "link", "text"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs ${filter === f ? "bg-da-accent text-da-on-accent" : "bg-da-chip-bg text-da-chip-text"}`}
            >
              {{ all: "Všetko", photo: "S obrázkom", link: "S linkom", text: "Text" }[f]}
            </button>
          ))}
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="rounded-full border border-da-border bg-da-card px-2 py-1 text-xs text-da-text">
            <option value="">všetky projekty</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {entries === null && <p className="text-da-muted">Načítavam…</p>}

      {fresh.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-da-meta">Nové ({fresh.length})</div>
          {fresh.map(card)}
        </div>
      )}
      {rest.length > 0 && (
        <div className="flex flex-col gap-2">
          {fresh.length > 0 && <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-da-meta">Všetko ostatné</div>}
          {rest.map(card)}
        </div>
      )}
      {entries !== null && list.length === 0 && <p className="text-sm text-da-muted">Zatiaľ nič.</p>}
    </div>
  );
}
