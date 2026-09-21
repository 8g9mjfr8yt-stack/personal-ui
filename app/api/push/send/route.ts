import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Server-side endpoint, ktorý n8n workflows volajú vedľa (nie namiesto)
// ntfy — Fáza 7.1, súbežná prevádzka počas overovania (pozri PROJECT.md).
// Chránené vlastným API kľúčom v hlavičke X-Api-Key, rovnaký vzor ako n8n
// webhooky z Fázy 3 ("Daily Agent Tools Auth").
export async function POST(request: Request) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey || apiKey !== process.env.PUSH_API_KEY) {
    return NextResponse.json(
      { error: "Neplatný alebo chýbajúci X-Api-Key." },
      { status: 401 }
    );
  }

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    return NextResponse.json(
      { error: "Web Push nie je nastavený (chýbajú VAPID premenné v .env.local)." },
      { status: 500 }
    );
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  let body: { title?: string; message?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neplatné JSON telo." }, { status: 400 });
  }

  const title = body.title || "Denný agent";
  const message = body.message || "";
  const url = body.url || "/today";

  const admin = createAdminClient();
  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!subscriptions || subscriptions.length === 0) {
    return NextResponse.json({
      sent: 0,
      failed: 0,
      removed: 0,
      note: "Žiadne zaregistrované zariadenie (push_subscriptions je prázdna).",
    });
  }

  const payload = JSON.stringify({ title, message, url });

  let sent = 0;
  let failed = 0;
  let removed = 0;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent += 1;
      } catch (err: unknown) {
        failed += 1;
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription už nie je platná (appka odinštalovaná / notifikácie
          // vypnuté v Nastaveniach) — vymazať, nech sa nekopia neplatné riadky.
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          removed += 1;
        } else {
          console.error("Chyba pri odosielaní push notifikácie:", err);
        }
      }
    })
  );

  return NextResponse.json({ sent, failed, removed });
}
