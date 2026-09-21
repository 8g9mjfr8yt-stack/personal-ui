import { createClient } from "@/lib/supabase/client";
import { savePushSubscription } from "@/lib/supabase/pushSubscriptions";

// Fáza 7.1 — registrácia service workera a prihlásenie k odberu Web Push
// notifikácií priamo z prehliadača. Funguje iba z appky pridanej na plochu
// (iOS 16.4+) — v bežnom Safari tabe buď Notification API chýba, alebo
// povolenie nikdy neprejde.

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function enablePushNotifications(): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined") return { ok: false, reason: "no-window" };
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported" };
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return { ok: false, reason: "missing-vapid-key" };

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, reason: "permission-denied" };

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "invalid-subscription" };
    }

    const supabase = createClient();
    await savePushSubscription(supabase, {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      userAgent: navigator.userAgent,
    });

    return { ok: true };
  } catch (err) {
    console.error("Chyba pri povoľovaní Web Push notifikácií:", err);
    return { ok: false, reason: "exception" };
  }
}

export function getNotificationPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}
