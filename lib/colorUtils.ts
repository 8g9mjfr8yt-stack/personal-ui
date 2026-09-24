// Pomocné funkcie na prácu s voliteľnou farbou akcentu projektu
// (`projects.accent_color`, migrácia 0005_add_project_color.sql). Keď
// projekt nemá vlastnú farbu, všade sa použije predvolená šalviová
// (#5B7F66) — presne ako pred zavedením tejto funkcie.
export const DEFAULT_ACCENT = "#5B7F66";

export const ACCENT_SWATCHES = [
  "#5B7F66", // šalviová (predvolená)
  "#B4776B", // terakota
  "#5B7BA0", // modrá
  "#8A6BB0", // fialová
  "#B08A3F", // horčicová
  "#4F9C93", // tyrkysová
  "#B0638A", // ružová
  "#6E6759", // šedohnedá
];

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

export function accentOrDefault(color?: string | null): string {
  return color && hexToRgb(color) ? color : DEFAULT_ACCENT;
}

// Denný agent 2.1 — farba akcentu na vykreslenie (krúžky, bodky,
// pilulky). Projekt bez vlastnej farby (alebo s predvolenou šalviovou)
// dostane CSS premennú témy, takže v nočnom režime automaticky zmení
// farbu na mätovú. Vlastné farby projektov ostávajú v oboch režimoch.
// (accentOrDefault vyššie vracia vždy hex — potrebné pre <input type="color">.)
function isDefaultAccent(color?: string | null): boolean {
  return !color || !hexToRgb(color) || color.toUpperCase() === DEFAULT_ACCENT;
}

export function accentColor(color?: string | null): string {
  return isDefaultAccent(color) ? "rgb(var(--da-accent))" : (color as string);
}

// Jemné pozadie odvodené z farby akcentu (na pilulky/odznaky).
export function softBg(color?: string | null, alpha = 0.16): string {
  if (isDefaultAccent(color)) return `rgb(var(--da-accent) / ${alpha})`;
  const rgb = hexToRgb(color as string) as [number, number, number];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

// Text pilulky — farba akcentu stmavená (deň) alebo zosvetlená (noc),
// nech je dostatočne kontrastná na softBg() pozadí. Zmiešava sa s
// premennou --da-soft-mix z app/globals.css.
export function softText(color?: string | null): string {
  if (isDefaultAccent(color)) return "rgb(var(--da-accent-soft-text))";
  return `color-mix(in srgb, ${color} 62%, var(--da-soft-mix))`;
}
