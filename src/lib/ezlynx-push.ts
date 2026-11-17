import type { IntakeData } from "./intake";

/**
 * Builds what the hub hands to Zapier so a Zap can create the applicant in EZLynx.
 * EZLynx refuses a record without a name, street, city, state and zip, so nothing is built until those are known.
 */

export const US_STATES = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

export const cleanState = (v?: string | null) => { const s = (v ?? "").trim().toUpperCase(); return US_STATES.includes(s) ? s : null; };
export const cleanZip = (v?: string | null) => { const z = (v ?? "").trim(); return /^\d{5}(-\d{4})?$/.test(z) ? z : null; };

/** The file types EZLynx accepts in Documents. Phone formats such as HEIC and WebP are not among them. */
export const EZLYNX_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** One display line, for example "1 Main St, Apt 2, Tacoma, WA 98402". */
export const addressLine = (a: { street?: string | null; street2?: string | null; city?: string | null; state?: string | null; zip?: string | null }) =>
  [a.street, a.street2, a.city, [a.state, a.zip].filter(Boolean).join(" ")].map((p) => (p ?? "").trim()).filter(Boolean).join(", ") || null;

/** "Maria Elena Lopez" is first "Maria Elena", last "Lopez". "Lopez, Maria" is read as last name first. */
export function splitName(full: string): { first: string; last: string } | null {
  const t = full.trim().replace(/\s+/g, " ");
  const comma = t.match(/^([^,]+),\s*(.+)$/);
  if (comma) return { first: comma[2], last: comma[1] };
  const parts = t.split(" ");
  if (parts.length < 2) return null;
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

const isoDate = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const MARITAL: Record<string, string> = { single: "Single", married: "Married", divorced: "Divorced", widowed: "Widowed", separated: "Separated", "domestic partner": "Domestic Partner" };

export type PushContact = {
  id: string; fullName: string; type: "PERSONAL" | "COMMERCIAL"; phone: string | null; email: string | null; dob: Date | null;
  street: string | null; street2: string | null; city: string | null; state: string | null; zip: string | null; leadSource: string | null;
};
export type PushAgent = { name: string; ezlynxUsername: string | null };
export type EzlynxPayload = Record<string, string>;

/** What is still needed before this person can go to EZLynx, in words an agent can act on. Empty when ready. */
export function missingForEzlynx(c: PushContact): string[] {
  const m: string[] = [];
  if (!splitName(c.fullName)) m.push("first and last name");
  if (!c.street?.trim()) m.push("street address");
  if (!c.city?.trim()) m.push("city");
  if (!cleanState(c.state)) m.push("state");
  if (!cleanZip(c.zip)) m.push("zip");
  return m;
}

/** A short summary of the intake form for the EZLynx notes box. Leaves out license numbers. */
export function intakeNotes(d: IntakeData | null, agent: string): string {
  const lines = [`Added in the Rhino Agent Portal by ${agent}.`];
  if (!d) return lines[0];
  const t = d.text;
  if (t.current_carrier) lines.push(`Current carrier: ${t.current_carrier}${t.expiration_date ? `, expires ${t.expiration_date}` : ""}${t.how_long_insured ? `, insured ${t.how_long_insured}` : ""}`);
  if (d.choice.housing) lines.push(`Housing: ${d.choice.housing}`);
  const drivers = d.drivers.filter((r) => r.name).map((r) => [r.name, r.dob && `born ${r.dob}`, r.relationship, r.marital].filter(Boolean).join(", "));
  if (drivers.length) lines.push(`Drivers: ${drivers.join("; ")}`);
  const vehicles = d.vehicles.filter((r) => r.vin || r.make).map((r) => [[r.year, r.make, r.model].filter(Boolean).join(" "), r.vin && `VIN ${r.vin}`, r.ownership].filter(Boolean).join(", "));
  if (vehicles.length) lines.push(`Vehicles: ${vehicles.join("; ")}`);
  const violations = d.violations.filter((r) => r.type).map((r) => [r.driver, r.date, r.type].filter(Boolean).join(" "));
  if (violations.length) lines.push(`Violations: ${violations.join("; ")}`);
  if (d.choice.type === "Commercial") {
    const biz = [t.dot && `DOT ${t.dot}`, t.mc && `MC ${t.mc}`, t.experience_years && `${t.experience_years} years experience`, t.truck_insurance && `truck insurance ${t.truck_insurance}`, t.truck_renewal_date && `renews ${t.truck_renewal_date}`].filter(Boolean);
    if (biz.length) lines.push(`Business: ${biz.join(", ")}`);
  }
  if (t.notes) lines.push(`Notes: ${t.notes}`);
  return lines.join("\n").slice(0, 3000);
}

/** The flat set of fields sent to Zapier. Every key is always present so the Zap's field list never changes shape. */
export function buildEzlynxPayload(c: PushContact, d: IntakeData | null, agent: PushAgent, hubUrl: string): { missing: string[] } | { payload: EzlynxPayload } {
  const missing = missingForEzlynx(c);
  if (missing.length) return { missing };
  const name = splitName(c.fullName)!;
  const t = d?.text;
  const spouse = t?.spouse_name ? splitName(t.spouse_name) : null;
  const self = d?.drivers.find((r) => /^(self|insured)$/i.test(r.relationship)) ?? d?.drivers.find((r) => r.name && r.name.toLowerCase() === c.fullName.toLowerCase());
  const commercial = c.type === "COMMERCIAL";
  return {
    payload: {
      hub_contact_id: c.id,
      hub_link: hubUrl ? `${hubUrl.replace(/\/$/, "")}/contacts/${c.id}` : "",
      type: commercial ? "Commercial" : "Personal",
      first_name: name.first,
      last_name: name.last,
      business_name: commercial ? (t?.business_name || c.fullName) : "",
      date_of_birth: c.dob ? c.dob.toISOString().slice(0, 10) : "",
      mobile_phone: c.phone ?? "",
      email: c.email ?? "",
      address_line_1: c.street!.trim(),
      address_line_2: c.street2?.trim() ?? "",
      city: c.city!.trim(),
      state: cleanState(c.state)!,
      zip: cleanZip(c.zip)!,
      marital_status: MARITAL[(self?.marital ?? "").toLowerCase()] ?? "",
      co_applicant_first_name: spouse?.first ?? "",
      co_applicant_last_name: spouse?.last ?? "",
      co_applicant_date_of_birth: spouse ? isoDate(t?.spouse_dob) : "",
      co_applicant_relationship: spouse ? "Spouse" : "",
      prior_carrier: (commercial ? t?.truck_insurance : t?.current_carrier) ?? "",
      x_date: isoDate(commercial ? t?.truck_renewal_date : t?.expiration_date),
      line_of_business: commercial ? "AUTOB" : "AUTOP",
      lead_source: c.leadSource ?? "",
      source: "Rhino Agent Portal",
      agent_name: agent.name,
      assigned_username: agent.ezlynxUsername?.trim() ?? "",
      notes: intakeNotes(d, agent.name),
    },
  };
}
