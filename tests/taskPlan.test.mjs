// Testy pre lib/model/taskPlan.ts — npm run test:time
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planMode, validatePlan, plannedDays, rangeIncludes, isOverdue, isMissed, poolSection, planToDay,
} from "../lib/model/taskPlan.ts";

const TZ = "Europe/Bratislava";
const NOW = new Date("2026-09-30T12:00:00Z"); // streda 30. 9. 14:00 miestneho času

test("režim plánu sa odvodí z polí", () => {
  assert.equal(planMode({}), "anytime");
  assert.equal(planMode({ plan_start_date: "2026-10-02" }), "day");
  assert.equal(planMode({ plan_start_date: "2026-10-02", plan_end_date: "2026-10-02" }), "day");
  assert.equal(planMode({ plan_start_date: "2026-10-02", plan_end_date: "2026-10-04" }), "range");
  assert.equal(planMode({ plan_start_at: "2026-10-02T08:00:00Z", plan_end_at: "2026-10-02T09:00:00Z" }), "block");
});

test("validácia plánu zodpovedá DB kontrolám 4.2", () => {
  assert.equal(validatePlan({ plan_end_date: "2026-10-02" }), "Rozmedzie nemá prvý deň.");
  assert.match(validatePlan({ plan_start_date: "2026-10-05", plan_end_date: "2026-10-02" }), /pred prvým/);
  assert.match(validatePlan({ plan_start_at: "2026-10-02T08:00:00Z" }), /začiatok aj koniec/);
  assert.match(validatePlan({ plan_start_at: "2026-10-16T06:56:00Z", plan_end_at: "2026-09-18T06:56:00Z" }), /neskôr/);
  assert.match(validatePlan({ plan_start_date: "2026-10-02", plan_start_at: "2026-10-02T08:00:00Z", plan_end_at: "2026-10-02T09:00:00Z" }), /naraz/);
  assert.match(validatePlan({ due_time: "12:00" }), /bez dátumu/);
  assert.equal(validatePlan({ plan_start_date: "2026-10-02", due_date: "2026-10-03", due_time: "12:00" }), null);
});

test("naplánované dni: deň a blok áno, rozmedzie nie", () => {
  assert.deepEqual(plannedDays({ plan_start_date: "2026-10-02" }, TZ), ["2026-10-02"]);
  assert.deepEqual(
    plannedDays({ plan_start_at: "2026-10-10T20:00:00Z", plan_end_at: "2026-10-10T23:30:00Z" }, TZ),
    ["2026-10-10", "2026-10-11"]
  );
  assert.deepEqual(plannedDays({ plan_start_date: "2026-10-02", plan_end_date: "2026-10-04" }, TZ), []);
  assert.equal(rangeIncludes({ plan_start_date: "2026-09-28", plan_end_date: "2026-10-04" }, "2026-09-30"), true);
});

test("po termíne: deň, čas termínu, hotová úloha", () => {
  assert.equal(isOverdue({ due_date: "2026-09-29" }, NOW, TZ), true);
  assert.equal(isOverdue({ due_date: "2026-09-30" }, NOW, TZ), false);
  assert.equal(isOverdue({ due_date: "2026-09-30", due_time: "12:00" }, NOW, TZ), true);
  assert.equal(isOverdue({ due_date: "2026-09-30", due_time: "18:00" }, NOW, TZ), false);
  assert.equal(isOverdue({ due_date: "2026-09-29", completed_at: "2026-09-29T10:00:00Z" }, NOW, TZ), false);
});

test("nestihnuté: minulý deň, skončený blok, skončené rozmedzie", () => {
  assert.equal(isMissed({ plan_start_date: "2026-09-29" }, NOW, TZ), true);
  assert.equal(isMissed({ plan_start_date: "2026-09-30" }, NOW, TZ), false);
  assert.equal(isMissed({ plan_start_at: "2026-09-30T08:00:00Z", plan_end_at: "2026-09-30T09:00:00Z" }, NOW, TZ), true);
  assert.equal(isMissed({ plan_start_date: "2026-09-25", plan_end_date: "2026-09-29" }, NOW, TZ), true);
  assert.equal(isMissed({ plan_start_date: "2026-09-25", plan_end_date: "2026-09-30" }, NOW, TZ), false);
});

test("sekcie poolu", () => {
  assert.equal(poolSection({ plan_start_date: "2026-09-30" }, NOW, TZ), null); // dnes → na Dnes, nie v poole
  assert.equal(poolSection({ plan_start_date: "2026-09-29" }, NOW, TZ), "missed");
  assert.equal(poolSection({ plan_start_date: "2026-09-29", due_date: "2026-09-29" }, NOW, TZ), "overdue");
  assert.equal(poolSection({ due_date: "2026-09-28" }, NOW, TZ), "overdue");
  assert.equal(poolSection({ plan_start_date: "2026-09-28", plan_end_date: "2026-10-04" }, NOW, TZ), "range");
  assert.equal(poolSection({}, NOW, TZ), "anytime");
  assert.equal(poolSection({ completed_at: "2026-09-29T10:00:00Z" }, NOW, TZ), null);
  assert.equal(poolSection({ parent_task_id: "x" }, NOW, TZ), null);
  assert.equal(poolSection({ legacy_mirror: true }, NOW, TZ), null);
});

test("„Na [deň]“: presun zvyšuje počítadlo, prvé naplánovanie nie", () => {
  assert.equal(planToDay({}, "2026-10-01", NOW).postponed_count, 0);
  assert.equal(planToDay({ plan_start_date: "2026-09-29", postponed_count: 2 }, "2026-10-01", NOW).postponed_count, 3);
  assert.equal(planToDay({ plan_start_date: "2026-10-01", postponed_count: 1 }, "2026-10-01", NOW).postponed_count, 1);
  const fromBlock = planToDay({ plan_start_at: "2026-09-30T08:00:00Z", plan_end_at: "2026-09-30T09:00:00Z" }, "2026-10-01", NOW);
  assert.equal(fromBlock.plan_start_at, null);
  assert.equal(fromBlock.plan_start_date, "2026-10-01");
});
