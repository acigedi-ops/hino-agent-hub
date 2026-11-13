/** Charged on all new business. The agent's share is paid by the owner at month end. */
export const AGENCY_FEE = 55;
export const AGENT_SHARE = 40;
export const FEE_METHODS = ["Card", "Cash", "Check", "Zelle or bank transfer", "Other"];
export const FEE_DISCLOSURE_KIND = "Agency fee disclosure (signed)";
export const FEE_STATUS = {
  PENDING: ["Waiting for owner to confirm", "bg-amber-50 text-amber-800"],
  PAID: ["Confirmed", "bg-green-50 text-green-800"],
  REFUNDED: ["Refunded", "bg-red-50 text-red-800"],
  VOID: ["Not received", "bg-black/[0.06] text-muted"],
} as const;
