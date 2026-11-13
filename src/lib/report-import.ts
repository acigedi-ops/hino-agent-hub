import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { fmtDate, normalizeEmail, normalizePhone } from "@/lib/contacts";
import { newReferralCode } from "@/lib/referrals";
import { reportTask, settleTasks, syncAutoTasks } from "@/lib/tasks";
import { nameKey, parseReport, policyBase, type ReportOptions, type ReportRow } from "@/lib/ezlynx";

export type PlanRow = {
  line: number; name: string; policy: string; carrier: string; premium: number | null; effective: string; expiration: string;
  /** convert: applicant becomes a client. add: another policy for a client. update: policy already on file. cancel: policy cancelled. create: nobody by this name in the hub. skip: cannot be used. */
  action: "convert" | "add" | "update" | "cancel" | "create" | "skip";
  note: string; agent: string; contactId?: string;
};
export type Plan = { found: string[]; missing: string[]; rows: PlanRow[]; counts: Record<PlanRow["action"], number> };

const iso = (d: Date | null) => d?.toISOString().slice(0, 10) ?? "";

/** Works out what each report row would do. With apply set, also does it. Owner only: the caller checks the role. */
export async function runReport(u: SessionUser, input: string | string[][], apply: boolean, filename = "report.csv", opts: ReportOptions & { newClientsTo?: string } = {}): Promise<Plan> {
  const report = parseReport(input, opts);
  const counts = { convert: 0, add: 0, update: 0, cancel: 0, create: 0, skip: 0 };
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
  const byPolicy = new Map(policies.map((p) => [policyBase(p.policyNumber).toLowerCase(), p]));
  const fallback = users.find((x) => x.id === opts.newClientsTo) ?? { id: u.id, name: u.name };
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
    const real = existing && !existing.id.startsWith("new-") ? existing : null;
    const note = (text: string) => real && db.activity.create({ data: { contactId: real.contactId, userId: u.id, kind: "policy", text: `${r.carrier} ${r.policyNumber}: ${text}` } });
    if (r.transaction === "cancel_notice") {
      if (!existing) { out("skip", "Skipped: cancel notice for a policy that is not in the hub."); continue; }
      if (apply) {
        const when = r.actionDate ? `, cancels ${fmtDate(r.actionDate)}` : "";
        await note(`cancel notice sent${when}`);
        if (real) await reportTask("cancel_notice", real, `${r.carrier} ${r.policyNumber}`, r.actionDate ?? r.processed, when);
      }
      out("update", "Cancel notice. The agent gets a task to call the client.", "", real?.contactId);
      continue;
    }
    if (r.transaction === "cancel") {
      if (!existing) { out("skip", "Skipped: cancellation for a policy that is not in the hub."); continue; }
      if (apply && real) {
        await db.policy.update({ where: { id: real.id }, data: { status: "CANCELLED", cancelledAt: r.actionDate ?? r.processed ?? new Date() } });
        await settleTasks(real.id, ["renewal", "cancel_notice"], "Policy cancelled on the policy report");
        await reportTask("cancelled", real, `${r.carrier} ${r.policyNumber}`, r.actionDate ?? r.processed, "");
        if (!(await db.policy.count({ where: { contactId: real.contactId, status: "ACTIVE" } }))) await db.contact.update({ where: { id: real.contactId }, data: { stage: "FORMER" } });
        await note("cancelled");
      }
      out("cancel", "Policy cancelled. The agent gets a task to win it back. The client becomes a former client if this was their last active policy.", "", real?.contactId);
      continue;
    }
    if (r.transaction === "reinstate") {
      if (!existing) { out("skip", "Skipped: reinstatement for a policy that is not in the hub."); continue; }
      if (apply && real) {
        await db.policy.update({ where: { id: real.id }, data: { status: "ACTIVE", cancelledAt: null } });
        await settleTasks(real.id, ["cancel_notice", "cancelled"], "Policy reinstated on the policy report");
        await db.contact.update({ where: { id: real.contactId }, data: { stage: "CLIENT" } });
        await note("reinstated");
      }
      out("update", "Policy reinstated.", "", real?.contactId);
      continue;
    }
    if (existing) {
      if (apply && real) {
        await db.policy.update({ where: { id: real.id }, data: { premium: r.premium!, effectiveDate: r.effective!, expirationDate: r.expiration!, ...(r.transaction === "renewal" ? { status: "ACTIVE" as const, cancelledAt: null } : {}) } });
        if (r.transaction === "renewal") await settleTasks(real.id, ["renewal"], "Renewed on the policy report");
      }
      out("update", r.transaction === "renewal" ? "Renewal. Premium and dates updated." : "Policy already in the hub. Premium and dates refreshed.", "", real?.contactId);
      continue;
    }
    const key = r.policyNumber.trim().toLowerCase();

    const match = findContact(r, contacts, byName, agent?.id);
    if (match === "ambiguous") { out("skip", "Skipped: more than one person in the hub has this name. Add the policy on the right one by hand."); continue; }
    if (match) {
      const wasClient = match.stage === "CLIENT";
      if (apply) {
        const p = await db.policy.create({ data: { contactId: match.id, ...policyData(r) } });
        await db.contact.update({ where: { id: match.id }, data: { stage: "CLIENT", lostReason: null, requoteDate: null } });
        await db.activity.create({ data: { contactId: match.id, userId: u.id, kind: "policy", text: `Policy report: ${r.carrier} ${r.policyNumber} added${wasClient ? "" : ". Now a client"}` } });
        byPolicy.set(key, { id: p.id, policyNumber: p.policyNumber, contactId: match.id });
      } else byPolicy.set(key, { id: `new-${r.line}`, policyNumber: r.policyNumber, contactId: match.id });
      match.stage = "CLIENT";
      out(wasClient ? "add" : "convert", wasClient ? "Another policy for an existing client." : "Applicant becomes a client.", userName.get(match.agentId) ?? "", match.id);
      continue;
    }

    const owner = agent ?? fallback;
    let contactId: string | undefined;
    if (apply) {
      const phoneNorm = normalizePhone(r.phone), emailNorm = normalizeEmail(r.email);
      const c = await db.contact.create({
        data: {
          agentId: owner.id, fullName: r.name, stage: "CLIENT", phone: r.phone || null, phoneNorm, email: r.email || null, emailNorm,
          type: /commercial|truck|cargo|liab/i.test(r.lob) ? "COMMERCIAL" : "PERSONAL", leadSource: "Policy report", referralCode: newReferralCode(),
          address: r.address || null,
          policies: { create: policyData(r) },
          activities: { create: { userId: u.id, kind: "created", text: `Created from the policy report with ${r.carrier} ${r.policyNumber}` } },
        },
        select: { id: true, fullName: true, agentId: true, stage: true, phoneNorm: true, emailNorm: true, policies: { select: { id: true, policyNumber: true } } },
      });
      contacts.push(c); index(c); contactId = c.id;
      byPolicy.set(key, { id: c.policies[0].id, policyNumber: c.policies[0].policyNumber, contactId: c.id });
    } else {
      const ghost: C = { id: `new-${r.line}`, fullName: r.name, agentId: owner.id, stage: "CLIENT", phoneNorm: normalizePhone(r.phone), emailNorm: normalizeEmail(r.email) };
      contacts.push(ghost); index(ghost);
      byPolicy.set(key, { id: `new-${r.line}`, policyNumber: r.policyNumber, contactId: ghost.id });
    }
    out("create", agent ? "Not in the hub yet. A new client is created." : `Not in the hub yet. A new client is created under ${owner.name}.`, owner.name, contactId);
  }

  if (apply) {
    await syncAutoTasks(true);
    await db.reportImport.create({
      data: { uploadedById: u.id, filename: filename.slice(0, 120), rows: rows.length, converted: counts.convert, created: counts.create, updated: counts.update + counts.add + counts.cancel, skipped: counts.skip },
    });
  }
  return { found: report.found, missing: [], rows, counts };
}

const policyData = (r: ReportRow) => ({
  line: r.lob, carrier: r.carrier, policyNumber: r.policyNumber, premium: r.premium!, effectiveDate: r.effective!, expirationDate: r.expiration!, writtenDate: r.effective!, status: "ACTIVE" as const,
});

/** By name first. Phone or email is the fallback, and only for people who are not clients yet: a business and its owner often share a phone but are separate insureds. */
function findContact<C extends { id: string; agentId: string; stage: string; phoneNorm: string | null; emailNorm: string | null }>(
  r: ReportRow, all: C[], byName: Map<string, C[]>, agentId?: string,
): C | "ambiguous" | null {
  const named = byName.get(nameKey(r.name)) ?? [];
  if (named.length === 1) return named[0];
  if (named.length > 1) {
    const mine = agentId ? named.filter((c) => c.agentId === agentId) : [];
    return mine.length === 1 ? mine[0] : "ambiguous";
  }
  const phone = normalizePhone(r.phone), email = normalizeEmail(r.email);
  if (!phone && !email) return null;
  return all.find((c) => c.stage !== "CLIENT" && c.stage !== "FORMER" && ((phone && c.phoneNorm === phone) || (email && c.emailNorm === email))) ?? null;
}
