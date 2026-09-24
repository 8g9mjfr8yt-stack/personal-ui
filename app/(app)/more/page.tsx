"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadInboxFile, createInboxItem } from "@/lib/supabase/inbox";
import ThemeToggle from "@/components/theme/ThemeToggle";
import { APP_VERSION } from "@/lib/theme";

// Denný agent 2.0 — "Viac": rozcestník na Úlohy / Inbox / Inšpirácia /
// Poznámky / Pamäť + na spodku sekcie foto-zachytávanie do Inboxu a
// odhlásenie (predtým v hornom NavBar, teraz úplne dole podľa spätnej
// väzby — foto-tlačidlo nad odhlásením).
//
// 2026-09-24 — foto-zachytávanie sa presunulo sem zo spodnej compose
// lišty (tá teraz má iba taby + mikrofón v strede). Tlačidlo spustí
// natívny foťák (capture="environment" na mobile) a odfotená fotka
// ide rovnakou cestou ako predtým — nahrá sa do Storage a vytvorí sa
// z nej "image" položka v Inboxe (lib/supabase/inbox.ts).
const ROWS = [
  { href: "/tasks", label: "Úlohy", icon: "tasks" },
  { href: "/inbox", label: "Inbox", icon: "inbox" },
  { href: "/inspiration", label: "Inšpirácia", icon: "inspiration" },
  { href: "/notes", label: "Poznámky", icon: "notes" },
  { href: "/memory", label: "Pamäť", icon: "memory" },
] as const;

export default function MorePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureMsg, setCaptureMsg] = useState<string | null>(null);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleCaptureFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCapturing(true);
    setCaptureMsg(null);
    try {
      const supabase = createClient();
      const path = await uploadInboxFile(supabase, file);
      await createInboxItem(supabase, path, "image");
      setCaptureMsg("Fotka uložená do Inboxu.");
    } catch (err) {
      const e2 = err as Error;
      setCaptureMsg(e2?.message || "Nepodarilo sa uložiť fotku.");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <div className="px-5 pt-6">
      <h1 className="mb-1 text-[21px] font-bold">Viac</h1>
      <p className="mb-5 text-sm text-da-meta">Ostatné sekcie a nastavenia</p>

      <div className="mb-5 overflow-hidden rounded-da-card border border-da-border bg-da-card shadow-da-card">
        {ROWS.map((row, i) => (
          <Link
            key={row.href}
            href={row.href}
            className="flex items-center gap-3.5 px-[18px] py-3.5"
            style={{ borderBottom: i < ROWS.length - 1 ? "1px solid rgb(var(--da-border))" : "none" }}
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-da-chip-bg text-da-accent">
              <RowIcon kind={row.icon} />
            </span>
            <span className="flex-grow text-[15px] font-medium">{row.label}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-da-muted" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        ))}
      </div>

      {/* Denný agent 2.1 — Vzhľad: prepínač denný / nočný režim */}
      <div className="mb-5 flex flex-col gap-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-da-meta">Vzhľad</span>
        <ThemeToggle />
      </div>

      <div className="overflow-hidden rounded-da-card border border-da-border bg-da-card shadow-da-card">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCaptureFile}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={capturing}
          className="flex w-full items-center gap-3.5 px-[18px] py-3.5 text-left disabled:opacity-60"
          style={{ borderBottom: "1px solid rgb(var(--da-border))" }}
        >
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-da-chip-bg text-da-accent">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8a2 2 0 0 1 2-2h1.6l1.2-1.7A2 2 0 0 1 10.4 3.5h3.2a2 2 0 0 1 1.6.8L16.4 6H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
              <circle cx="12" cy="13" r="3.4" />
            </svg>
          </span>
          <span className="flex-grow text-[15px] font-medium">
            {capturing ? "Ukladám fotku…" : "Odfotiť do Inboxu"}
          </span>
        </button>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full items-center gap-3.5 px-[18px] py-3.5 text-left text-da-danger"
        >
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-da-danger-soft text-da-danger">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </span>
          <span className="flex-grow text-[15px] font-medium">Odhlásiť sa</span>
        </button>
      </div>

      {captureMsg && <p className="mt-3 text-sm text-da-meta">{captureMsg}</p>}

      <p className="mt-3 pb-4 text-center text-xs text-da-meta">Denný agent {APP_VERSION}</p>
    </div>
  );
}

function RowIcon({ kind }: { kind: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
  if (kind === "tasks")
    return (
      <svg {...common}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    );
  if (kind === "inbox")
    return (
      <svg {...common}>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    );
  if (kind === "inspiration")
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9 12 2" />
      </svg>
    );
  if (kind === "notes")
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" />
        <line x1="8" y1="17" x2="13" y2="17" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M12 2a7 7 0 0 0-7 7c0 2.5 1.2 4.1 2.3 5.3.6.7 1.2 1.3 1.4 2A2 2 0 0 0 10.6 18h2.8a2 2 0 0 0 1.9-1.7c.2-.7.8-1.3 1.4-2C17.8 13.1 19 11.5 19 9a7 7 0 0 0-7-7z" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}
