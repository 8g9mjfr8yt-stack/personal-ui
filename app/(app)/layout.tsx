import BottomChrome from "@/components/ui/BottomChrome";
import { VoiceAgentProvider } from "@/lib/voice/VoiceAgentContext";

// Denný agent 2.0 — spodná pripnutá lišta (BottomChrome: compose riadok +
// Dnes/Kalendár/Projekty/Viac taby) nahrádza pôvodný horný NavBar aj
// samostatné plávajúce VoiceWidget tlačidlo (hlas je teraz súčasť
// compose riadku). Odhlásenie sa presunulo na stránku /more (Viac).
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VoiceAgentProvider>
      <div className="min-h-screen pb-40">
        <main className="mx-auto max-w-3xl">{children}</main>
        <BottomChrome />
      </div>
    </VoiceAgentProvider>
  );
}
