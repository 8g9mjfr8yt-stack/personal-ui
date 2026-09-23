"use client";

// Kruhový indikátor postupu (Denný agent 2.0) — používa sa pri úlohách
// s podúlohami (podiel dokončených podúloh, bez zobrazovania čísel) aj
// pri projektoch (podiel hotových úloh z celého projektu).
export default function ProgressRing({
  percent,
  size = 30,
  strokeWidth = 3.5,
  color = "#5B7F66",
  trackColor = "#E7E2D7",
}: {
  percent: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, percent));
  const offset = circumference * (1 - clamped);
  const center = size / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: "stroke-dashoffset 0.35s ease" }}
      />
    </svg>
  );
}
