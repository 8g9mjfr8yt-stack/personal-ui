"use client";

import { useVoiceAgent, voiceStatusLabel } from "@/lib/voice/VoiceAgentContext";

// Táto stránka teraz iba zobrazuje a ovláda zdieľanú Gemini Live session z
// VoiceAgentContext (lib/voice/VoiceAgentContext.tsx) — tú istú session,
// akú ovláda aj plávajúce mikrofónové tlačidlo viditeľné na všetkých
// stránkach appky (components/VoiceWidget.tsx). Táto stránka ostáva ako
// väčšie/prehľadnejšie okno rozhovoru pre toho, kto ju uprednostní pred
// plávajúcim tlačidlom.
export default function VoicePage() {
  const { status, errorMsg, isBusy, start, stop } = useVoiceAgent();

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">Hlas</h1>
      <p className="mb-6 text-neutral-500">
        Realtime hlasový rozhovor s agentom cez Gemini Live. Agent vie počas
        rozhovoru čítať, vytvárať, upravovať, dokončovať aj mazať úlohy,
        projekty, poznámky a ďalšie dáta priamo v databáze. Rovnaký
        rozhovor môžeš spustiť aj ovládať odkiaľkoľvek v appke cez
        plávajúce tlačidlo vpravo dole.
      </p>

      <button
        onClick={isBusy ? stop : start}
        disabled={status === "connecting"}
        className="rounded-lg bg-neutral-900 px-5 py-2.5 text-white disabled:opacity-50"
      >
        {status === "live" || status === "reconnecting"
          ? "Ukončiť rozhovor"
          : status === "connecting"
          ? "Pripájam sa…"
          : "Spustiť rozhovor"}
      </button>

      <p className="mt-4 text-sm text-neutral-500">
        Stav: {voiceStatusLabel(status)}
      </p>

      {errorMsg && <p className="mt-2 text-sm text-red-600">{errorMsg}</p>}
    </div>
  );
}
