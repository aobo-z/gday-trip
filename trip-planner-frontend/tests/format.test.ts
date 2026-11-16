import { test } from "vitest";
import assert from "node:assert/strict";
import { addDays, cents, dayDiff, daysBetween, frange, fromMin, hm, money, toMin } from "../src/lib/format";
import { plural, unit } from "../src/lib/format";

test("money uses the currency symbol and drops cents where a currency has none", () => {
  assert.equal(money(1234.5, "AUD"), "A$1,234.50");
  assert.equal(money(-20, "AUD"), "−A$20.00");
  assert.equal(money(120000, "JPY"), "¥120,000");
  assert.equal(money(4200, "AUD", { short: true }), "A$4,200");
  assert.equal(money(12, "THB"), "THB 12.00");
});

test("cents accepts at most two decimals and rejects anything else", () => {
  assert.equal(cents("12.5"), 1250);
  assert.equal(cents(" 0.01 "), 1);
  assert.equal(cents("1.234"), null);
  assert.equal(cents("-3"), null);
  assert.equal(cents(""), null);
});

test("date helpers work on local calendar days", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(dayDiff("2026-10-24", "2026-10-28"), 4);
  assert.deepEqual(daysBetween("2026-12-30", "2027-01-01"), ["2026-12-30", "2026-12-31", "2027-01-01"]);
  assert.equal(frange("2026-10-24", "2026-10-28"), "24–28 Oct");
  assert.equal(frange("2026-10-30", "2026-11-02"), "30 Oct – 2 Nov");
});

test("time helpers round-trip and trim backend seconds", () => {
  assert.equal(hm("09:30:00"), "09:30");
  assert.equal(toMin("13:45"), 825);
  assert.equal(fromMin(825), "13:45");
});

test("plural picks the word for one and for many", () => {
  assert.equal(plural(1, "day"), "1 day");
  assert.equal(plural(0, "place"), "0 places");
  assert.equal(plural(3, "traveller"), "3 travellers");
  assert.equal(unit(1, "day"), "day");
});

test("countdown says how far off a trip is and ranks under way, soon, then passed", async () => {
  const { countdown, activeTrips } = await import("../src/lib/domain");
  const now = "2026-10-25";
  assert.deepEqual(countdown({ startDate: "2026-11-14", endDate: "2026-11-19" }, now), { rank: 1, days: 20, label: "In 20 days" });
  assert.equal(countdown({ startDate: "2026-10-26", endDate: "2026-10-28" }, now).label, "Tomorrow");
  assert.equal(countdown({ startDate: "2026-10-25", endDate: "2026-10-28" }, now).label, "Starts today");
  assert.equal(countdown({ startDate: "2026-10-23", endDate: "2026-10-28" }, now).label, "Day 3");
  assert.equal(countdown({ startDate: "2026-09-01", endDate: "2026-09-05" }, now).rank, 2);
  const mk = (tripId: number, startDate: string, endDate: string, status = "PLANNING") => ({ tripId, startDate, endDate, status });
  const order = activeTrips([mk(1, "2027-01-01", "2027-01-05"), mk(2, "2026-01-01", "2026-01-02"), mk(3, "2020-01-01", "2030-01-01", "ONGOING"), mk(4, "2026-12-01", "2026-12-03"), mk(5, "2020-01-01", "2020-01-02", "ARCHIVED")], now).map((t) => t.tripId);
  assert.deepEqual(order, [3, 4, 1, 2]);
});

test("initials never split an emoji or accented letter", async () => {
  const { initials } = await import("../src/lib/format");
  assert.equal(initials("Mia"), "MI");
  assert.equal(initials("🦊 Fox"), "🦊F");
  assert.equal(initials("Ólafur"), "ÓL");
  assert.equal(initials("  Sam"), "SA");
  assert.equal(initials(""), "?");
});
