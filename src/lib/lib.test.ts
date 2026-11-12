import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { normalizePhone, normalizeEmail, stageFromPolicies, parseDate, daysUntil } from "./contacts";
import { sniffMatches } from "./documents";
import { sortClients, type ClientRow } from "./clients";
import { fillIntakePdf, usDate } from "./intake-pdf";
import { emptyIntake, parseIntake, isValidVin, TEXT_FIELDS, CHOICES, DRIVER_FIELDS, VEHICLE_FIELDS, VIOLATION_FIELDS, ROWS } from "./intake";

test("phone numbers match regardless of formatting", () => {
  assert.equal(normalizePhone("(206) 555-0100"), "2065550100");
  assert.equal(normalizePhone("+1 206 555 0100"), "2065550100");
  assert.equal(normalizePhone("12"), null);
  assert.equal(normalizeEmail(" A@B.com "), "a@b.com");
  assert.equal(normalizeEmail("nope"), null);
});

test("client status follows policies", () => {
  assert.equal(stageFromPolicies("QUOTED", 1, 1), "CLIENT");
  assert.equal(stageFromPolicies("CLIENT", 0, 2), "FORMER");
  assert.equal(stageFromPolicies("FORMER", 1, 3), "CLIENT");
  assert.equal(stageFromPolicies("APPLICANT", 0, 0), "APPLICANT");
});

test("dates", () => {
  assert.equal(parseDate("2026-13-40"), null);
  assert.equal(parseDate("2026-12-01")?.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(daysUntil(new Date("2026-12-11T00:00:00Z"), new Date(2026, 11, 1)), 10);
});

test("VIN validation", () => {
  assert.equal(isValidVin("1HGCM82633A004352"), true);
  assert.equal(isValidVin("1HGCM82633A00435"), false);
  assert.equal(isValidVin("1HGCM82633A00435O"), false);
});

test("stored intake tolerates partial data", () => {
  const d = parseIntake({ text: { full_name: "Test Person" }, drivers: [{ name: "A" }] });
  assert.equal(d.text.full_name, "Test Person");
  assert.equal(d.drivers.length, ROWS);
  assert.equal(d.drivers[0].name, "A");
  assert.equal(parseIntake(null).text.full_name, "");
});

test("every form field exists in the PDF template and fills", async () => {
  const tpl = readFileSync("public/forms/rhino-intake-template.pdf");
  const names = new Set((await PDFDocument.load(tpl)).getForm().getFields().map((f) => f.getName()));
  const expected: string[] = [...TEXT_FIELDS, ...Object.values(CHOICES).flatMap((o) => Object.values(o))];
  for (let i = 1; i <= ROWS; i++) {
    expected.push(...DRIVER_FIELDS.map((k) => `d${i}_${k}`), `d${i}_ddc`, `d${i}_gs`);
    expected.push(...VEHICLE_FIELDS.map((k) => `v${i}_${k}`), `v${i}_liab_yes`, `v${i}_liab_no`);
    expected.push(...VIOLATION_FIELDS.map((k) => `x${i}_${k}`));
  }
  for (const n of expected) assert.ok(names.has(n), `template is missing field ${n}`);
  assert.equal(names.size, expected.length);

  const d = emptyIntake();
  d.text.full_name = "Sample Applicant";
  d.choice.type = "Commercial";
  d.text.dob = "1990-02-03";
  d.drivers[1].gs = true;
  d.vehicles[0].vin = "1HGCM82633A004352";
  d.vehicles[0].liability_only = "No";
  const out = await PDFDocument.load(await fillIntakePdf(tpl, d));
  const f = out.getForm();
  assert.equal(f.getTextField("full_name").getText(), "Sample Applicant");
  assert.equal(f.getTextField("dob").getText(), "02/03/1990");
  assert.equal(usDate("11/12/2026"), "11/12/2026");
  assert.equal(f.getCheckBox("type_commercial").isChecked(), true);
  assert.equal(f.getCheckBox("type_personal").isChecked(), false);
  assert.equal(f.getCheckBox("d2_gs").isChecked(), true);
  assert.equal(f.getCheckBox("v1_liab_no").isChecked(), true);
  assert.equal(f.getTextField("v1_vin").getText(), "1HGCM82633A004352");
});

test("clients sort by name, premium and dates with missing dates last", () => {
  const row = (name: string, premium: number, renewal: string | null): ClientRow => ({
    id: name, name, type: "PERSONAL", stage: "CLIENT", phone: "", agent: "A", carriers: "", premium, policies: 1,
    effective: null, renewal: renewal ? new Date(renewal) : null,
  });
  const rows = () => [row("beta", 300, "2027-03-01"), row("Alpha", 100, null), row("Gamma", 200, "2026-12-01")];
  const names = (r: ClientRow[]) => r.map((x) => x.name).join(",");
  assert.equal(names(sortClients(rows(), "name", "asc")), "Alpha,beta,Gamma");
  assert.equal(names(sortClients(rows(), "premium", "desc")), "beta,Gamma,Alpha");
  assert.equal(names(sortClients(rows(), "renewal", "asc")), "Gamma,beta,Alpha");
  assert.equal(names(sortClients(rows(), "renewal", "desc")), "beta,Gamma,Alpha");
});

test("uploads are checked against their real file type", () => {
  const bytes = (t: string) => new TextEncoder().encode(t);
  assert.equal(sniffMatches("application/pdf", bytes("%PDF-1.7 ...")), true);
  assert.equal(sniffMatches("application/pdf", bytes("<html>")), false);
  assert.equal(sniffMatches("image/png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d])), true);
  assert.equal(sniffMatches("image/jpeg", bytes("%PDF-")), false);
  assert.equal(sniffMatches("text/html", bytes("<html>")), false);
});

test("EZLynx report rows are read from CSV", async () => {
  const { parseReport, nameKey, parseUsDate } = await import("./ezlynx");
  assert.equal(nameKey("SMITH, John A."), nameKey("john smith"));
  assert.equal(parseUsDate("3/9/2026")?.toISOString().slice(0, 10), "2026-03-09");
  assert.equal(parseUsDate("13/40/2026"), null);
  const csv = [
    "New Business Report,,,,,,",
    'Insured Name,Policy #,Carrier,Written Premium,Eff Date,Term,Producer',
    '"Doe, Jane",PA-100,Progressive,"$1,840.50",11/01/2026,6 months,Sam Agent',
    "No Policy,,Geico,500,11/02/2026,12,Sam Agent",
  ].join("\r\n");
  const r = parseReport(csv);
  assert.deepEqual(r.missing, []);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].premium, 1840.5);
  assert.equal(r.rows[0].expiration?.toISOString().slice(0, 10), "2027-05-01");
  assert.equal(r.rows[0].expirationAssumed, true);
  assert.deepEqual(r.rows[1].problems, ["no policy number"]);
  assert.deepEqual(parseReport("a,b\n1,2").missing, ["Policy number"]);
});

test("referral codes are read however they are typed", async () => {
  const { cleanCode, newReferralCode, showCode } = await import("./referrals");
  const code = newReferralCode();
  assert.match(code, /^[A-HJKMNP-Z2-9]{7}$/);
  assert.equal(cleanCode(showCode(code).toLowerCase()), code);
  assert.equal(cleanCode(` rh ${code} `), code);
  assert.equal(cleanCode(code), code);
  assert.equal(cleanCode("RHABCDE"), "RHABCDE");
  assert.equal(cleanCode("abc"), null);
});
