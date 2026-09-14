import { NextResponse } from "next/server";

// Táto route beží iba na serveri — GOOGLE_CALENDAR_CLIENT_SECRET a
// GOOGLE_CALENDAR_REFRESH_TOKEN sa sem nikdy neposielajú do prehliadača.
// Prehliadač dostane iba krátkodobo platný (typicky ~1 hodinu) access_token,
// ktorým potom volá Google Calendar REST API priamo (fast path, rovnaký
// vzor ako ephemeral token pre Gemini Live v /api/gemini-token — pozri
// PROJECT.md časť 23).
export async function POST() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return NextResponse.json(
      { error: "Google Calendar nie je nastavený (chýba premenná v .env.local)." },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Poznámka (pozri PROJECT.md časť 23): appka je zatiaľ v Google OAuth
      // "Testing" móde, kde refresh_token platí iba ~7 dní. Po vypršaní
      // Google vráti "invalid_grant" — treba znova prejsť OAuth Playground
      // flow a nahradiť GOOGLE_CALENDAR_REFRESH_TOKEN v .env.local.
      console.error("Chyba pri obnove Google Calendar tokenu:", data);
      return NextResponse.json(
        {
          error:
            data?.error === "invalid_grant"
              ? "Prístup ku Google Calendaru vypršal (Testing mód, refresh token platí ~7 dní) — treba ho znova získať cez OAuth Playground."
              : data?.error_description || "Nepodarilo sa obnoviť Google Calendar token.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch (err) {
    console.error("Chyba pri volaní Google OAuth token endpointu:", err);
    return NextResponse.json(
      { error: "Nepodarilo sa spojiť s Google OAuth serverom." },
      { status: 500 }
    );
  }
}
