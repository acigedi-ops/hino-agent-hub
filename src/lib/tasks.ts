import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { fmtDate } from "@/lib/contacts";

export const TASK_KINDS = { manual: "Follow-up", requote: "Requote", renewal: "Renewal", cancel_notice: "Cancel notice", cancelled: "Cancelled" } as const;
export type TaskKind = keyof typeof TASK_KINDS;
/** The renewal and cancellation work list. */
export const RETENTION_KINDS: TaskKind[] = ["renewal", "cancel_notice", "cancelled"];
export const RENEWAL_WINDOW_DAYS = 30;

const DAY = 864e5;
/** Today's calendar date in the office's time zone, as a UTC midnight like the date columns. */
export function today(now = new Date()): Date {
  const [m, d, y] = now.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" }).split("/").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Agents see their own tasks. The owner sees everyone's. */
export const taskScope = (u: SessionUser) => (u.role === "ADMIN" ? {} : { assigneeId: u.id });

let lastSync = 0;
/**
 * Makes the tasks nobody has to write by hand: one for each active policy expiring within 30 days and one for each lost
 * quote whose requote date is coming up. Runs at most every few minutes; `autoKey` keeps it from making duplicates.
 */
export async function syncAutoTasks(force = false) {
  if (!force && Date.now() - lastSync < 5 * 60 * 1000) return;
  lastSync = Date.now();
  const t = today();
  const [policies, requotes] = await Promise.all([
    db.policy.findMany({
      where: { status: "ACTIVE", expirationDate: { gte: addDays(t, -RENEWAL_WINDOW_DAYS), lte: addDays(t, RENEWAL_WINDOW_DAYS) } },
      select: { id: true, carrier: true, policyNumber: true, expirationDate: true, contactId: true, contact: { select: { fullName: true, agentId: true } } },
    }),
    db.contact.findMany({ where: { stage: "LOST", requoteDate: { not: null, lte: addDays(t, RENEWAL_WINDOW_DAYS) } }, select: { id: true, fullName: true, agentId: true, requoteDate: true, lostReason: true } }),
  ]);
  const data = [
    ...policies.map((p) => ({
      kind: "renewal", autoKey: `renewal:${p.id}:${iso(p.expirationDate)}`, assigneeId: p.contact.agentId, contactId: p.contactId, policyId: p.id,
      title: `Renewal: call ${p.contact.fullName} about ${p.carrier} ${p.policyNumber}, expires ${fmtDate(p.expirationDate)}`,
      // Two weeks ahead leaves time to re-shop it.
      dueOn: new Date(Math.max(t.getTime(), addDays(p.expirationDate, -14).getTime())),
    })),
    ...requotes.map((c) => ({
      kind: "requote", autoKey: `requote:${c.id}:${iso(c.requoteDate!)}`, assigneeId: c.agentId, contactId: c.id, policyId: null,
      title: `Requote ${c.fullName}${c.lostReason ? ` (lost: ${c.lostReason})` : ""}`, dueOn: c.requoteDate!,
    })),
  ];
  if (data.length) await db.task.createMany({ data, skipDuplicates: true });
}

/** Open tasks that are due today or overdue, for the menu badge. */
export const dueCount = (u: SessionUser) => db.task.count({ where: { ...taskScope(u), doneAt: null, dueOn: { lte: today() } } });

/** A task the policy report makes for a cancel notice or a cancellation. */
export async function reportTask(kind: "cancel_notice" | "cancelled", p: { id: string; contactId: string }, policyLabel: string, when: Date | null, detail: string) {
  const c = await db.contact.findUnique({ where: { id: p.contactId }, select: { fullName: true, agentId: true } });
  if (!c) return;
  const autoKey = `${kind}:${p.id}:${when ? iso(when) : "unknown"}`;
  await db.task.createMany({
    data: [{
      kind, autoKey, assigneeId: c.agentId, contactId: p.contactId, policyId: p.id, dueOn: today(),
      title: kind === "cancel_notice" ? `Cancel notice: call ${c.fullName} about ${policyLabel}${detail}` : `Cancelled: ${policyLabel} for ${c.fullName}. Call to win it back or rewrite it`,
    }],
    skipDuplicates: true,
  });
}

/** Closes open tasks the hub made for a policy once the report shows the matter is settled. */
export const settleTasks = (policyId: string, kinds: TaskKind[], note: string) =>
  db.task.updateMany({ where: { policyId, kind: { in: kinds }, doneAt: null }, data: { doneAt: new Date(), doneNote: note } });
