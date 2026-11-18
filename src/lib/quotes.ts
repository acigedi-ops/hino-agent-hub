import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { today } from "@/lib/tasks";

/** The owner sees every request; an agent sees their own. */
export const quoteScope = (u: SessionUser) => (u.role === "ADMIN" ? {} : { agentId: u.id });

/** The menu count: requests waiting on this person. The owner waits on Sent and Accepted, an agent on Need info and Quote ready. */
export async function quoteWaiting(u: SessionUser): Promise<number> {
  return db.quoteRequest.count({ where: u.role === "ADMIN" ? { status: { in: ["SENT", "ACCEPTED"] }, closedAt: null } : { agentId: u.id, status: { in: ["NEED_INFO", "QUOTED"] } } });
}

export const firstOwner = () => db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });

/** Puts one To do item about a request in front of a person, and closes the earlier ones about the same request. */
export async function quoteTask(requestId: string, step: string, assigneeId: string | null | undefined, title: string, byId: string) {
  await db.task.updateMany({ where: { autoKey: { startsWith: `quote:${requestId}:` }, doneAt: null }, data: { doneAt: new Date(), doneNote: "Moved on in Quote Desk" } });
  if (!assigneeId) return;
  const autoKey = `quote:${requestId}:${step}:${Date.now()}`;
  await db.task.create({ data: { kind: "quote", autoKey, title, dueOn: today(), assigneeId, createdById: byId } });
}
