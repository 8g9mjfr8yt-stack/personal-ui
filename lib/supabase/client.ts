import { createBrowserClient } from "@supabase/ssr";

// Supabase klient pre Client Components (beží v prehliadači).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
