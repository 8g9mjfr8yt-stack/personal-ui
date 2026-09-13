import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `inbox` — rovnaký vzor ako lib/supabase/tasks.ts.
// Zámerne zobrazuje iba status='pending' — spracované položky (AI klasifikácia,
// Fáza 5) sa presunú inde a v Inboxe by už len robili vizuálny chaos.

export async function getInbox(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("inbox")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data;
}

export async function createInboxItem(supabase: SupabaseClient, content: string) {
  const { data, error } = await supabase
    .from("inbox")
    .insert({ content, input_type: "text", status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}
