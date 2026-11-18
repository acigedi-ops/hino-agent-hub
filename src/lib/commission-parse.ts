import { parseMoney, parseUsDate } from "@/lib/ezlynx";

/** Reads the owner's commission statement sheet: titled sections, each with a header row, rows and a TOTAL row, then a grand total. */

export const SECTIONS = [
  { key: "new", label: "New business" },
  { key: "renewal", label: "Renewals" },
  { key: "adjust", label: "Endorsements, cancellations and adjustments" },
  { key: "deduction", label: "Deductions" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export const sectionLabel = (k: string) => SECTIONS.find((s) => s.key === k)?.label ?? k;

export type StatementLine = {
  section: SectionKey; company: string; client: string; policyNumber: string;
  effDate: string; transDate: string; line: string; type: string; premium: number | null; amount: number;
};
export type StatementSection = { key: SectionKey; count: number; sum: number; fileTotal: number | null };
export type ParsedStatement = {
  lines: StatementLine[]; sections: StatementSection[];
  /** The sum of every line read. */
  net: number;
  /** The grand total written in the file, when it has one. */
  fileNet: number | null;
  /** True when the sheet had more below the grand total (the review section), which is left out. */
  skippedBelow: boolean;
  problems: string[];
};

const cents = (n: number) => Math.round(n * 100) / 100;
const clean = (v: string | undefined) => (v ?? "").replace(/\s+/g, " ").trim();
const iso = (v: string) => parseUsDate(v)?.toISOString().slice(0, 10) ?? "";

function sectionOf(title: string): SectionKey | null {
  const t = title.toUpperCase();
  if (/TO REVIEW|GRAND TOTAL/.test(t)) return null;
  if (/^NEW BUSINESS/.test(t)) return "new";
  if (/^RENEWAL/.test(t)) return "renewal";
  if (/^DEDUCTION/.test(t)) return "deduction";
  if (/ENDORSEMENT|CANCELLATION|ADJUSTMENT|CHARGEBACK/.test(t)) return "adjust";
  return null;
}

type Cols = { company: number; client: number; policy: number; eff: number; trans: number; line: number; type: number; premium: number; amount: number };

function headerCols(row: string[]): Cols | null {
  const h = row.map((c) => clean(c).toLowerCase());
  const find = (...res: RegExp[]) => h.findIndex((c) => res.some((r) => r.test(c)));
  const amount = Math.max(h.findLastIndex((c) => /commission/.test(c)), h.findLastIndex((c) => /^amount/.test(c)));
  const company = find(/^company$/, /^carrier$/, /^item$/);
  if (company < 0 || amount < 0) return null;
  return {
    company, amount, client: find(/^client/, /^insured/, /^description$/), policy: find(/^policy/), eff: find(/^eff/), trans: find(/^trans(action)? date/),
    line: find(/^line/, /^month$/), type: find(/^transaction type$/, /^type$/), premium: find(/^premium/),
  };
}

export function parseStatement(rows: string[][]): ParsedStatement {
  const lines: StatementLine[] = [];
  const sections: StatementSection[] = [];
  const problems: string[] = [];
  let fileNet: number | null = null;
  let skippedBelow = false;
  let current: StatementSection | null = null;
  let cols: Cols | null = null;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map(clean);
    const filled = row.filter(Boolean);
    if (!filled.length) continue;
    const first = filled[0];

    if (/GRAND TOTAL/i.test(first)) {
      fileNet = parseMoney(filled[filled.length - 1]);
      skippedBelow = rows.slice(i + 1).some((r) => r.some((c) => clean(c)));
      break;
    }
    if (/TO REVIEW/i.test(first)) { skippedBelow = true; break; }

    // A section title is a row with one filled cell.
    if (new Set(filled).size === 1 && !/^total$/i.test(first)) {
      const key = sectionOf(first);
      if (key) {
        current = sections.find((s) => s.key === key) ?? null;
        if (!current) { current = { key, count: 0, sum: 0, fileTotal: null }; sections.push(current); }
        cols = null;
      }
      continue;
    }
    if (!current) continue;
    if (row.some((c) => /^total$/i.test(c))) {
      const t = parseMoney(filled[filled.length - 1]);
      if (t !== null) current.fileTotal = cents((current.fileTotal ?? 0) + t);
      continue;
    }
    const asHeader = headerCols(row);
    if (asHeader) { cols = asHeader; continue; }
    if (!cols) continue;

    const at = (n: number) => (n >= 0 ? row[n] ?? "" : "");
    const amount = parseMoney(at(cols.amount));
    if (amount === null) { problems.push(`Row ${i + 1} has no amount and was left out.`); continue; }
    const deduction = current.key === "deduction";
    lines.push({
      section: current.key, company: at(cols.company), client: at(cols.client), policyNumber: deduction ? "" : at(cols.policy),
      effDate: iso(at(cols.eff)), transDate: iso(at(cols.trans)), line: at(cols.line), type: at(cols.type) || (deduction ? "Deduction" : ""),
      premium: parseMoney(at(cols.premium)), amount: cents(amount),
    });
    current.count++;
    current.sum = cents(current.sum + amount);
  }

  if (!lines.length) problems.push("No statement rows were found. The sheet needs sections titled New business, Renewals, Endorsements or Deductions, each with a header row.");
  for (const s of sections) {
    if (s.fileTotal !== null && Math.abs(s.fileTotal - s.sum) > 0.01) problems.push(`${sectionLabel(s.key)}: the rows add up to ${s.sum.toFixed(2)} but the sheet's TOTAL row says ${s.fileTotal.toFixed(2)}.`);
  }
  const net = cents(lines.reduce((a, l) => a + l.amount, 0));
  if (fileNet !== null && Math.abs(fileNet - net) > 0.01) problems.push(`The rows add up to ${net.toFixed(2)} but the sheet's grand total says ${fileNet.toFixed(2)}.`);
  return { lines, sections, net, fileNet, skippedBelow, problems };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Finds a month in a sheet or file name such as "Veniamin Apr 2026" and returns it as 2026-04. */
export function monthFromName(name: string): string {
  const r = /(?<![a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s_-]*(20\d{2})(?!\d)/i.exec(name);
  if (r) return `${r[2]}-${String(MONTHS.indexOf(r[1].toLowerCase()) + 1).padStart(2, "0")}`;
  const n = /(?<!\d)(20\d{2})[-_ ](0[1-9]|1[0-2])(?!\d)/.exec(name);
  return n ? `${n[1]}-${n[2]}` : "";
}

export type Period = { view: "week" | "month" | "quarter" | "year" | "all"; key: string };

/** The statement months a period covers, as inclusive YYYY-MM bounds. Week and all have no month bounds. */
export function periodMonths(p: Period): { from: string; to: string } | null {
  if (p.view === "month") return { from: p.key, to: p.key };
  if (p.view === "year") return { from: `${p.key}-01`, to: `${p.key}-12` };
  if (p.view === "quarter") {
    const [y, q] = p.key.split("-Q");
    const start = (Number(q) - 1) * 3 + 1;
    return { from: `${y}-${String(start).padStart(2, "0")}`, to: `${y}-${String(start + 2).padStart(2, "0")}` };
  }
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** The Monday on or before a date, as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const day = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)).toISOString().slice(0, 10);
}

/** The key for the same kind of period that holds a given statement month, or the first week of that month. */
export function periodFor(view: Period["view"], month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (view === "month") return month;
  if (view === "quarter") return `${y}-Q${Math.ceil(m / 3)}`;
  if (view === "year") return String(y);
  if (view === "week") return weekStart(new Date(Date.UTC(y, m - 1, 1)));
  return "";
}

export function validPeriod(view: string, key: string): view is Period["view"] {
  if (view === "all") return true;
  if (view === "month") return /^20\d{2}-(0[1-9]|1[0-2])$/.test(key);
  if (view === "quarter") return /^20\d{2}-Q[1-4]$/.test(key);
  if (view === "year") return /^20\d{2}$/.test(key);
  if (view === "week") return /^20\d{2}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(Date.parse(key));
  return false;
}

/** The period before (-1) or after (+1) this one. */
export function stepPeriod(p: Period, by: 1 | -1): string {
  if (p.view === "month") { const [y, m] = p.key.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + by, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
  if (p.view === "quarter") { const [y, q] = p.key.split("-Q").map(Number); const n = y * 4 + (q - 1) + by; return `${Math.floor(n / 4)}-Q${(n % 4) + 1}`; }
  if (p.view === "year") return String(Number(p.key) + by);
  if (p.view === "week") return new Date(Date.parse(p.key) + by * 7 * 864e5).toISOString().slice(0, 10);
  return "";
}

const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthLabel = (month: string) => { const [y, m] = month.split("-").map(Number); return `${LONG[m - 1]} ${y}`; };

export function periodLabel(p: Period): string {
  if (p.view === "month") return monthLabel(p.key);
  if (p.view === "quarter") { const [y, q] = p.key.split("-Q"); return `Quarter ${q}, ${y}`; }
  if (p.view === "year") return p.key;
  if (p.view === "week") {
    const a = new Date(Date.parse(p.key)), b = new Date(Date.parse(p.key) + 6 * 864e5);
    const f = (d: Date) => `${LONG[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
    return `Week of ${f(a)} to ${f(b)}, ${b.getUTCFullYear()}`;
  }
  return "All time";
}
