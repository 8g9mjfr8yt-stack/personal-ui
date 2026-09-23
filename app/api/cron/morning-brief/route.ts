import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getEventsForDate,
  formatBratislavaTime,
  todayISOInBratislava,
  currentHourInBratislava,
} from "@/lib/server/googleCalendarAdmin";

// Ranný prehľad (Denný agent 2.0, 2026-09-27) — Vercel Cron zavolá túto
// route dvakrát denne (5:15 aj 6:15 UTC, pozri vercel.json) kvôli
// letnému/zimnému času (CEST/CET) v Bratislave; skutočne odošle push iba
// tá invokácia, ktorá padne do 7. hodiny bratislavského času — tá druhá
// sa ticho preskočí (`skipped: true`). Hobby plán Vercelu navyše zaručuje
// spustenie iba niekde v rámci danej hodiny, nie presne na minútu — push
// teda príde niekedy medzi 7:00 a 7:59, nie nutne presne o 7:15.
//
// Obsah: dnešné Google Calendar udalosti (priamo z Google, nie zo zrkadla
// v `tasks` — nech je prehľad správny aj pre udalosti pridané rovno v
// Google Calendari, nielen cez hlasového agenta) + úlohy s due_date =
// dnes, ktoré NIE sú iba zrkadlom takejto udalosti (google_event_id is
// null), nech sa nič nezobrazí dvakrát.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Neautorizované." }, { status: 401 });
  }

  if (currentHourInBratislava() !== 7) {
    return NextResponse.json({ skipped: true, reason: "Mimo 7. hodiny bratislavského času." });
  }

  const todayISO = todayISOInBratislava();

  const events = await getEventsForDate(todayISO).catch((err) => {
    console.error("Ranný prehľad: nepodarilo sa načítať Google Calendar:", err);
    return [] as { summary: string; start: string }[];
  });

  const admin = createAdminClient();
  const { data: tasks, error } = await admin
    .from("tasks")
    .select("title, scheduled_time")
    .eq("due_date", todayISO)
    .is("parent_task_id", null)
    .is("completed_at", null)
    .is("google_event_id", null)
    .order("scheduled_time", { ascending: true, nullsFirst: false });

  if (error) {
    console.error("Ranný prehľad: nepodarilo sa načítať úlohy dňa:", error);
  }

  const lines: string[] = [];
  for (const e of events) {
    const time = formatBratislavaTime(e.start);
    lines.push(time ? `📅 ${time} ${e.summary}` : `📅 ${e.summary}`);
  }
  for (const t of tasks || []) {
    const time = t.scheduled_time ? formatBratislavaTime(t.scheduled_time) : null;
    lines.push(time ? `• ${time} ${t.title}` : `• ${t.title}`);
  }

  const message = lines.length > 0 ? lines.join("\n") : "Dnes nemáš nič naplánované. 🎉";

  let pushResult: unknown = null;
  if (process.env.PUSH_API_KEY) {
    const pushRes = await fetch(new URL("/api/push/send", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.PUSH_API_KEY,
      },
      body: JSON.stringify({ title: "Ranný prehľad", message, url: "/today" }),
    });
    pushResult = await pushRes.json().catch(() => ({ error: "Neplatná odpoveď z /api/push/send." }));
  } else {
    console.error("Ranný prehľad: chýba PUSH_API_KEY.");
  }

  return NextResponse.json({
    date: todayISO,
    eventsCount: events.length,
    tasksCount: (tasks || []).length,
    message,
    push: pushResult,
  });
}
