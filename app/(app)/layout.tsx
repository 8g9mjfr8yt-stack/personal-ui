import BottomChrome from "@/components/ui/BottomChrome";
import { VoiceAgentProvider } from "@/lib/voice/VoiceAgentContext";

// Denný agent 2.0 — spodná pripnutá lišta (BottomChrome: Dnes/Kalendár/
// [mikrofón]/Projekty/Viac) nahrádza pôvodný horný NavBar aj samostatné
// plávajúce VoiceWidget tlačidlo. Odhlásenie a foto-zachytávanie do
// Inboxu sú na stránke /more (Viac). Lišta má teraz iba jeden riadok
// (bez compose riadku), preto je pb-24 namiesto pôvodného pb-40.
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VoiceAgentProvider>
      <div className="min-h-screen pb-24">
        <main className="mx-auto max-w-3xl">{children}</main>
        <BottomChrome />
      </div>
    </VoiceAgentProvider>
  );
}
