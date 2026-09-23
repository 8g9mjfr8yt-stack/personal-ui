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

// Jemné pozadie odvodené z farby akcentu (na pilulky/odznaky) — obdoba
// pôvodného natvrdo zapísaného da-accent-soft (#E7EFE7).
export function softBg(color?: string | null, alpha = 0.16): string {
  const rgb = hexToRgb(accentOrDefault(color));
  if (!rgb) return "#E7EFE7";
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

// Tmavší odtieň farby akcentu (na text pilulky, nech je dostatočne
// kontrastný na svetlom softBg() pozadí).
export function softText(color?: string | null): string {
  const rgb = hexToRgb(accentOrDefault(color));
  if (!rgb) return "#3F5C48";
  const factor = 0.62;
  const shaded = rgb.map((c) => Math.round(c * factor));
  return `rgb(${shaded[0]}, ${shaded[1]}, ${shaded[2]})`;
}
