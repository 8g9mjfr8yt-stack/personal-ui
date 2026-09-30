import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshCalendarProjection } from "@/lib/server/calendarProjection";

export const maxDuration = 60;

// Fáza 3 prestavby — ručné/záložné spustenie obnovy okna kalendára do
// tabuľky `events` (tieňový režim, pozri lib/server/calendarProjection.ts).
// Chránené CRON_SECRET rovnako ako ostatné /api/cron/* routy.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizované." }, { status: 401 });
  }
  try {
    const result = await refreshCalendarProjection(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("calendar-refresh zlyhal:", err);
    return NextResponse.json({ ok: false, error: (err as Error)?.message }, { status: 500 });
  }
}
