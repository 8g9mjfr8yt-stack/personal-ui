"use client";

import { useEffect, useState } from "react";
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
    <div>
      <h1 className="mb-4 text-xl font-semibold">Inbox</h1>

      <form onSubmit={handleSubmit} className="mb-6 space-y-2">
        <textarea
          placeholder="Hoď sem čokoľvek — netreba rozhodnúť kam to patrí"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          rows={2}
        />
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full text-sm"
        />
        <button
          type="submit"
          disabled={saving || (!content.trim() && !file)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Ukladám…" : "Uložiť do Inboxu"}
        </button>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {items === null && !error && (
        <p className="text-neutral-500">Načítavam…</p>
      )}

      {items !== null && items.length === 0 && (
        <p className="text-neutral-500">Inbox je prázdny.</p>
      )}

      {items !== null && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.id} className="rounded-lg border border-neutral-200 p-3">
              {i.input_type === "image" ? (
                imageUrls[i.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrls[i.id]}
                    alt="Inbox fotka"
                    className="max-h-48 rounded-md object-contain"
                  />
                ) : (
                  <div className="text-sm text-neutral-400">Načítavam obrázok…</div>
                )
              ) : (
                <div className="text-sm">{i.content}</div>
              )}
              <div className="mt-1 text-xs text-neutral-400">
                {new Date(i.created_at).toLocaleString("sk-SK")}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
