"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInbox, createInboxItem } from "@/lib/supabase/inbox";

type InboxItem = {
  id: string;
  content: string;
  input_type: string;
  status: string;
  created_at: string;
};

// Rýchle zachytávanie ("Capture first. Organize later." — PROJECT.md časť 13).
// AI klasifikácia Inboxu (task/note/inspiration/...) je plánovaná na Fázu 5
// a zatiaľ nie je postavená — táto stránka zatiaľ len zachytáva a zobrazuje
// nespracované položky.
export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const supabase = createClient();
    try {
      const data = await getInbox(supabase);
      setItems(data as InboxItem[]);
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
    if (!content.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    try {
      await createInboxItem(supabase, content.trim());
      setContent("");
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
          required
        />
        <button
          type="submit"
          disabled={saving || !content.trim()}
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
              <div className="text-sm">{i.content}</div>
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
