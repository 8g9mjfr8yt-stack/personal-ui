import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `inbox` — rovnaký vzor ako lib/supabase/tasks.ts.
// getInbox zámerne zobrazuje iba status='pending' — spracované položky by
// tu už len robili vizuálny chaos (PROJECT.md časť 5, "Capture first,
// organize later").

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

export async function getInboxItem(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("inbox")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function createInboxItem(
  supabase: SupabaseClient,
  content: string,
  inputType: string = "text"
) {
  const { data, error } = await supabase
    .from("inbox")
    .insert({ content, input_type: inputType, status: "pending" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Inbox tabuľka nemá vlastný storage_url stĺpec (na rozdiel od
// `inspiration`) — obrázok/súbor sa preto nahrá do toho istého Storage
// bucketu `inspiration` (pod prefixom "inbox/") a cesta k nemu sa uloží
// priamo do `content`, s `input_type = "image"`. Zobrazenie potom ide cez
// getInspirationFileUrl z lib/supabase/inspiration.ts (rovnaký bucket).
export async function uploadInboxFile(supabase: SupabaseClient, file: File) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const path = `inbox/${crypto.randomUUID()}${ext ? "." + ext : ""}`;
  const { error } = await supabase.storage.from("inspiration").upload(path, file);
  if (error) throw error;
  return path;
}

// Označí položku Inboxu ako spracovanú do konkrétneho typu záznamu. Cieľový
// záznam (task/note/...) sa vytvára v lib/gemini/inboxTools.ts pred
// zavolaním tejto funkcie — tu sa iba zapíše, kam bola položka spracovaná.
export async function markInboxProcessed(
  supabase: SupabaseClient,
  id: string,
  processedInto: string,
  processedId: string
) {
  if (!id) throw new Error("process_inbox: chýba 'id'.");
  const { data, error } = await supabase
    .from("inbox")
    .update({
      status: "processed",
      processed_into: processedInto,
      processed_id: processedId,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
