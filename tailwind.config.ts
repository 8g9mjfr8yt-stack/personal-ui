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
        // Denný agent 2.1 — farby sú CSS premenné (RGB kanály); hodnoty pre
        // denný aj nočný režim sú v app/globals.css. Formát
        // `rgb(var(--x) / <alpha-value>)` zachováva modifikátory
        // priehľadnosti (napr. border-da-border/70).
        da: {
          bg: "rgb(var(--da-bg) / <alpha-value>)",
          text: "rgb(var(--da-text) / <alpha-value>)",
          border: "rgb(var(--da-border) / <alpha-value>)",
          meta: "rgb(var(--da-meta) / <alpha-value>)",
          muted: "rgb(var(--da-muted) / <alpha-value>)",
          placeholder: "rgb(var(--da-placeholder) / <alpha-value>)",
          accent: "rgb(var(--da-accent) / <alpha-value>)",
          "accent-soft": "rgb(var(--da-accent-soft) / <alpha-value>)",
          "accent-soft-text": "rgb(var(--da-accent-soft-text) / <alpha-value>)",
          card: "rgb(var(--da-card) / <alpha-value>)",
          "chip-bg": "rgb(var(--da-chip-bg) / <alpha-value>)",
          "chip-text": "rgb(var(--da-chip-text) / <alpha-value>)",
          danger: "rgb(var(--da-danger) / <alpha-value>)",
          "danger-soft": "rgb(var(--da-danger-soft) / <alpha-value>)",
          track: "rgb(var(--da-track) / <alpha-value>)",
          nav: "rgb(var(--da-nav) / <alpha-value>)",
          "nav-border": "rgb(var(--da-nav-border) / <alpha-value>)",
          "on-accent": "rgb(var(--da-on-accent) / <alpha-value>)",
        },
      },
      borderRadius: {
        "da-card": "20px",
      },
      boxShadow: {
        "da-card": "var(--da-card-shadow)",
      },
    },
  },
  plugins: [],
};

export default config;
