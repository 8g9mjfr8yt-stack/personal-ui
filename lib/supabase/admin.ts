import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role Supabase klient — POUŽÍVAŤ IBA v server-side kóde (Route
// Handlers), nikdy v Client Components. Obchádza RLS, preto ho používa
// iba /api/push/send: ten volá n8n server-to-server (žiadna authenticated
// browser session, cez ktorú by inak šiel normálny prístup ako v ostatných
// lib/supabase/*.ts dátových vrstvách).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Chýba NEXT_PUBLIC_SUPABASE_URL alebo SUPABASE_SERVICE_ROLE_KEY v .env.local."
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
