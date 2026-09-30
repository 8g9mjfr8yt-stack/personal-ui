import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushPendingBlocks } from "@/lib/server/taskCalendarPush";

export const maxDuration = 60;

// Fáza 5 — prehliadač sem pošle požiadavku hneď po uložení úlohy (na
// pozadí, nečaká sa na ňu). Iba pre prihláseného používateľa.
export async function POST(request: Request) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Neprihlásený." }, { status: 401 });

  let body: { taskIds?: string[]; deleteEventIds?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // prázdne telo = spracovať celú frontu
  }
  try {
    const result = await pushPendingBlocks(createAdminClient(), {
      taskIds: Array.isArray(body.taskIds) ? body.taskIds.slice(0, 50) : undefined,
      deleteEventIds: Array.isArray(body.deleteEventIds) ? body.deleteEventIds.slice(0, 50) : undefined,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("push-pending zlyhal:", err);
    return NextResponse.json({ ok: false, error: (err as Error)?.message }, { status: 500 });
  }
}
