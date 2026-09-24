"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
    <div className="px-5 pt-6">
      <Link href="/more" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-da-placeholder">
        ‹ Viac
      </Link>

      <h1 className="mb-1 text-[21px] font-bold">Inšpirácia</h1>
      <p className="mb-5 text-sm text-da-meta">Nápady, odkazy a obrázky na neskôr</p>

      <form
        onSubmit={handleSubmit}
        className="mb-5 flex flex-col gap-2 rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
      >
        <input
          type="text"
          placeholder="Názov (nepovinné)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
        />
        <input
          type="url"
          placeholder="Odkaz / URL (nepovinné)"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
        />
        <textarea
          placeholder="Prečo si to ukladáš (nepovinné)"
          value={whySaved}
          onChange={(e) => setWhySaved(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
          rows={2}
        />
        <input
          type="text"
          placeholder="Tagy oddelené čiarkou (nepovinné)"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm text-da-meta"
        />
        <button
          type="submit"
          disabled={saving || (!title.trim() && !sourceUrl.trim() && !file)}
          className="rounded-full bg-da-accent px-4 py-2 text-sm font-medium text-da-on-accent disabled:opacity-50"
        >
          {saving ? "Ukladám…" : "Uložiť inšpiráciu"}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {items === null && !error && (
        <p className="text-da-muted">Načítavam…</p>
      )}

      {items !== null && items.length === 0 && (
        <p className="text-da-muted">Zatiaľ žiadna uložená inšpirácia.</p>
      )}

      {items !== null && items.length > 0 && (
        <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2">
          {items.map((i) => (
            <div
              key={i.id}
              className="overflow-hidden rounded-da-card border border-da-border bg-da-card shadow-da-card"
            >
              {i.storage_url && imageUrls[i.id] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imageUrls[i.id]}
                  alt={i.title || "inšpirácia"}
                  className="h-40 w-full object-cover"
                />
              )}
              <div className="p-3.5">
                <div className="text-[15px] font-semibold text-da-text">
                  {i.title || i.source_url || "(bez názvu)"}
                </div>
                {i.source_url && (
                  <a
                    href={i.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm text-da-accent underline"
                  >
                    {i.source_url}
                  </a>
                )}
                {i.why_saved && (
                  <div className="mt-1.5 text-sm text-da-meta">{i.why_saved}</div>
                )}
                {i.tags && i.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {i.tags.map((tag, idx) => (
                      <span
                        key={`${i.id}-${tag}-${idx}`}
                        className="rounded-full bg-da-chip-bg px-2 py-0.5 text-[11px] text-da-chip-text"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
