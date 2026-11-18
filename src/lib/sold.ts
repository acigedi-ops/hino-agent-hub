import { db } from "@/lib/db";
import { fmtMoney, normalizeEmail, normalizePhone } from "@/lib/contacts";
import { nameKey } from "@/lib/ezlynx";

export type SoldInput = Record<string, unknown>;
export type Sold = { ref: string; name: string; phones: string[]; emails: string[]; carrier: string; line: string; premium: number | null };

const LOB: Record<string, string> = { AUTOP: "Personal Auto", AUTOB: "Commercial Auto", HOME: "Homeowners", HOMEP: "Homeowners" };
const str = (v: unknown) => (v == null ? "" : String(v)).trim();
/** Zapier sends a list (one entry per line of business) as one comma separated text. */
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Zapier may send the opportunity just as EZLynx gives it (primaryContact, lobs, opportunityId), with the nested parts
 * either as objects or as keys joined by "__". Both are turned into the plain names used below.
 */
function flatten(raw: SoldInput): SoldInput {
  if (raw.sales_status !== undefined || raw.first_name !== undefined) return raw;
  const pc = { ...obj(raw.primaryContact) };
  for (const [k, v] of Object.entries(raw)) if (k.startsWith("primaryContact__")) pc[k.slice(16)] = v;
  const lobs = Array.isArray(raw.lobs) ? raw.lobs.map(obj) : [];
  const col = (k: string) => (lobs.length ? lobs.map((l) => str(l[k])) : raw[`lobs[]${k}`]);
  return {
    opportunity_id: raw.opportunityId ?? raw.id, status: raw.status, name: raw.name,
    first_name: pc.firstName, last_name: pc.lastName, cell_phone: pc.cellPhone, home_phone: pc.homePhone, work_phone: pc.workPhone, email: pc.email, alternate_email: pc.alternateEmail,
    sales_status: col("salesStatus"), carrier: col("finalizedMasterCompany"), premium: col("finalizedPremium"), lob: col("lobCode"),
  };
}

const list = (v: unknown) => (Array.isArray(v) ? v.map(str) : str(v).split(",").map((x) => x.trim()));

/**
 * Reads what Zapier sends for a changed EZLynx opportunity. Returns null unless it says sold: the opportunity status or
 * one of its lines reads sold, won, bound or issued. The first sold line gives the carrier and premium.
 */
export function readSold(raw: SoldInput): Sold | null {
  const b = flatten(raw);
  const isSold = (s: string) => /\b(sold|won|bound|issued)\b/i.test(s) && !/\b(not|un)\s*-?\s*(sold|won)/i.test(s);
  const statuses = list(b.sales_status), carriers = list(b.carrier), premiums = list(b.premium), lobs = list(b.lob);
  let i = statuses.findIndex(isSold);
  if (i < 0 && !isSold(str(b.status))) return null;
  if (i < 0) i = Math.max(0, premiums.findIndex((p) => Number(p) > 0));
  const name = str(b.name) || `${str(b.first_name)} ${str(b.last_name)}`.trim();
  if (name.length < 2) return null;
  const premium = Number((premiums[i] ?? "").replace(/[$,\s]/g, ""));
  const code = (lobs[i] ?? "").toUpperCase();
  return {
    ref: str(b.opportunity_id), name,
    phones: [b.cell_phone, b.home_phone, b.work_phone].map((p) => normalizePhone(str(p))).filter((p): p is string => !!p),
    emails: [b.email, b.alternate_email].map((e) => normalizeEmail(str(e))).filter((e): e is string => !!e),
    carrier: carriers[i] ?? "", line: LOB[code] ?? lobs[i] ?? "", premium: premium > 0 ? premium : null,
  };
}

/**
 * Makes the matching applicant a client. Matches by phone or email first, then by a name only one person in the hub has.
 * Nobody is created here: a sold person who is not in the hub arrives with the policy report, under the right agent.
 */
export async function applySold(sold: Sold): Promise<string> {
  const or = [...sold.phones.map((phoneNorm) => ({ phoneNorm })), ...sold.emails.map((emailNorm) => ({ emailNorm }))];
  const select = { id: true, fullName: true, stage: true, agentId: true, soldAt: true, soldRef: true, _count: { select: { policies: true } } } as const;
  let found = or.length ? await db.contact.findMany({ where: { OR: or }, select, take: 5 }) : [];
  if (found.length > 1) { const k = nameKey(sold.name); const same = found.filter((c) => nameKey(c.fullName) === k); if (same.length) found = same; }
  if (found.length === 0) {
    const k = nameKey(sold.name);
    const last = sold.name.split(/\s+/).pop()!;
    found = (await db.contact.findMany({ where: { fullName: { contains: last, mode: "insensitive" } }, select, take: 200 })).filter((c) => nameKey(c.fullName) === k);
  }
  if (found.length === 0) return "no match";
  if (found.length > 1) return "more than one match";
  const c = found[0];
  if (c.soldRef && c.soldRef === sold.ref) return "already recorded";
  const what = [sold.carrier, sold.line, sold.premium ? fmtMoney(sold.premium) : ""].filter(Boolean).join(", ");
  const owner = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  // Someone who already has policies stays as they are; the report adds the new policy. The note still goes on the timeline.
  const pending = c._count.policies === 0;
  await db.contact.update({
    where: { id: c.id },
    data: pending
      ? { stage: "CLIENT", lostReason: null, requoteDate: null, soldAt: c.soldAt ?? new Date(), soldRef: sold.ref || null, soldCarrier: sold.carrier || null, soldLine: sold.line || null, soldPremium: sold.premium }
      : { soldRef: sold.ref || null },
  });
  await db.task.updateMany({ where: { contactId: c.id, kind: "requote", doneAt: null }, data: { doneAt: new Date(), doneNote: "Sold in EZLynx" } });
  await db.activity.create({ data: { contactId: c.id, userId: owner?.id ?? c.agentId, kind: "policy", text: `Sold in EZLynx${what ? `: ${what}` : ""}.${pending && c.stage !== "CLIENT" ? " Now a client. The policy number and dates come with the next policy report." : ""}` } });
  return pending ? "client" : "noted";
}
