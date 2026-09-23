import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Poznámka (2026-09-22): next/font/google (Sora) sa pri builde
        // nevedelo pripojiť na fonts.googleapis.com (sieťové obmedzenie
        // na tomto Macu aj v cloud sandboxe) a build kvôli tomu visel.
        // Namiesto sťahovaného webfontu preto systémový stack s podobným
        // geometrickým/zaobleným charakterom — bez závislosti na sieti
        // pri builde.
        sora: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"SF Pro Display"',
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
      },
      colors: {
        // Denný agent 2.0 — farebná paleta zo "smeru A" redizajnu
        // (Cowork Design prototyp, 2026-09-21/22).
        da: {
          bg: "#FAF8F5",
          text: "#211E1B",
          border: "#ECE8E1",
          meta: "#6E6759",
          muted: "#9A9384",
          placeholder: "#7D745F",
          accent: "#5B7F66",
          "accent-soft": "#E7EFE7",
          "accent-soft-text": "#3F5C48",
          card: "#FFFFFF",
          "chip-bg": "#F1EEE7",
          "chip-text": "#8A8172",
          danger: "#B4776B",
        },
      },
      borderRadius: {
        "da-card": "20px",
      },
      boxShadow: {
        "da-card": "0 1px 2px rgba(30,25,15,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
