"use client";

import { useEffect, useState } from "react";
import { readTheme, saveTheme, type Theme } from "@/lib/theme";

// Denný agent 2.1 — riadok "Nočný režim" s prepínačom (Viac → Vzhľad).
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("day");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  const on = theme === "night";

  function toggle() {
    const next: Theme = on ? "day" : "night";
    setTheme(next);
    saveTheme(next);
  }

  return (
    <div className="flex items-center gap-3.5 rounded-da-card border border-da-border bg-da-card px-[18px] py-3.5 shadow-da-card">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-da-accent/15 text-da-accent">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      </span>
      <span className="min-w-0 flex-grow">
        <span className="block text-[15px] font-medium">Nočný režim</span>
        <span className="mt-0.5 block text-xs text-da-meta">Tmavý vzhľad celej aplikácie</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Nočný režim"
        onClick={toggle}
        className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors ${on ? "bg-da-accent" : "bg-da-track"}`}
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full shadow transition-all ${on ? "left-6 bg-da-on-accent" : "left-1 bg-white"}`}
        />
      </button>
    </div>
  );
}
