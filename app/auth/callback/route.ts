import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Spracuje magic-link callback od Supabase Auth a vymení kód za session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/today";

  if (code) {
    const supabase = createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
