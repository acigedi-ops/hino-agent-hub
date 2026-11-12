import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { normalizeEmail, normalizePhone } from "@/lib/contacts";
import { newReferralCode } from "@/lib/referrals";
import { nameKey, parseReport, type ReportRow } from "@/lib/ezlynx";

export type PlanRow = {
  line: number; name: string; policy: string; carrier: string; premium: number | null; effective: string; expiration: string;
  /** convert: applicant becomes a client. add: another policy for a client. update: policy already on file. create: nobody by this name in the hub. skip: cannot be used. */
  action: "convert" | "add" | "update" | "create" | "skip";
  note: string; agent: string; contactId?: string;
};
export type Plan = { found: string[]; missing: string[]; rows: PlanRow[]; counts: Record<PlanRow["action"], number> };

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "";

/** Works out what each report row would do. With apply set, also does it. Owner only: the caller checks the role. */
export async function runReport(u: SessionUser, text: string, apply: boolean, filename = "report.csv"): Promise<Plan> {
  const report = parseReport(text);
  const counts = { convert: 0, add: 0, update: 0, create: 0, skip: 0 };
  if (report.missing.length) return { found: report.found, missing: report.missing, rows: [], counts };

  const [contacts, users, policies] = await Promise.all([
    db.contact.findMany({ select: { id: true, fullName: true, agentId: true, stage: true, phoneNorm: true, emailNorm: true } }),
    db.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    db.policy.findMany({ select: { id: true, policyNumber: true, contactId: true } }),
  ]);
  type C = (typeof contacts)[number];
  const byName = new Map<string, C[]>();
  const index = (c: C) => { const k = nameKey(c.fullName); byName.set(k, [...(byName.get(k) ?? []), c]); };
  contacts.forEach(index);
  const byPolicy = new Map(policies.map((p) => [p.policyNumber.trim().toLowerCase(), p]));
  const agentByName = new Map(users.map((x) => [nameKey(x.name), x]));
  const userName = new Map(users.map((x) => [x.id, x.name]));

  const rows: PlanRow[] = [];
  for (const r of report.rows) {
    const base = { line: r.line, name: r.name, policy: r.policyNumber, carrier: r.carrier, premium: r.premium, effective: iso(r.effective), expiration: iso(r.expiration) };
    const out = (action: PlanRow["action"], note: string, agent = "", contactId?: string) => {
      counts[action]++;
      rows.push({ ...base, action, note: r.expirationAssumed && action !== "skip" ? `${note} Expiration date worked out from the term, check it.` : note, agent, contactId });
    };
    if (r.problems.length) { out("skip", `Skipped: ${r.problems.join(", ")}.`); continue; }
    const agent = r.agent ? agentByName.get(nameKey(r.agent)) : undefined;

    const existing = byPolicy.get(r.policyNumber.trim().toLowerCase());
    if (existing) {
      if (apply) await db.policy.update({ where: { id: existing.id }, data: policyData(r) });
      out("update", "Policy already in the hub. Premium and dates refreshed.", "", existing.contactId);
      continue;
    }

    const match = findContact(r, contacts, byName, agent?.id);
    if (match === "ambiguous") { out("skip", "Skipped: more than one person in the hub has this name. Add the policy on the right one by hand."); continue; }
    if (match) {
      const wasClient = match.stage === "CLIENT";
      if (apply) {
        const p = await db.policy.create({ data: { contactId: match.id, ...policyData(r) } });
        await db.contact.update({ where: { id: match.id }, data: { stage: "CLIENT", lostReason: null, requoteDate: null } });
        await db.activity.create({ data: { contactId: match.id, userId: u.id, kind: "policy", text: `EZLynx report: ${r.carrier} ${r.policyNumber} added${wasClient ? "" : ". Now a client"}` } });
        byPolicy.set(r.policyNumber.trim().toLowerCase(), { id: p.id, policyNumber: p.policyNumber, contactId: match.id });
      }
      match.stage = "CLIENT";
      out(wasClient ? "add" : "convert", wasClient ? "Another policy for an existing client." : "Applicant becomes a client.", userName.get(match.agentId) ?? "", match.id);
      continue;
    }

    const owner = agent ?? { id: u.id, name: u.name };
    let contactId: string | undefined;
    if (apply) {
      const phoneNorm = normalizePhone(r.phone), emailNorm = normalizeEmail(r.email);
      const c = await db.contact.create({
        data: {
          agentId: owner.id, fullName: r.name, stage: "CLIENT", phone: r.phone || null, phoneNorm, email: r.email || null, emailNorm,
          type: /commercial|truck|cargo|liab/i.test(r.lob) ? "COMMERCIAL" : "PERSONAL", leadSource: "EZLynx report", referralCode: newReferralCode(),
          policies: { create: policyData(r) },
          activities: { create: { userId: u.id, kind: "created", text: `Created from the EZLynx report with ${r.carrier} ${r.policyNumber}` } },
        },
        select: { id: true, fullName: true, agentId: true, stage: true, phoneNorm: true, emailNorm: true },
      });
      contacts.push(c); index(c); contactId = c.id;
    } else {
      const ghost: C = { id: `new-${r.line}`, fullName: r.name, agentId: owner.id, stage: "CLIENT", phoneNorm: normalizePhone(r.phone), emailNorm: normalizeEmail(r.email) };
      contacts.push(ghost); index(ghost);
    }
    out("create", agent ? "Not in the hub yet. A new client is created." : `Not in the hub yet. A new client is created under ${u.name} because the report's agent ${r.agent ? `"${r.agent}" ` : ""}does not match a hub login.`, owner.name, contactId);
  }

  if (apply) {
    await db.reportImport.create({
      data: { uploadedById: u.id, filename: filename.slice(0, 120), rows: rows.length, converted: counts.convert, created: counts.create, updated: counts.update + counts.add, skipped: counts.skip },
    });
  }
  return { found: report.found, missing: [], rows, counts };
}

const policyData = (r: ReportRow) => ({
  line: r.lob, carrier: r.carrier, policyNumber: r.policyNumber, premium: r.premium!, effectiveDate: r.effective!, expirationDate: r.expiration!, status: "ACTIVE" as const,
});

function findContact<C extends { id: string; agentId: string; phoneNorm: string | null; emailNorm: string | null }>(
  r: ReportRow, all: C[], byName: Map<string, C[]>, agentId?: string,
): C | "ambiguous" | null {
  const phone = normalizePhone(r.phone), email = normalizeEmail(r.email);
  if (phone || email) {
    const hit = all.find((c) => (phone && c.phoneNorm === phone) || (email && c.emailNorm === email));
    if (hit) return hit;
  }
  const named = byName.get(nameKey(r.name)) ?? [];
  if (named.length <= 1) return named[0] ?? null;
  const mine = agentId ? named.filter((c) => c.agentId === agentId) : [];
  return mine.length === 1 ? mine[0] : "ambiguous";
}
