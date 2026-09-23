"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getInbox, createInboxItem, uploadInboxFile } from "@/lib/supabase/inbox";
import { getInspirationFileUrl } from "@/lib/supabase/inspiration";

type InboxItem = {
  id: string;
  content: string;
  input_type: string;
  status: string;
  created_at: string;
};

// Rýchle zachytávanie ("Capture first. Organize later." — PROJECT.md časť 13).
// AI klasifikácia Inboxu (task/note/inspiration/...) je čiastočne postavená
// (process_inbox v hlasovom agentovi, Fáza 3 leftovers) — táto stránka
// zatiaľ len zachytáva a zobrazuje nespracované položky (text alebo obrázok).
export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    try {
      const data = (await getInbox(supabase)) as InboxItem[];
      setItems(data);

      // Obrázkové položky majú v `content` uloženú cestu v Storage bucket-e
      // `inspiration` (bucket je private) — treba dočasnú podpísanú URL.
      const imageItems = data.filter((i) => i.input_type === "image");
      if (imageItems.length > 0) {
        const urls = await Promise.all(
          imageItems.map(async (i) => {
            try {
              const url = await getInspirationFileUrl(supabase, i.content);
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
      setError(e?.message || "Nepodarilo sa načítať Inbox.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !file) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      if (file) {
        const path = await uploadInboxFile(supabase, file);
        await createInboxItem(supabase, path, "image");
      } else {
        await createInboxItem(supabase, content.trim());
      }
      setContent("");
      setFile(null);
      await load();
    } catch (err) {
      const e2 = err as Error;
      setError(e2?.message || "Nepodarilo sa uložiť do Inboxu.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 pt-6">
      <Link href="/more" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-da-placeholder">
        ‹ Viac
      </Link>
      <h1 className="mb-1 text-[21px] font-bold">Inbox</h1>
      <p className="mb-5 text-sm text-da-meta">Hoď sem čokoľvek — netreba rozhodnúť kam to patrí</p>

      <form
        onSubmit={handleSubmit}
        className="mb-6 flex flex-col gap-2 rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
      >
        <textarea
          placeholder="Hoď sem čokoľvek — netreba rozhodnúť kam to patrí"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full rounded-lg border border-da-border px-3 py-2 text-sm text-da-text placeholder:text-da-placeholder"
          rows={2}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm text-da-meta"
        />
        <button
          type="submit"
          disabled={saving || (!content.trim() && !file)}
          className="self-start rounded-full bg-da-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Ukladám…" : "Uložiť do Inboxu"}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-da-danger">{error}</p>}

      {items === null && !error && (
        <p className="text-da-muted">Načítavam…</p>
      )}

      {items !== null && items.length === 0 && (
        <p className="text-da-muted">Inbox je prázdny.</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="flex flex-col gap-3 pb-4">
          {items.map((i) => (
            <li
              key={i.id}
              className="rounded-da-card border border-da-border bg-da-card p-3.5 shadow-da-card"
            >
              {i.input_type === "image" ? (
                imageUrls[i.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrls[i.id]}
                    alt="Inbox fotka"
                    className="max-h-48 rounded-lg object-contain"
                  />
                ) : (
                  <div className="text-sm text-da-muted">Načítavam obrázok…</div>
                )
              ) : (
                <div className="text-sm text-da-text">{i.content}</div>
              )}
              <div className="mt-1.5 text-xs text-da-meta">
                {new Date(i.created_at).toLocaleString("sk-SK")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
