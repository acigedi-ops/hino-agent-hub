import { test } from "node:test";
import assert from "node:assert/strict";
import { monthFromName, parseStatement, periodFor, periodLabel, periodMonths, stepPeriod, validPeriod, weekStart } from "./commission-parse";

const HEAD = ["Company", "Client Name", "Policy #", "Eff Date", "Trans Date", "Line", "Transaction Type", "Premium", "Agent Commission (7%)"];
// A made-up statement in the owner's layout. No real clients.
const SHEET: string[][] = [
  ["NEW BUSINESS"], HEAD,
  ["Sample Carrier", "Sample Person One", "P100", "4/2/2026", "", "", "New Business", "1000", "70"],
  ["Sample Carrier", "Sample Person Two", "P101", "7/24/2025", "4/24/2026", "Auto (Personal)", "New Business", "500.50", "35.04"],
  ["", "", "", "", "", "", "", "TOTAL", "105.04"],
  [],
  ["RENEWALS"], HEAD,
  ["Sample Carrier", "Sample Person Three", "P102", "4/10/2026", "", "", "Renewal", "2000", "140"],
  ["", "", "", "", "", "", "", "TOTAL", "140"],
  ["ENDORSEMENTS, CANCELLATIONS & ADJUSTMENTS"], HEAD,
  ["Sample Carrier", "Sample Person Four", "P103", "4/12/2026", "", "", "Cancellation", "-300", "-21"],
  ["Sample Carrier", "Sample Person Five", "P104", "4/13/2026", "", "", "Cancellation", "0", "0"],
  ["", "", "", "", "", "", "", "TOTAL", "-21"],
  ["DEDUCTIONS"],
  ["Item", "Description", "", "", "Month", "", "", "", "Amount ($)"],
  ["EZLynx", "Monthly EZLynx fee", "", "", "April 2026", "", "", "", "-100"],
  ["", "", "", "", "", "", "", "TOTAL", "-100"],
  [],
  ["GRAND TOTAL — NET AGENT COMMISSION (AFTER ADJUSTMENTS & DEDUCTIONS)", "", "", "", "", "", "", "", "124.04"],
  [],
  ["CANCELLATIONS & MVRs TO REVIEW — PLEASE CHECK"],
  HEAD,
  ["Sample Carrier", "Review Only Person", "P999", "4/1/2026", "", "", "Cancellation", "-900", "-63"],
  ["Sample Carrier MVR", "Review Only Person", "P998", "2/9/2026", "", "WA", "MVR", "-15"],
];

test("a commission statement is read up to the grand total and the review section is left out", () => {
  const p = parseStatement(SHEET);
  assert.deepEqual(p.problems, []);
  assert.equal(p.lines.length, 6);
  assert.deepEqual(p.sections.map((s) => [s.key, s.count, s.sum, s.fileTotal]), [["new", 2, 105.04, 105.04], ["renewal", 1, 140, 140], ["adjust", 2, -21, -21], ["deduction", 1, -100, -100]]);
  assert.deepEqual([p.net, p.fileNet, p.skippedBelow], [124.04, 124.04, true]);
  assert.ok(!p.lines.some((l) => l.client === "Review Only Person"), "review rows never come through");
  assert.deepEqual(p.lines[1], { section: "new", company: "Sample Carrier", client: "Sample Person Two", policyNumber: "P101", effDate: "2025-07-24", transDate: "2026-04-24", line: "Auto (Personal)", type: "New Business", premium: 500.5, amount: 35.04 });
  assert.deepEqual(p.lines[5], { section: "deduction", company: "EZLynx", client: "Monthly EZLynx fee", policyNumber: "", effDate: "", transDate: "", line: "April 2026", type: "Deduction", premium: null, amount: -100 });
});

test("a statement whose totals do not add up is flagged", () => {
  const bad = SHEET.map((r) => [...r]);
  bad[2][8] = "80";
  const p = parseStatement(bad);
  assert.equal(p.problems.length, 2);
  assert.match(p.problems[0], /New business: the rows add up to 115\.04 but the sheet's TOTAL row says 105\.04/);
  assert.deepEqual(parseStatement([["Hello"], ["a", "b"]]).lines, []);
});

test("statement months and periods", () => {
  assert.equal(monthFromName("Veniamin Apr 2026"), "2026-04");
  assert.equal(monthFromName("Sample_September-2026.xlsx"), "2026-09");
  assert.equal(monthFromName("Problems with someone"), "");
  assert.deepEqual(periodMonths({ view: "quarter", key: "2026-Q2" }), { from: "2026-04", to: "2026-06" });
  assert.deepEqual(periodMonths({ view: "year", key: "2026" }), { from: "2026-01", to: "2026-12" });
  assert.equal(periodMonths({ view: "all", key: "" }), null);
  assert.deepEqual([periodFor("quarter", "2026-05"), periodFor("year", "2026-05"), periodFor("week", "2026-05")], ["2026-Q2", "2026", "2026-04-27"]);
  assert.equal(weekStart(new Date(Date.UTC(2026, 4, 3))), "2026-04-27");
  assert.deepEqual([stepPeriod({ view: "month", key: "2026-01" }, -1), stepPeriod({ view: "quarter", key: "2026-Q4" }, 1), stepPeriod({ view: "week", key: "2026-04-27" }, 1)], ["2025-12", "2027-Q1", "2026-05-04"]);
  assert.equal(periodLabel({ view: "week", key: "2026-04-27" }), "Week of Apr 27 to May 3, 2026");
  assert.ok(validPeriod("month", "2026-04") && !validPeriod("month", "2026-13") && !validPeriod("quarter", "2026-Q5") && validPeriod("all", ""));
});
