"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getInspiration,
  createInspiration,
  uploadInspirationFile,
  getInspirationFileUrl,
} from "@/lib/supabase/inspiration";

type Inspiration = {
  id: string;
  title: string | null;
  source_type: string | null;
  source_url: string | null;
  storage_url: string | null;
  why_saved: string | null;
  tags: string[] | null;
  created_at: string;
};

export default function InspirationPage() {
  const [items, setItems] = useState<Inspiration[] | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [whySaved, setWhySaved] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    try {
      const data = (await getInspiration(supabase)) as Inspiration[];
      setItems(data);

      // Bucket `inspiration` je private — na zobrazenie treba dočasnú
      // podpísanú URL pre každý riadok, ktorý má nahraný súbor.
      const withStorage = data.filter((i) => i.storage_url);
      if (withStorage.length > 0) {
        const urls = await Promise.all(
          withStorage.map(async (i) => {
            try {
              const url = await getInspirationFileUrl(supabase, i.storage_url!);
              return [i.id, url] as const;
            } catch {
              return [i.id, ""] as const;
            }
          })
        );
        setImageUrls(Object.fromEntries(urls));
      }
    } catch (err) {
      const e = err as Error;
      setError(e?.message || "Nepodarilo sa načítať inšpiráciu.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() && !sourceUrl.trim() && !file) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      const parsedTags = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      let storagePath: string | null = null;
      if (file) {
        storagePath = await uploadInspirationFile(supabase, file);
      }

      await createInspiration(supabase, {
        title: title.trim() || null,
        source_url: sourceUrl.trim() || null,
        storage_url: storagePath,
        why_saved: whySaved.trim() || null,
        tags: parsedTags,
      });
      setTitle("");
      setSourceUrl("");
      setWhySaved("");
      setTags("");
      setFile(null);
      await load();
    } catch (err) {
      const e2 = err as Error;
      setError(e2?.message || "Nepodarilo sa uložiť inšpiráciu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Inspiration</h1>

      <form
        onSubmit={handleSubmit}
        className="mb-6 space-y-2 rounded-lg border border-neutral-200 p-3"
      >
        <input
          type="text"
          placeholder="Názov (nepovinné)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          type="url"
          placeholder="Odkaz / URL (nepovinné)"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <textarea
          placeholder="Prečo si to ukladáš (nepovinné)"
          value={whySaved}
          onChange={(e) => setWhySaved(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
        />
        <input
          type="text"
          placeholder="Tagy oddelené čiarkou (nepovinné)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm"
        />
        <button
          type="submit"
          disabled={saving || (!title.trim() && !sourceUrl.trim() && !file)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Ukladám…" : "Uložiť inšpiráciu"}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {items === null && !error && (
        <p className="text-neutral-500">Načítavam…</p>
      )}

      {items !== null && items.length === 0 && (
        <p className="text-neutral-500">Zatiaľ žiadna uložená inšpirácia.</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="font-medium">{i.title || i.source_url || "(bez názvu)"}</div>
              {i.storage_url && imageUrls[i.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrls[i.id]}
                  alt={i.title || "inšpirácia"}
                  className="mt-2 max-h-48 rounded-md object-contain"
                />
              )}
              {i.source_url && (
                <a
                  href={i.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 underline"
                >
                  {i.source_url}
                </a>
              )}
              {i.why_saved && (
                <div className="mt-1 text-sm text-neutral-600">{i.why_saved}</div>
              )}
              {i.tags && i.tags.length > 0 && (
                <div className="mt-1 text-xs text-neutral-400">
                  {i.tags.join(" · ")}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
