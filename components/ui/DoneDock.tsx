"use client";

// Denný agent 2.1 / 2.13 — sekcia "Hotové" (Dnes, Kalendár).
//
// Hotové úlohy sú na spodku stránky, menej výrazné (TaskRow `faded`),
// a sekcia sa zobrazí iba vtedy, keď nejaké hotové úlohy sú.
//
// 2.13 — sekcia už NIE JE pripnutá (fixed) nad spodnou lištou, takže
// nikdy neprekrýva nedokončené úlohy. Je v bežnom toku stránky s
// `mt-auto`: keď je úloh málo, stránka (flex stĺpec s min-h na výšku
// obrazovky) ju odtlačí až tesne nad spodnú lištu; keď je úloh veľa,
// objaví sa až po doscrollovaní pod nimi. `bottomOffset` = extra miesto
// pod sekciou — v Kalendári pre zbalenú lištu "Voľné úlohy na
// priradenie", ktorá je pripnutá nad spodnou lištou.
export default function DoneDock({
  count,
  bottomOffset = 0,
  children,
}: {
  count: number;
  bottomOffset?: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;

  return (
    <div className="mt-auto pt-4" style={{ paddingBottom: 12 + bottomOffset }}>
      <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-da-muted">Hotové</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
