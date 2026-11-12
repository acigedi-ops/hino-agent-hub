/**
 * Reads a new business report (from EZLynx or straight from a carrier such as National General) into policy rows.
 * Column names vary between reports, so each field accepts several headings.
 */
export type ReportRow = {
  line: number;
  name: string;
  phone: string;
  email: string;
  carrier: string;
  policyNumber: string;
  lob: string;
  premium: number | null;
  effective: Date | null;
  expiration: Date | null;
  /** True when the report had no expiration date and one was worked out from the term. */
  expirationAssumed: boolean;
  agent: string;
  problems: string[];
};

const HEADINGS = {
  name: ["applicant", "applicant name", "insured", "insured name", "named insured", "customer", "customer name", "client", "client name", "name", "account name", "full name"],
  first: ["first name", "applicant first name", "insured first name"],
  last: ["last name", "applicant last name", "insured last name"],
  policyNumber: ["policy number", "policy", "policy no", "policy num", "policy id"],
  carrier: ["carrier", "carrier name", "company", "writing company", "insurance company", "insurer"],
  premium: ["premium", "written premium", "total premium", "annual premium", "annualized premium", "policy premium", "premium fees", "premium and fees"],
  effective: ["effective date", "eff date", "effective", "policy effective date", "policy eff date"],
  expiration: ["expiration date", "exp date", "expiration", "policy expiration date", "policy exp date", "expires"],
  term: ["term", "policy term", "term months"],
  lob: ["line of business", "lob", "policy type", "line", "product", "coverage type"],
  agent: ["producer", "producer name", "agent", "agent name", "assigned agent", "assigned to"],
  phone: ["phone", "phone number", "home phone", "cell phone", "mobile phone", "primary phone"],
  email: ["email", "email address", "primary email"],
} as const;
type Field = keyof typeof HEADINGS;

export const FIELD_LABELS: Record<Field, string> = {
  name: "Client name", first: "First name", last: "Last name", policyNumber: "Policy number", carrier: "Carrier",
  premium: "Premium", effective: "Effective date", expiration: "Expiration date", term: "Term", lob: "Line of business",
  agent: "Agent", phone: "Phone", email: "Email",
};

/** Splits CSV text into rows of cells. Handles quoted cells, doubled quotes and line breaks inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && t[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** "SMITH, John A." and "john smith" give the same key, so names match however the report writes them. */
export function nameKey(name: string): string {
  const n = name.includes(",") ? name.split(",").reverse().join(" ") : name;
  return n.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length > 1).sort().join(" ");
}

/** Reads 3/9/2026, 03-09-26 or 2026-03-09 as a UTC date. */
export function parseUsDate(v: string): Date | null {
  const s = v.trim().split(/[ T]/)[0];
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/.exec(s))) [m, d, y] = [+r[1], +r[2], r[3].length === 2 ? 2000 + +r[3] : +r[3]];
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt : null;
}

export function parseMoney(v: string): number | null {
  const s = v.replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = /^\(.*\)$/.test(s) ? -Number(s.slice(1, -1)) : Number(s);
  return Number.isFinite(n) ? n : null;
}

const addMonths = (d: Date, months: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));

export type ParsedReport = { found: string[]; missing: string[]; rows: ReportRow[] };
/** Filled in by the person uploading when the report itself does not say. */
export type ReportOptions = { carrier?: string; termMonths?: number };

/** Carrier reports use short product codes. */
const PRODUCTS: Record<string, string> = { ppa: "Personal auto", cv: "Commercial auto", ho: "Home", rv: "RV", mc: "Motorcycle", ren: "Renters" };

/** "2037751653 - 00" and "2037751653-01" are the same policy in different terms. */
export const policyBase = (v: string) => v.trim().replace(/\s*-\s*\d{1,2}$/, "");

export function parseReport(input: string | string[][], opts: ReportOptions = {}): ParsedReport {
  const cells = typeof input === "string" ? parseCsv(input) : input.filter((r) => r.some((c) => c.trim()));
  // The heading row is the first row that names a policy number column. Reports often start with a title line or two.
  const headAt = cells.findIndex((r) => r.some((c) => (HEADINGS.policyNumber as readonly string[]).includes(norm(c))));
  if (headAt < 0) return { found: [], missing: ["Policy number"], rows: [] };
  const head = cells[headAt].map(norm);
  const col = {} as Record<Field, number>;
  for (const f of Object.keys(HEADINGS) as Field[]) col[f] = head.findIndex((h) => (HEADINGS[f] as readonly string[]).includes(h));
  const has = (f: Field) => col[f] >= 0;
  const missing: string[] = [];
  if (!has("name") && !(has("first") && has("last"))) missing.push("Client name");
  for (const f of ["premium", "effective"] as Field[]) if (!has(f)) missing.push(FIELD_LABELS[f]);
  if (!has("carrier") && !opts.carrier?.trim()) missing.push("Carrier (type the carrier's name above, since this report does not have a carrier column)");
  const term = opts.termMonths === 6 ? 6 : 12;

  const rows = cells.slice(headAt + 1).map((r, i): ReportRow => {
    const get = (f: Field) => (has(f) ? (r[col[f]] ?? "").trim() : "");
    const name = get("name") || [get("first"), get("last")].filter(Boolean).join(" ");
    const effective = parseUsDate(get("effective"));
    let expiration = parseUsDate(get("expiration"));
    let expirationAssumed = false;
    if (!expiration && effective) {
      const months = Number((/\d+/.exec(get("term")) ?? [])[0]);
      expiration = addMonths(effective, months === 6 || months === 12 ? months : term);
      expirationAssumed = true;
    }
    const premium = parseMoney(get("premium"));
    const problems: string[] = [];
    if (nameKey(name).length < 2) problems.push("no client name");
    if (!get("policyNumber")) problems.push("no policy number");
    if (!effective) problems.push("no effective date");
    if (premium === null || premium <= 0) problems.push("no premium");
    if (effective && expiration && expiration <= effective) problems.push("expiration is before the effective date");
    return {
      line: headAt + i + 2, name, phone: get("phone"), email: get("email"), carrier: get("carrier") || opts.carrier?.trim() || "Unknown carrier",
      policyNumber: policyBase(get("policyNumber")), lob: PRODUCTS[get("lob").toLowerCase()] ?? (get("lob") || "Other"), premium, effective, expiration, expirationAssumed,
      agent: get("agent"), problems,
    };
  }).filter((r) => r.name || r.policyNumber);
  return { found: (Object.keys(HEADINGS) as Field[]).filter(has).map((f) => FIELD_LABELS[f]), missing, rows };
}
