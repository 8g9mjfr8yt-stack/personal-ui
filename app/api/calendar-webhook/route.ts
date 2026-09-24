import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runIncrementalSync } from "@/lib/server/googleCalendarSync";

export const maxDuration = 60;

// Google Calendar Push Notifications — pozri lib/server/googleCalendarSync.ts
// pre celý kontext. Google sem POSTuje vždy, keď sa v primárnom kalendári
// niečo zmení (bez dát o samotnej udalosti, iba "niečo sa zmenilo, over
// si to"), autentifikované vlastným zdieľaným tokenom v hlavičke
// (GOOGLE_CALENDAR_WEBHOOK_TOKEN), nie OAuth.
//
// Musí odpovedať rýchlo a vždy 2xx (aj pri chybe autentifikácie iba
// logujeme a vraciame 200/401 podľa potreby) — Google pri opakovaných
// zlyhaniach kanál časom prestane posielať notifikácie úplne.
export async function POST(request: Request) {
  const token = request.headers.get("x-goog-channel-token");
  if (!process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN || token !== process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN) {
    return NextResponse.json({ error: "Neautorizované." }, { status: 401 });
  }

  const resourceState = request.headers.get("x-goog-resource-state");
  // "sync" = počiatočné potvrdenie hneď po vytvorení kanála, žiadna
  // skutočná zmena — iba potvrdíme príjem.
  if (resourceState === "sync") {
    return NextResponse.json({ ok: true, resourceState });
  }

  try {
    const admin = createAdminClient();
    const result = await runIncrementalSync(admin);
    return NextResponse.json({ ok: true, resourceState, ...result });
  } catch (err) {
    console.error("calendar-webhook: synchronizácia zlyhala:", err);
    // Aj tak 200 — Google by inak kanál po opakovaných chybách zrušil;
    // ďalšia notifikácia alebo denný cron to skúsi znova.
    return NextResponse.json({ ok: false, error: (err as Error)?.message }, { status: 200 });
  }
}
