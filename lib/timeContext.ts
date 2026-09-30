// Aktuálny dátum a čas pre hlasového agenta (NAVRH-PRESTAVBY.md, krok 1a,
// 2026-09-30). Gemini Live model sám od seba nevie, aký je dnes deň — bez
// tohto kontextu si "zajtra" alebo "v piatok" iba domýšľal.
//
// Časové pásmo je konfigurácia (env APP_TIME_ZONE na serveri), nie skrytý
// predpoklad v kóde. Tento súbor je izomorfný — žiadne process.env, pásmo
// sa vždy odovzdáva ako parameter, takže ho vie použiť server aj prehliadač.

export const DEFAULT_TIME_ZONE = "Europe/Bratislava";

export type NowInfo = {
  // Miestny čas v zadanom pásme, formát pre nástroje: "2026-09-30T14:05:00"
  local: string;
  // Ľudsky čitateľne po slovensky, napr. "streda 30. 9. 2026, 14:05"
  human: string;
  timeZone: string;
  // Napr. "UTC+2"
  utcOffset: string;
};

export function nowInfo(timeZone: string = DEFAULT_TIME_ZONE, d: Date = new Date()): NowInfo {
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(" ", "T");

  const weekday = new Intl.DateTimeFormat("sk-SK", { timeZone, weekday: "long" }).format(d);
  const [datePart, timePart] = local.split("T");
  const [y, m, day] = datePart.split("-").map(Number);
  const human = `${weekday} ${day}. ${m}. ${y}, ${timePart.slice(0, 5)}`;

  const offsetRaw =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value || "GMT";
  const utcOffset = offsetRaw === "GMT" ? "UTC+0" : offsetRaw.replace("GMT", "UTC");

  return { local, human, timeZone, utcOffset };
}

// Blok systémovej inštrukcie s aktuálnym časom. Server ho vloží do
// ephemeral tokenu a ten istý text pošle prehliadaču, aby klientská
// config bola zhodná so serverovou (pozri PROJECT.md časť 23, bug 4.4).
export function buildTimeContextInstruction(timeZone: string = DEFAULT_TIME_ZONE): string {
  const n = nowInfo(timeZone);
  return [
    `AKTUÁLNY ČAS: Teraz je ${n.human}, časové pásmo ${n.timeZone} (${n.utcOffset}). Presný miestny čas: ${n.local}.`,
    `- Relatívne výrazy (dnes, zajtra, pozajtra, v piatok, budúci týždeň, o hodinu, večer) počítaj od tohto okamihu.`,
    `- Každá odpoveď nástroja obsahuje pole "now" s aktuálnym miestnym časom — ak je novšie ako čas vyššie, riaď sa ním (rozhovor môže trvať dlho).`,
    `- Dátumy pre nástroje zadávaj ako YYYY-MM-DD, časy ako miestny čas bez posunu, napr. ${n.local.slice(0, 10)}T10:00:00.`,
  ].join("\n");
}
