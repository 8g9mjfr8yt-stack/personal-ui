"use client";

// Kruhový indikátor postupu (Denný agent 2.0/2.1) — používa sa pri
// projektoch (podiel hotových úloh) a od 2.1 aj ako "checkbox" úloh a
// podúloh (podiel hotových podúloh, bez čísel; hotová úloha = plný
// krúžok s fajkou). Farby predvolene z témy (deň/noc, app/globals.css).
export default function ProgressRing({
  percent,
  size = 30,
  strokeWidth = 3.5,
  color = "rgb(var(--da-accent))",
  trackColor = "rgb(var(--da-track))",
  check = false,
}: {
  percent: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  check?: boolean;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, percent));
  const offset = circumference * (1 - clamped);
  const center = size / 2;
  const k = size / 24;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
      {clamped > 0 && (
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
      )}
      {check && (
        <polyline
          points={`${7.5 * k} ${12.3 * k} ${10.6 * k} ${15.2 * k} ${16.5 * k} ${9 * k}`}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(2, strokeWidth * 0.8)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}
