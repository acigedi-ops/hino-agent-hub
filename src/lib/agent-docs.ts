import { daysUntil } from "@/lib/contacts";

/** Documents every agent must have approved. */
export const REQUIRED_AGENT_DOCS = ["W-9", "Producer license"];
export const AGENT_DOC_KINDS = [...REQUIRED_AGENT_DOCS, "E&O certificate", "Other"];

export type DocState = "missing" | "pending" | "approved" | "rejected" | "expired" | "expiring";
type Doc = { kind: string; status: "PENDING" | "APPROVED" | "REJECTED"; expiresOn: Date | null; createdAt: Date };

/** Where an agent stands on one required document, judged by their newest upload of that kind. */
export function docState(docs: Doc[], kind: string, now = new Date()): DocState {
  const latest = docs.filter((d) => d.kind === kind).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  if (!latest) return "missing";
  if (latest.status === "REJECTED") return "rejected";
  if (latest.status === "PENDING") return "pending";
  if (latest.expiresOn) {
    const days = daysUntil(latest.expiresOn, now);
    if (days < 0) return "expired";
    if (days <= 60) return "expiring";
  }
  return "approved";
}

export const DOC_STATE_LABEL: Record<DocState, string> = {
  missing: "Not uploaded", pending: "Waiting for approval", approved: "Approved", rejected: "Rejected, upload again",
  expired: "Expired, upload the renewed one", expiring: "Approved, expires soon",
};
export const DOC_STATE_TONE: Record<DocState, string> = {
  missing: "bg-red-50 text-red-800", pending: "bg-amber-50 text-amber-800", approved: "bg-green-50 text-green-800",
  rejected: "bg-red-50 text-red-800", expired: "bg-red-50 text-red-800", expiring: "bg-amber-50 text-amber-800",
};
/** States where the agent has something to do. */
export const needsAction = (s: DocState) => s === "missing" || s === "rejected" || s === "expired" || s === "expiring";
