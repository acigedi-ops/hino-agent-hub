import type { QuoteType, Stage } from "@prisma/client";

export type ClientRow = {
  id: string; name: string; type: QuoteType; stage: Stage; phone: string; agent: string; carriers: string;
  premium: number; policies: number; effective: Date | null; renewal: Date | null;
};

export const SORT_KEYS = ["name", "status", "type", "premium", "effective", "renewal", "agent"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Sorts in place. Rows with no date always go last, whichever direction is chosen. Ties fall back to name. */
export function sortClients(rows: ClientRow[], key: SortKey, dir: "asc" | "desc"): ClientRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const byName = (a: ClientRow, b: ClientRow) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  const date = (k: "effective" | "renewal") => (a: ClientRow, b: ClientRow) => {
    const x = a[k], y = b[k];
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    return sign * (x.getTime() - y.getTime());
  };
  const cmp: Record<SortKey, (a: ClientRow, b: ClientRow) => number> = {
    name: (a, b) => sign * byName(a, b),
    status: (a, b) => sign * a.stage.localeCompare(b.stage),
    type: (a, b) => sign * a.type.localeCompare(b.type),
    agent: (a, b) => sign * a.agent.localeCompare(b.agent),
    premium: (a, b) => sign * (a.premium - b.premium),
    effective: date("effective"),
    renewal: date("renewal"),
  };
  return rows.sort((a, b) => cmp[key](a, b) || byName(a, b));
}
