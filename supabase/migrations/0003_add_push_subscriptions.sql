-- Fáza 7.1 — Web Push notifikácie (súbežne s ntfy, pozri PROJECT.md).
--
-- Tabuľka pre Web Push subscriptions z Personal UI (nainštalovaná PWA na
-- iPhone/Mac). Jeden riadok = jedno prihlásené zariadenie/prehliadač.
-- Jednopoužívateľský systém — žiadny user_id, rovnaký vzor ako ostatné
-- tabuľky (RLS policy "authenticated full access").
--
-- `endpoint` je unique, aby opätovná registrácia (rovnaké zariadenie,
-- nový service worker) neduplikovala riadok — použije sa upsert podľa
-- tohto stĺpca (pozri lib/supabase/pushSubscriptions.ts).

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table push_subscriptions is
  'Web Push subscriptions z Personal UI (PWA). Server-side /api/push/send ich číta cez service_role klienta (nie je to authenticated browser session), pozri PROJECT.md Fáza 7.1.';
