// Server-only prístup ku Google Kalendáru — na rozdiel od lib/googleCalendar.ts
// (ktorý beží v prehliadači cez krátkodobý token z /api/google-calendar-token)
// toto číta GOOGLE_CALENDAR_* premenné priamo. Volať iba z Route Handlers /
// Cron jobov (app/api/**), nikdy z klientského kódu.
//
// 2026-09-27 — pridané pre ranný prehľad (app/api/cron/morning-brief).

const TIME_ZONE = "Europe/Bratislava";

async function getAccessToken(): Promise<string> {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Calendar nie je nastavený (chýbajú GOOGLE_CALENDAR_* premenné).");
  }

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
    // Pozri poznámku v app/api/google-calendar-token/route.ts — appka je
    // zatiaľ v Google OAuth "Testing" móde, kde refresh_token platí iba
    // ~7 dní, po vypršaní treba znova prejsť OAuth Playground flow.
    throw new Error(
      data?.error === "invalid_grant"
        ? "Google Calendar refresh token vypršal (Testing mód OAuth appky, platnosť ~7 dní) — treba ho znova získať cez OAuth Playground."
        : data?.error_description || "Nepodarilo sa obnoviť Google Calendar token."
    );
  }
  return data.access_token as string;
}

// Vráti udalosti, ktorých MIESTNY (bratislavský) dátum začiatku sa
// zhoduje s `dateISO` (YYYY-MM-DD). Zámerne sťahuje širšie okno v UTC a
// filtruje až podľa skutočného bratislavského dátumu cez Intl — vyhneme
// sa tak ručnému počítaniu CET/CEST posunu (a jeho typickým off-by-one
// chybám, pozri komentáre v app/(app)/calendar/page.tsx).
export async function getEventsForDate(
  dateISO: string
): Promise<{ summary: string; start: string }[]> {
  const accessToken = await getAccessToken();
  const [y, m, d] = dateISO.split("-").map(Number);
  const timeMin = new Date(Date.UTC(y, m - 1, d - 1)).toISOString();
  const timeMax = new Date(Date.UTC(y, m - 1, d + 2)).toISOString();

  const search = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
    timeMin,
    timeMax,
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${search.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || `Google Calendar API vrátilo chybu ${res.status}.`);
  }

  return (data.items || [])
    .filter((e: any) => e.status !== "cancelled")
    .map((e: any) => ({
      summary: (e.summary as string) || "(bez názvu)",
      start: (e.start?.dateTime || e.start?.date) as string,
    }))
    .filter((e: { start: string }) => localDateInBratislava(e.start) === dateISO);
}

function localDateInBratislava(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value; // celodenná — už je to miestny dátum
  return new Date(value).toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
}

// Naformátuje ISO reťazec ako "HH:MM" v bratislavskom čase, alebo null pre
// celodennú hodnotu (kde čas nedáva zmysel).
export function formatBratislavaTime(value: string): string | null {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(value).toLocaleTimeString("sk-SK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

// Dnešný dátum (YYYY-MM-DD) v bratislavskom časovom pásme — nezávisí od
// toho, v akom pásme beží samotný server (Vercel funkcie bežia v UTC).
export function todayISOInBratislava(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: TIME_ZONE });
}

// Aktuálna hodina (0-23) v bratislavskom časovom pásme.
export function currentHourInBratislava(): number {
  return Number(
    new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", hour12: false, timeZone: TIME_ZONE }).format(
      new Date()
    )
  );
}
