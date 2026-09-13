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
  themeColor: "#171717",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sk">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        {children}
      </body>
    </html>
  );
}
