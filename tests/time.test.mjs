// Testy pre lib/time.ts — spúšťa sa: npm run test:time
// (Node 22.6+ kvôli --experimental-strip-types; žiadne ďalšie balíčky.)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  isISODate,
  zonedDate,
  zonedTime,
  zonedDateTime,
  localToUtc,
  dayBounds,
  spanDays,
  spanOverlapsDay,
  spanDayPosition,
  spanFromGoogle,
  spanToGoogle,
  isValidSpan,
  offsetMs,
} from "../lib/time.ts";

const TZ = "Europe/Bratislava";
const H = 3_600_000;

test("addDays cez koniec mesiaca, roka a priestupný rok", () => {
  assert.equal(addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-10-01", -1), "2026-09-30");
});

test("isISODate odmietne neexistujúci dátum", () => {
  assert.equal(isISODate("2026-02-30"), false);
  assert.equal(isISODate("2026-09-30"), true);
  assert.equal(isISODate("30.9.2026"), false);
});

test("posun pásma: leto +2 h, zima +1 h", () => {
  assert.equal(offsetMs(Date.parse("2026-09-30T12:00:00Z"), TZ), 2 * H);
  assert.equal(offsetMs(Date.parse("2026-12-01T12:00:00Z"), TZ), 1 * H);
});

test("zonedDate: neskorý večer v UTC je už ďalší deň v Bratislave", () => {
  assert.equal(zonedDate("2026-09-30T22:30:00Z", TZ), "2026-10-01");
  assert.equal(zonedTime("2026-09-30T22:30:00Z", TZ), "00:30");
  assert.equal(zonedDateTime("2026-12-01T10:00:00Z", TZ), "2026-12-01T11:00:00");
});

test("localToUtc: bežný letný a zimný čas", () => {
  assert.equal(localToUtc("2026-09-30T14:00:00", TZ), "2026-09-30T12:00:00.000Z");
  assert.equal(localToUtc("2026-12-01T14:00", TZ), "2026-12-01T13:00:00.000Z");
  assert.equal(localToUtc("2026-12-01", TZ), "2026-11-30T23:00:00.000Z");
});

test("localToUtc: hodnota s posunom sa iba normalizuje", () => {
  assert.equal(localToUtc("2026-09-30T14:00:00+02:00", TZ), "2026-09-30T12:00:00.000Z");
  assert.equal(localToUtc("2026-09-30T12:00:00Z", TZ), "2026-09-30T12:00:00.000Z");
});

test("prechod na zimný čas 25. 10. 2026: 02:30 nastane 2×, berie sa prvý výskyt", () => {
  assert.equal(localToUtc("2026-10-25T02:30:00", TZ), "2026-10-25T00:30:00.000Z");
  assert.equal(localToUtc("2026-10-25T03:30:00", TZ), "2026-10-25T02:30:00.000Z");
});

test("prechod na letný čas 28. 3. 2027: 02:30 neexistuje → 03:30 letného času", () => {
  assert.equal(localToUtc("2027-03-28T02:30:00", TZ), "2027-03-28T01:30:00.000Z");
  assert.equal(zonedTime("2027-03-28T01:30:00Z", TZ), "03:30");
});

test("dayBounds: bežný deň 24 h, 25. 10. má 25 h, 28. 3. 2027 má 23 h", () => {
  const len = (d) => {
    const b = dayBounds(d, TZ);
    return (Date.parse(b.end) - Date.parse(b.start)) / H;
  };
  assert.equal(len("2026-09-30"), 24);
  assert.equal(len("2026-10-25"), 25);
  assert.equal(len("2027-03-28"), 23);
  assert.deepEqual(dayBounds("2026-10-25", TZ), {
    start: "2026-10-24T22:00:00.000Z",
    end: "2026-10-25T23:00:00.000Z",
  });
});

test("spanDays: časovaná udalosť cez polnoc patrí do dvoch dní", () => {
  const span = { allDay: false, startAt: "2026-09-26T05:45:00Z", endAt: "2026-09-27T16:00:00Z" }; // Moravské Lieskové
  assert.deepEqual(spanDays(span, TZ), ["2026-09-26", "2026-09-27"]);
  assert.deepEqual(spanDayPosition(span, "2026-09-27", TZ), { index: 2, total: 2 });
});

test("spanDays: udalosť končiaca presne o polnoci patrí iba do prvého dňa", () => {
  const span = { allDay: false, startAt: localToUtc("2026-10-02T20:00", TZ), endAt: localToUtc("2026-10-03T00:00", TZ) };
  assert.deepEqual(spanDays(span, TZ), ["2026-10-02"]);
  assert.equal(spanOverlapsDay(span, "2026-10-03", TZ), false);
});

test("spanDays: viacdňová celodenná udalosť (koniec vrátane)", () => {
  const span = { allDay: true, startDate: "2026-10-05", endDate: "2026-10-07" };
  assert.deepEqual(spanDays(span, TZ), ["2026-10-05", "2026-10-06", "2026-10-07"]);
  assert.equal(spanOverlapsDay(span, "2026-10-08", TZ), false);
});

test("spanDays: udalosť cez prechod času (24.–26. 10.)", () => {
  const span = { allDay: false, startAt: localToUtc("2026-10-24T18:00", TZ), endAt: localToUtc("2026-10-26T10:00", TZ) };
  assert.deepEqual(spanDays(span, TZ), ["2026-10-24", "2026-10-25", "2026-10-26"]);
  assert.equal(spanOverlapsDay(span, "2026-10-25", TZ), true);
});

test("spanOverlapsDay zhodné so spanDays pre udalosť v jednom dni", () => {
  const span = { allDay: false, startAt: localToUtc("2026-09-30T23:30", TZ), endAt: localToUtc("2026-10-01T00:30", TZ) };
  assert.deepEqual(spanDays(span, TZ), ["2026-09-30", "2026-10-01"]);
  assert.equal(spanOverlapsDay(span, "2026-09-30", TZ), true);
  assert.equal(spanOverlapsDay(span, "2026-10-01", TZ), true);
});

test("neplatný úsek (koniec pred začiatkom) sa nezobrazí nikde", () => {
  const bad = { allDay: false, startAt: "2026-10-16T06:56:00Z", endAt: "2026-09-18T06:56:00Z" }; // „Martine termíny“
  assert.equal(isValidSpan(bad), false);
  assert.deepEqual(spanDays(bad, TZ), []);
});

test("Google: celodenná udalosť má exkluzívny koniec", () => {
  const one = spanFromGoogle({ date: "2026-09-24" }, { date: "2026-09-25" }); // Umyť kuchyňu
  assert.deepEqual(one, { allDay: true, startDate: "2026-09-24", endDate: "2026-09-24" });
  const three = spanFromGoogle({ date: "2026-10-05" }, { date: "2026-10-08" });
  assert.deepEqual(spanDays(three, TZ), ["2026-10-05", "2026-10-06", "2026-10-07"]);
  assert.deepEqual(spanToGoogle(three, TZ), { start: { date: "2026-10-05" }, end: { date: "2026-10-08" } });
});

test("Google: časovaná udalosť s posunom sa prevedie na UTC", () => {
  const s = spanFromGoogle(
    { dateTime: "2026-09-26T07:45:00+02:00", timeZone: "Europe/Prague" },
    { dateTime: "2026-09-27T18:00:00+02:00", timeZone: "Europe/Prague" }
  );
  assert.deepEqual(s, { allDay: false, startAt: "2026-09-26T05:45:00.000Z", endAt: "2026-09-27T16:00:00.000Z" });
});

test("výsledok nezávisí od pásma servera (TZ procesu)", () => {
  // Proces beží v pásme VM; výsledky vyššie sú pevné UTC hodnoty, takže
  // ak by funkcie závisli od lokálneho pásma, testy by v inom pásme padli.
  assert.equal(zonedDate("2026-10-25T23:30:00Z", TZ), "2026-10-26");
});
