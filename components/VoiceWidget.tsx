"use client";

import { useVoiceAgent, voiceStatusLabel } from "@/lib/voice/VoiceAgentContext";

// Plávajúce mikrofónové tlačidlo, viditeľné na každej stránke appky
// (mountuje sa raz v app/(app)/layout.tsx, takže je vidieť na Today,
// Tasks, Projects, Inbox, Inspiration, Notes aj samotnej stránke /voice).
// Ovláda tú istú zdieľanú Gemini Live session ako stránka /voice — obe
// čítajú stav z VoiceAgentContext (lib/voice/VoiceAgentContext.tsx), takže
// rozhovor spustený odkiaľkoľvek pokračuje aj po prekliknutí na inú
// stránku.
export default function VoiceWidget() {
  const { status, errorMsg, isBusy, start, stop } = useVoiceAgent();

  const colors: Record<string, string> = {
    idle: "bg-neutral-900 hover:bg-neutral-700",
    connecting: "bg-amber-500",
    live: "bg-red-600 hover:bg-red-700",
    reconnecting: "bg-amber-500",
    error: "bg-red-800 hover:bg-red-900",
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2">
      {errorMsg && status === "error" && (
        <p className="max-w-[220px] rounded-lg bg-white px-3 py-2 text-xs text-red-600 shadow-md">
          {errorMsg}
        </p>
      )}

      <button
        onClick={isBusy ? stop : start}
        disabled={status === "connecting"}
        aria-label={isBusy ? "Ukončiť hlasový rozhovor" : "Spustiť hlasový rozhovor"}
        title={voiceStatusLabel(status)}
        className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-60 ${colors[status]}`}
      >
        {status === "live" ? (
          <span className="h-3 w-3 animate-pulse rounded-full bg-white" />
        ) : status === "connecting" || status === "reconnecting" ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <MicIcon />
        )}
      </button>
    </div>
  );
}

function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}
