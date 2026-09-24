"use client";

import { useEffect, useState } from "react";
import { enablePushNotifications, getNotificationPermissionState } from "@/lib/push/registerPush";

// Fáza 7.1 — jednorazové tlačidlo na povolenie Web Push notifikácií.
// Zobrazí sa iba, kým povolenie ešte nebolo rozhodnuté (default) — po
// udelení alebo zamietnutí sa skryje, žiadne opakované vyzývanie.
export default function NotificationsPrompt() {
  const [state, setState] = useState<NotificationPermission | "unsupported" | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);

  useEffect(() => {
    setState(getNotificationPermissionState());
  }, []);

  if (state !== "default") {
    return null;
  }

  async function handleClick() {
    setBusy(true);
    setErrorReason(null);
    const result = await enablePushNotifications();
    setBusy(false);
    if (result.ok) {
      setState("granted");
    } else {
      setErrorReason(result.reason || "unknown");
    }
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-da-border bg-da-card px-4 py-3 text-sm">
      <span>🔔 Povoliť notifikácie priamo v appke?</span>
      <div className="flex items-center gap-2">
        <button
          onClick={handleClick}
          disabled={busy}
          className="rounded-md bg-da-accent px-3 py-1.5 text-da-on-accent disabled:opacity-50"
        >
          {busy ? "Povoľujem…" : "Povoliť"}
        </button>
        {errorReason && (
          <span className="text-xs text-red-600">Nepodarilo sa ({errorReason}).</span>
        )}
      </div>
    </div>
  );
}
