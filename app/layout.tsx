import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Denný agent",
  description: "Personal UI",
  manifest: "/manifest.json",
  // Fáza 4.6 — PWA (Add to Home Screen), aby sa appka na iPhone/Mac otvárala
  // ako samostatná appka (bez adresného riadku Safari) a dala sa otvoriť
  // priamo z push notifikácie.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Denný agent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAF8F5",
};

// Denný agent 2.0 — písmo: pôvodný redizajn (Cowork Design prototyp)
// používal Google Font "Sora" cez next/font/google, ale to sa pri builde
// snaží stiahnuť font súbory z fonts.googleapis.com/fonts.gstatic.com —
// na tomto Macu (a rovnako v cloud sandboxe) je táto sieť nedostupná, čo
// spôsobovalo, že `next build` (aj `next dev`) visel. Namiesto toho sa
// používa systémový font stack s podobným zaobleným/geometrickým
// charakterom (viď tailwind.config.ts, `font-sora`), bez akejkoľvek
// závislosti na sieti pri builde.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sk">
      <body className="min-h-screen bg-da-bg font-sora text-da-text">
        {children}
      </body>
    </html>
  );
}
