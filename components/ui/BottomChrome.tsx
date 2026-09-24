"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVoiceAgent } from "@/lib/voice/VoiceAgentContext";
import { applyTheme, readTheme } from "@/lib/theme";

// Pripnutá spodná lišta (Denný agent 2.0).
//
// 2026-09-24 — zjednodušené podľa spätnej väzby: predtým mala lišta
// dva riadky (compose riadok s foto/text/mikrofón + taby). Compose
// riadok je preč (foto zachytávanie má teraz vlastné miesto v Viac →
// pozri app/(app)/more/page.tsx, rýchly text ide priamo cez Inbox).
// Mikrofón sa presunul do stredu samotného tab baru, medzi Kalendár a
// Projekty — zvýraznené kruhové tlačidlo, podobne ako "+" v strede
// spodnej lišty v iných appkách.
const LEFT_TABS = [
  { href: "/today", label: "Dnes", match: (p: string) => p === "/today" },
  { href: "/calendar", label: "Kalendár", match: (p: string) => p === "/calendar" },
];

const RIGHT_TABS = [
  { href: "/projects", label: "Projekty", match: (p: string) => p === "/projects" },
  {
    href: "/more",
    label: "Viac",
    match: (p: string) =>
      p === "/more" ||
      ["/tasks", "/inbox", "/inspiration", "/notes", "/memory"].includes(p),
  },
];

const VOICE_COLORS: Record<string, string> = {
  idle: "rgb(var(--da-accent))",
  connecting: "#C9A24A",
  live: "#B4776B",
  reconnecting: "#C9A24A",
  error: "#8C4A40",
};

export default function BottomChrome() {
  const pathname = usePathname();
  const { status, isBusy, start, stop } = useVoiceAgent();

  // Denný agent 2.1 — pre istotu zosynchronizuje režim (aj farbu
  // meta theme-color) po načítaní; hlavné nastavenie robí inline skript
  // v app/layout.tsx ešte pred vykreslením.
  useEffect(() => {
    applyTheme(readTheme());
  }, []);

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-da-nav-border bg-da-nav">
      <div className="mx-auto flex max-w-3xl items-center justify-around px-2 pb-3 pt-2">
        {LEFT_TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.match(pathname || "")} />
        ))}

        <button
          type="button"
          onClick={isBusy ? stop : start}
          disabled={status === "connecting"}
          aria-label={isBusy ? "Ukončiť hlasový rozhovor" : "Spustiť hlasový rozhovor"}
          className={`-mt-5 flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-lg ring-4 ring-da-nav disabled:opacity-60 ${status === "idle" ? "text-da-on-accent" : "text-white"}`}
          style={{ background: VOICE_COLORS[status] || "rgb(var(--da-accent))" }}
        >
          {status === "live" ? (
            <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-white" />
          ) : status === "connecting" || status === "reconnecting" ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
            </svg>
          )}
        </button>

        {RIGHT_TABS.map((tab) => (
          <TabLink key={tab.href} tab={tab} active={tab.match(pathname || "")} />
        ))}
      </div>
    </div>
  );
}

function TabLink({
  tab,
  active,
}: {
  tab: { href: string; label: string };
  active: boolean;
}) {
  return (
    <Link
      href={tab.href}
      className={`flex flex-col items-center gap-1 ${active ? "text-da-text" : "text-da-meta"}`}
    >
      <TabIcon label={tab.label} />
      <span className="text-[10px]" style={{ fontWeight: active ? 600 : 400 }}>
        {tab.label}
      </span>
    </Link>
  );
}

function TabIcon({ label }: { label: string }) {
  const common = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
  if (label === "Dnes")
    return (
      <svg {...common}>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </svg>
    );
  if (label === "Kalendár")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <line x1="3" y1="10" x2="21" y2="10" />
        <line x1="8" y1="3" x2="8" y2="7" />
        <line x1="16" y1="3" x2="16" y2="7" />
      </svg>
    );
  if (label === "Projekty")
    return (
      <svg {...common}>
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      </svg>
    );
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}
