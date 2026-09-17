import NavBar from "@/components/NavBar";
import VoiceWidget from "@/components/VoiceWidget";
import { VoiceAgentProvider } from "@/lib/voice/VoiceAgentContext";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VoiceAgentProvider>
      <div className="min-h-screen">
        <NavBar />
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
        <VoiceWidget />
      </div>
    </VoiceAgentProvider>
  );
}
