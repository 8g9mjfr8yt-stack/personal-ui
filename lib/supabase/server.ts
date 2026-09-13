import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase klient pre Server Components a Route Handlers.
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // volané zo Server Component bez možnosti zápisu cookies —
            // session sa aj tak obnoví cez middleware.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: "", ...options });
          } catch {
            // pozri poznámku vyššie
          }
        },
      },
    }
  );
}
