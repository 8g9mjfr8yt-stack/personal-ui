import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `agent_memory` — perzistentná pamäť agenta
// naprieč rozhovormi a session-ami (Fáza 4.5, PROJECT.md časť 23,
// "Tri vrstvy pamäte" / "Hypotézy o používateľovi"). Ukladajú sa iba
// trvalé fakty/preferencie/vzorce/hypotézy/pravidlá — nikdy celé rozhovory.

export type MemoryCategory =
  | "fact"
  | "preference"
  | "pattern"
  | "hypothesis"
  | "rule";
export type MemoryStatus = "active" | "superseded" | "rejected";

export async function getMemory(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return data;
}

// Pre transparentnosť pamäte (PROJECT.md časť 23, "Transparentnosť
// pamäte") — na rozdiel od getMemory() vyššie (ktorú používa hlasový
// agent a zámerne vidí iba active) toto vráti VŠETKY záznamy vrátane
// superseded/rejected, aby používateľ videl aj to, čo agent nahradil
// alebo zamietol, nie iba aktuálne platné fakty.
export async function getAllMemory(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("agent_memory")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data;
}

export async function createMemory(
  supabase: SupabaseClient,
  input: {
    content: string;
    category?: MemoryCategory | null;
    evidence?: string | null;
  }
) {
  const { data, error } = await supabase
    .from("agent_memory")
    .insert({
      content: input.content,
      category: input.category || "fact",
      evidence: input.evidence || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateMemory(
  supabase: SupabaseClient,
  input: { id: string } & Partial<{
    content: string;
    category: MemoryCategory;
    status: MemoryStatus;
    evidence: string | null;
  }>
) {
  const { id, ...fields } = input;
  if (!id) throw new Error("update_memory: chýba 'id'.");
  // Zámerne bez fallbackov — čiastočná aktualizácia, rovnaký vzor ako
  // update_task v lib/supabase/tasks.ts. `updated_at` nastaví DB trigger.
  const { data, error } = await supabase
    .from("agent_memory")
    .update(fields)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function forgetMemory(supabase: SupabaseClient, id: string) {
  if (!id) throw new Error("forget_memory: chýba 'id'.");
  const { data, error } = await supabase
    .from("agent_memory")
    .delete()
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
