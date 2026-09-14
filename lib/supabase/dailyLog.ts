import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `daily_log` — rovnaký vzor ako lib/supabase/tasks.ts.
// `log_date` je unikátne (jeden riadok na deň) — createDailyLog je preto
// upsert: zápis počas dňa dopĺňa/aktualizuje dnešný riadok namiesto
// vytvárania duplicít.

export async function getDailyLog(
  supabase: SupabaseClient,
  input?: { date?: string; limit?: number }
) {
  let q = supabase.from("daily_log").select("*");
  if (input?.date) {
    q = q.eq("log_date", input.date);
  }
  const { data, error } = await q
    .order("log_date", { ascending: false })
    .limit(input?.limit || 14);
  if (error) throw error;
  return data;
}

export async function upsertDailyLog(
  supabase: SupabaseClient,
  input: { log_date?: string; summary?: string | null; notes?: string | null }
) {
  const logDate = input.log_date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("daily_log")
    .upsert(
      {
        log_date: logDate,
        summary: input.summary ?? undefined,
        notes: input.notes ?? undefined,
      },
      { onConflict: "log_date" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
