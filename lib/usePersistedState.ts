"use client";

import { useEffect, useRef, useState } from "react";

// 2026-09-23 — po reálnom testovaní: pri prepnutí zo záložky (napr.
// Dnes -> Kalendár a späť) sa stránka odmountuje a React stav sa
// stratí, takže rozbalené úlohy/projekty aj scroll pozícia sa vždy
// resetli. Tieto dva hooky ukladajú stav do localStorage/sessionStorage
// (rovnaký vzor, aký už predtým používal Kalendár pre vybraný deň a
// otvorený "pool" panel), aby sa obrazovka po návrate zobrazila presne
// tak, ako ju používateľ opustil.
//
// Čítanie z localStorage/sessionStorage prebieha VŽDY až v useEffect
// (nikdy priamo v tele komponentu/lazy useState initializeri) — počas
// buildu sa totiž tieto klientske komponenty krátko renderujú aj na
// serveri (static generation) a tam `window` neexistuje. Efekty sa
// počas server-side/build renderu nikdy nespúšťajú, takže je to bezpečné.

export function usePersistedFlags(
  key: string
): [Record<string, boolean>, (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void] {
  const [flags, setFlagsState] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setFlagsState(JSON.parse(raw));
    } catch {
      /* localStorage nedostupné — ostane prázdne */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  function setFlags(updater: (prev: Record<string, boolean>) => Record<string, boolean>) {
    setFlagsState((prev) => {
      const next = updater(prev);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return [flags, setFlags];
}

// Obnoví scroll pozíciu uloženú pod `key` hneď po tom, čo je obsah
// pripravený (`ready`), a priebežne ju ukladá pri scrollovaní.
export function useScrollRestore(key: string, ready: boolean) {
  const restored = useRef(false);

  useEffect(() => {
    if (!ready || restored.current) return;
    restored.current = true;
    try {
      const raw = window.sessionStorage.getItem(key);
      const y = raw ? Number(raw) : 0;
      if (y > 0) {
        // dvojitý requestAnimationFrame — počká, kým sa obsah (vrátane
        // prípadných rozbalených úloh) reálne rozloží, inak by
        // scrollTo narazilo na ešte príliš nízku výšku stránky.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.scrollTo(0, y));
        });
      }
    } catch {
      /* ignore */
    }
  }, [ready, key]);

  useEffect(() => {
    function onScroll() {
      try {
        window.sessionStorage.setItem(key, String(window.scrollY));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [key]);
}
