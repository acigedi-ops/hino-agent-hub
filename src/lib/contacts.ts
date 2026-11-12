import type { Stage } from "@prisma/client";

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "LEAD", label: "Lead", hint: "Name and a phone or email" },
  { key: "PROSPECT", label: "Prospect", hint: "Intake on file" },
  { key: "QUOTING", label: "Quoting", hint: "Rates being run" },
  { key: "QUOTED", label: "Quoted", hint: "Prices given" },
  { key: "CLIENT", label: "Client", hint: "Policy bound" },
  { key: "LOST", label: "Lost / not now", hint: "Reason and requote date" },
  { key: "FORMER", label: "Former client", hint: "No active policy" },
];

export const PIPELINE: Stage[] = ["LEAD", "PROSPECT", "QUOTING", "QUOTED"];
export const stageLabel = (s: Stage) => STAGES.find((x) => x.key === s)?.label ?? s;

/** Stages an agent may set by hand. CLIENT and FORMER are set only by policies. */
export const MANUAL_STAGES: Stage[] = ["LEAD", "PROSPECT", "QUOTING", "QUOTED", "LOST"];

/** Digits only, without a leading US country code, so (206) 555-0100 and +1 206 555 0100 match. */
export function normalizePhone(p?: string | null): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (d.length < 7) return null;
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

export const normalizeEmail = (e?: string | null): string | null => {
  const v = (e ?? "").trim().toLowerCase();
  return v.includes("@") ? v : null;
};

/** Stage a contact should hold given its policies: any active policy makes a client, losing the last makes a former client. */
export function stageFromPolicies(current: Stage, activePolicies: number, totalPolicies: number): Stage {
  if (activePolicies > 0) return "CLIENT";
  if (totalPolicies > 0 && (current === "CLIENT" || current === "FORMER")) return "FORMER";
  return current;
}

export const fmtDate = (d?: Date | null) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

export const fmtMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Parses a yyyy-mm-dd form value as a UTC date, or null. */
export function parseDate(v?: string | null): Date | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

export const daysUntil = (d: Date, now = new Date()) =>
  Math.ceil((d.getTime() - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);

export const LEAD_SOURCES = ["Referral", "Walk-in", "Phone call", "Website", "Social media", "Existing client", "Purchased lead", "Other"];
export const LOST_REASONS = ["Price too high", "Stayed with current carrier", "Went with another agency", "No response", "Could not place coverage", "Not ready yet", "Other"];
export const POLICY_LINES = ["Personal auto", "Commercial auto", "Trucking", "Cargo", "General liability", "Home", "Renters", "Other"];
