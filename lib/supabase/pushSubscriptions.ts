import type { SupabaseClient } from "@supabase/supabase-js";

// Dátová vrstva pre tabuľku `push_subscriptions` — Fáza 7.1 (Web Push
// notifikácie, súbežne s ntfy). Klientská strana (tento súbor) iba ukladá
// subscription po prihlásení k odberu v prehliadači (authenticated RLS,
// rovnaký vzor ako ostatné tabuľky v lib/supabase/*.ts). Server-side
// čítanie na odosielanie push správ ide cez lib/supabase/admin.ts
// (service_role), nie odtiaľto — n8n volá /api/push/send bez authenticated
// browser session.

export async function savePushSubscription(
  supabase: SupabaseClient,
  input: { endpoint: string; p256dh: string; auth: string; userAgent?: string | null }
) {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        user_agent: input.userAgent || null,
      },
      { onConflict: "endpoint" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
