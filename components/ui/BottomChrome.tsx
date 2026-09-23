"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useVoiceAgent } from "@/lib/voice/VoiceAgentContext";

// Pripnutá spodná lišta (Denný agent 2.0) — nahrádza pôvodný NavBar +
// plávajúce VoiceWidget tlačidlo. Dva riadky:
//   1. compose riadok — foto/capture (vedie do Inboxu, "Capture first."),
//      textová bublina (tiež do Inboxu — rýchly zápis), a hlasové
//      tlačidlo napojené na tú istú zdieľanú Gemini Live session
//      (VoiceAgentContext) ako predtým VoiceWidget.
//   2. taby — Dnes / Kalendár / Projekty / Viac.
// Viac je aktívna aj na podstránkach, ktoré sa z nej otvárajú (Úlohy,
// Inbox, Inšpirácia, Poznámky, Pamäť) — presne ako v prototype.
const TABS = [
  { href: "/today", label: "Dnes", match: (p: string) => p === "/today" },
  { href: "/calendar", label: "Kalendár", match: (p: string) => p === "/calendar" },
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
  idle: "#5B7F66",
  connecting: "#C9A24A",
  live: "#B4776B",
  reconnecting: "#C9A24A",
  error: "#8C4A40",
};

export default function BottomChrome() {
  const pathname = usePathname();
  const { status, isBusy, start, stop } = useVoiceAgent();

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#EFEBE3] bg-white">
      <div className="mx-auto flex max-w-3xl flex-col">
        <div className="flex items-center gap-2.5 px-4 pb-2 pt-2.5">
          <Link
            href="/inbox"
            aria-label="Rýchly zápis / foto do Inboxu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-da-chip-bg text-da-meta"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8a2 2 0 0 1 2-2h1.6l1.2-1.7A2 2 0 0 1 10.4 3.5h3.2a2 2 0 0 1 1.6.8L16.4 6H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
              <circle cx="12" cy="13" r="3.4" />
            </svg>
          </Link>

          <Link
            href="/inbox"
            className="flex-grow truncate rounded-full border border-[#EAE5D9] bg-[#F5F3EE] px-4 py-2.5 text-sm text-da-placeholder"
          >
            Napíš správu Dennému agentovi…
          </Link>

          <button
            type="button"
            onClick={isBusy ? stop : start}
            disabled={status === "connecting"}
            aria-label={isBusy ? "Ukončiť hlasový rozhovor" : "Spustiť hlasový rozhovor"}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-60"
            style={{ background: VOICE_COLORS[status] || "#5B7F66" }}
          >
            {status === "live" ? (
              <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
            ) : status === "connecting" || status === "reconnecting" ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
              </svg>
            )}
          </button>
        </div>

        <div className="flex items-center justify-around px-2 pb-3 pt-0.5">
          {TABS.map((tab) => {
            const active = tab.match(pathname || "");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center gap-1"
                style={{ color: active ? "#211E1B" : "#9A9384" }}
              >
                <TabIcon label={tab.label} />
                <span className="text-[10px]" style={{ fontWeight: active ? 600 : 400 }}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
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
