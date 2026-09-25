// Denný agent 2.1 — denný / nočný režim.
//
// Voľba sa ukladá do localStorage (per zariadenie) a aplikuje sa ako
// atribút data-theme="night" na <html>. Farby pre oba režimy sú CSS
// premenné v app/globals.css. Aby pri načítaní stránky neprebliklo
// denné pozadie, ten istý kód beží ešte pred vykreslením ako inline
// skript v app/layout.tsx (THEME_BOOT_SCRIPT).
export type Theme = "day" | "night";

export const THEME_STORAGE_KEY = "da_theme";

export const THEME_COLORS: Record<Theme, string> = {
  day: "#FAF8F5",
  night: "#131313",
};

export const APP_VERSION = "2.13";

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) === "night" ? "night" : "day";
  } catch {
    return "day";
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "night") root.setAttribute("data-theme", "night");
  else root.removeAttribute("data-theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_COLORS[theme]);
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Súkromný režim / zablokované úložisko — režim platí aspoň do
    // zatvorenia stránky.
  }
  applyTheme(theme);
}

export const THEME_BOOT_SCRIPT = `(function(){try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="night"){document.documentElement.setAttribute("data-theme","night");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${THEME_COLORS.night}");}}catch(e){}})();`;
