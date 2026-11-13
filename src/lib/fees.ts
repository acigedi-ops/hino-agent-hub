/** The usual agency fee on new business, and what the agent is paid from each one at month end. */
export const AGENCY_FEE = 55;
export const AGENT_SHARE = 40;
export const MAX_FEE = 1000;
export const FEE_STATUS = {
  PENDING: ["Waiting for payment", "bg-amber-50 text-amber-800"],
  PAID: ["Paid", "bg-green-50 text-green-800"],
  REFUNDED: ["Refunded", "bg-red-50 text-red-800"],
  VOID: ["Cancelled", "bg-black/[0.06] text-muted"],
} as const;

/** The agent's cut of a fee: the flat share, or the whole fee when it is smaller than that. */
export const shareOf = (amount: number) => Math.min(AGENT_SHARE, amount);
