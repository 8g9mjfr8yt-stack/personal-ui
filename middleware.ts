import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Obnovuje Supabase session na každom requeste a chráni stránky —
// neprihlásený používateľ je presmerovaný na /login.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth");

  // /privacy musí byť verejne dostupná bez prihlásenia — vyžaduje to
  // Google OAuth consent screen (Privacy Policy URL musí byť čitateľná
  // aj bez session), pozri PROJECT.md časť 24/25.
  const isPublicRoute = isAuthRoute || request.nextUrl.pathname.startsWith("/privacy");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/today";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // 2026-09-24 — /api/calendar-webhook (Google Calendar Push
    // Notifications) a /api/cron/* (Vercel Cron) volá server-to-server,
    // bez prihlásenej session — bez tejto výnimky ich toto middleware
    // presmerovávalo na /login (307), presne ako predtým /api/push/send
    // (pozri git históriu "vynat /api/push/send z auth middleware").
    // Oba majú VLASTNÚ autentifikáciu (CRON_SECRET / GOOGLE_CALENDAR_WEBHOOK_TOKEN
    // v hlavičke), takže to nie je diera v zabezpečení.
    "/((?!api/push/send|api/calendar-webhook|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
