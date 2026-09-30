"use client";

// Malé okrúhle tlačidlo s ikonou „+“ / „−“ v jednotnom štýle
// (jemné zelené pozadie + zelená ikona). Pool: „+“ = naplánovať na deň,
// úloha dňa: „−“ = odobrať z dňa (späť do poolu).
export default function CircleIconButton({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: "plus" | "minus";
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-da-accent/20 text-da-accent transition-colors hover:bg-da-accent/30 active:bg-da-accent/40 disabled:opacity-40"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
        {icon === "plus" && <line x1="12" y1="5" x2="12" y2="19" />}
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
  );
}
