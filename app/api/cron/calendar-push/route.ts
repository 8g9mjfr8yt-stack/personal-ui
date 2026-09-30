import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushPendingBlocks } from "@/lib/server/taskCalendarPush";

export const maxDuration = 60;

// Fáza 5 — záložné spracovanie fronty zápisov do Google (n8n každých
// 5–15 min, CRON_SECRET). Rieši prípady, keď prehliadač nestihol poslať
// požiadavku (výpadok siete, zatvorená appka).
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizované." }, { status: 401 });
  }
  try {
    const result = await pushPendingBlocks(createAdminClient());
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("calendar-push zlyhal:", err);
    return NextResponse.json({ ok: false, error: (err as Error)?.message }, { status: 500 });
  }
}
