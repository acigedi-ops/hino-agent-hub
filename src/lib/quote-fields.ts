/** The Quote Desk request form: business insurance (general liability, professional liability and the like). */
export const QUOTE_STATUS: Record<string, string> = { SENT: "Sent", NEED_INFO: "Need info", QUOTED: "Quote ready", ACCEPTED: "Client accepted", NOT_TAKEN: "Not taken" };
export const QUOTE_TONE: Record<string, string> = {
  SENT: "bg-black/[0.06] text-ink", NEED_INFO: "bg-amber-50 text-amber-800", QUOTED: "bg-green-50 text-green-800", ACCEPTED: "bg-blue-50 text-blue-800", NOT_TAKEN: "bg-black/[0.06] text-muted",
};
export const COVERAGES = ["General liability", "Professional liability", "Business owner's policy", "Workers comp", "Cyber", "Umbrella", "Other"] as const;
export const INDUSTRIES = ["Construction", "Professional services", "Retail", "Restaurant or food", "Real estate", "Cleaning or janitorial", "Other"] as const;
export const ENTITIES = ["LLC", "Corporation", "Sole owner", "Partnership", "Other"] as const;

export type QuoteField = { key: string; label: string; kind?: "text" | "money" | "date" | "long" | "yesno" | "select"; options?: readonly string[]; required?: boolean; construction?: boolean };
export const QUOTE_SECTIONS: { title: string; fields: QuoteField[] }[] = [
  { title: "Business", fields: [
    { key: "legal_name", label: "Legal business name", required: true },
    { key: "dba", label: "DBA (if different)" },
    { key: "contact_name", label: "Contact person", required: true },
    { key: "phone", label: "Phone", required: true },
    { key: "email", label: "Email" },
    { key: "address", label: "Business address" },
    { key: "entity", label: "Type of entity", kind: "select", options: ENTITIES },
    { key: "year_started", label: "Year started" },
  ] },
  { title: "What the business does", fields: [
    { key: "industry", label: "Industry", kind: "select", options: INDUSTRIES, required: true },
    { key: "description", label: "Describe the work they do", kind: "long", required: true },
    { key: "gross_income", label: "Gross income per year", kind: "money", construction: true },
    { key: "payroll", label: "Payroll per year", kind: "money", construction: true },
    { key: "employees", label: "Number of employees" },
    { key: "uses_subs", label: "Do they use subcontractors?", kind: "yesno", construction: true },
    { key: "sub_cost", label: "Paid to subcontractors per year", kind: "money" },
    { key: "above_4_stories", label: "Any work above 4 stories?", kind: "yesno", construction: true },
  ] },
  { title: "Coverage wanted", fields: [
    { key: "limits", label: "Limits wanted (for example 1M / 2M)" },
    { key: "start_date", label: "Date coverage should start", kind: "date" },
    { key: "certificate", label: "Is a certificate needed for a contract?", kind: "yesno" },
  ] },
  { title: "History", fields: [
    { key: "current_carrier", label: "Current carrier (or None)" },
    { key: "renewal_date", label: "Renewal date", kind: "date" },
    { key: "experience_years", label: "Years of experience in this trade" },
    { key: "claims", label: "Any claims in the last 5 years?", kind: "yesno" },
    { key: "claims_details", label: "Claim details", kind: "long" },
  ] },
];
export const ALL_QUOTE_FIELDS = QUOTE_SECTIONS.flatMap((s) => s.fields);
export type QuoteData = { fields: Record<string, string>; coverages: string[]; notes: string };

/** Reads the request form. Returns a message for the agent when something needed is missing. */
export function readQuoteForm(get: (k: string) => string, all: (k: string) => string[]): { error: string } | { data: QuoteData } {
  const fields: Record<string, string> = {};
  for (const f of ALL_QUOTE_FIELDS) fields[f.key] = get(f.key).slice(0, f.kind === "long" ? 2000 : 200);
  const coverages = all("coverage").filter((c) => (COVERAGES as readonly string[]).includes(c));
  const construction = fields.industry === "Construction";
  const missing = ALL_QUOTE_FIELDS.filter((f) => (f.required || (construction && f.construction)) && !fields[f.key]).map((f) => f.label);
  if (construction && fields.uses_subs === "Yes" && !fields.sub_cost) missing.push("Paid to subcontractors per year");
  if (!coverages.length) missing.push("at least one coverage");
  if (missing.length) return { error: `Still needed: ${missing.join(", ")}.` };
  return { data: { fields, coverages, notes: get("notes").slice(0, 3000) } };
}

export function parseQuoteData(raw: unknown): QuoteData {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<QuoteData>;
  return { fields: { ...(r.fields ?? {}) }, coverages: Array.isArray(r.coverages) ? r.coverages.map(String) : [], notes: typeof r.notes === "string" ? r.notes : "" };
}
