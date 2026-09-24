"use client";

import { useEffect, useRef, useState } from "react";

// Denný agent 2.1 — sekcia "Hotové" (Dnes, Kalendár).
//
// Hotové úlohy sa presúvajú na úplný spodok obrazovky, tesne nad spodnú
// lištu (BottomChrome, 64 px), a sú menej výrazné (TaskRow `faded`).
// Sekcia sa zobrazí iba vtedy, keď nejaké hotové úlohy sú.
//
// Je pripnutá (fixed), preto do bežného toku vloží rovnako vysoký
// "spacer", aby posledná nedokončená úloha a "+" tlačidlo neostali
// schované pod ňou. `bottomOffset` = extra miesto pod sekciou — v
// Kalendári pre zbalenú lištu "Voľné úlohy na priradenie" (tá má
// vyšší z-index, takže otvorený pool sekciu Hotové prekryje a nič
// nevytláča smerom hore).
export const NAV_HEIGHT = 64;

export default function DoneDock({
  count,
  bottomOffset = 0,
  children,
}: {
  count: number;
  bottomOffset?: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.getBoundingClientRect().height);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);

  if (count === 0) return null;

  return (
    <>
      <div aria-hidden="true" style={{ height }} />
      <div
        ref={ref}
        className="fixed inset-x-0 z-30 mx-auto max-w-3xl bg-da-bg px-5 pt-1.5"
        style={{ bottom: NAV_HEIGHT, paddingBottom: 12 + bottomOffset }}
      >
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-da-muted">Hotové</div>
        <div className="flex max-h-[30vh] flex-col gap-2 overflow-y-auto">{children}</div>
      </div>
    </>
  );
}
