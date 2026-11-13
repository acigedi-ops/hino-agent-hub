import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtWhen } from "@/lib/messages";

export default async function Inbox() {
  const u = await requireUser();
  const rows = await db.conversationMember.findMany({
    where: { userId: u.id }, orderBy: { conversation: { lastAt: "desc" } }, take: 200,
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
          messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="h1">Inbox</h1>
          <p className="mt-1 text-sm text-muted">Messages between you and the rest of the office. Only the people in a conversation can read it.</p>
        </div>
        <Link href="/inbox/new" className="btn-gold">+ New message</Link>
      </div>
      <div className="card p-0">
        {rows.length === 0 && <p className="p-4 text-sm text-muted">No messages yet.</p>}
        {rows.map(({ conversation: c, lastReadAt }) => {
          const unread = c.lastAt > lastReadAt;
          const last = c.messages[0];
          const others = c.members.filter((m) => m.userId !== u.id).map((m) => m.user.name).join(", ");
          return (
            <Link key={c.id} href={`/inbox/${c.id}`} className="flex items-start gap-3 border-b border-line p-3 last:border-0 hover:bg-black/[0.03]">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${unread ? "bg-gold-dark" : "bg-transparent"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>{others || "Only you"}</span>
                  <span className="shrink-0 text-xs text-muted">{fmtWhen(c.lastAt)}</span>
                </div>
                <div className={`truncate text-sm ${unread ? "font-semibold" : ""}`}>{c.subject}{unread && <span className="sr-only"> (unread)</span>}</div>
                {last && <div className="truncate text-xs text-muted">{last.sender.id === u.id ? "You" : last.sender.name.split(" ")[0]}: {last.body}</div>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
