import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureWatchChannel, runIncrementalSync } from "@/lib/server/googleCalendarSync";

export const maxDuration = 60;

// Denný Vercel Cron (pozri vercel.json) — dve úlohy:
// 1. Obnoví Google Calendar "watch" kanál, ak mu čoskoro (do 48h) vyprší
//    platnosť, alebo ešte vôbec neexistuje (prvé spustenie po nasadení).
// 2. Záložná sieť: spraví aj bežný sync prechod, pre prípad, že by nejaká
//    webhook notifikácia cestou zapadla (Google negarantuje 100% doručenie).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizované." }, { status: 401 });
  }

  const admin = createAdminClient();

  let watch: { renewed: boolean; expiration: string | null } | null = null;
  try {
    watch = await ensureWatchChannel(admin);
  } catch (err) {
    console.error("renew-calendar-watch: obnova kanála zlyhala:", err);
  }

  let sync: Awaited<ReturnType<typeof runIncrementalSync>> | null = null;
  try {
    sync = await runIncrementalSync(admin);
  } catch (err) {
    console.error("renew-calendar-watch: sync zlyhal:", err);
  }

  return NextResponse.json({ watch, sync });
}
