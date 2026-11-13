import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

export const MAX_SUBJECT = 150;
export const MAX_BODY = 5000;

/** How many of this person's conversations have a message they have not opened. */
export async function unreadCount(userId: string): Promise<number> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM "ConversationMember" m JOIN "Conversation" c ON c."id" = m."conversationId"
    WHERE m."userId" = ${userId} AND c."lastAt" > m."lastReadAt"`;
  return Number(rows[0]?.n ?? 0);
}

/** Starts a conversation. `to` is checked against active users; the sender is always a member. */
export async function startConversation(u: SessionUser, to: string[], subject: string, body: string, contactId?: string | null) {
  const people = await db.user.findMany({ where: { id: { in: to.filter((id) => id !== u.id) }, active: true }, select: { id: true } });
  if (people.length === 0) return { error: "Choose at least one person to send to." } as const;
  const now = new Date();
  const c = await db.conversation.create({
    data: {
      subject, contactId: contactId || null, lastAt: now,
      members: { create: [{ userId: u.id, lastReadAt: now }, ...people.map((p) => ({ userId: p.id, lastReadAt: new Date(now.getTime() - 1) }))] },
      messages: { create: { senderId: u.id, body, createdAt: now } },
    },
  });
  return { id: c.id } as const;
}

export async function replyTo(u: SessionUser, conversationId: string, body: string) {
  const m = await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId, userId: u.id } } });
  if (!m) return { error: "Conversation not found." } as const;
  const now = new Date();
  await db.$transaction([
    db.message.create({ data: { conversationId, senderId: u.id, body, createdAt: now } }),
    db.conversation.update({ where: { id: conversationId }, data: { lastAt: now } }),
    db.conversationMember.update({ where: { conversationId_userId: { conversationId, userId: u.id } }, data: { lastReadAt: now } }),
  ]);
  return { ok: true } as const;
}

export const fmtWhen = (d: Date) =>
  d.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
