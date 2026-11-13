import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { MAX_BODY, fmtWhen } from "@/lib/messages";
import { replyMessage } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  // Membership is the only way in, including for the owner.
  const me = await db.conversationMember.findUnique({ where: { conversationId_userId: { conversationId: id, userId: u.id } } });
  if (!me) notFound();
  const c = await db.conversation.findUniqueOrThrow({
    where: { id },
    include: {
      members: { include: { user: { select: { id: true, name: true } } } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, name: true } } } },
    },
  });
  const contact = c.contactId ? await db.contact.findFirst({ where: { id: c.contactId, ...contactScope(u) }, select: { id: true, fullName: true } }) : null;
  if (c.lastAt > me.lastReadAt) await db.conversationMember.update({ where: { conversationId_userId: { conversationId: id, userId: u.id } }, data: { lastReadAt: new Date() } });
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/inbox" className="text-sm underline">Back to inbox</Link>
        <h1 className="h1 mt-1 break-words">{c.subject}</h1>
        <p className="mt-1 text-sm text-muted">Between {c.members.map((m) => (m.userId === u.id ? "you" : m.user.name)).join(", ")}
          {contact && <> · about <Link className="font-semibold underline" href={`/contacts/${contact.id}`}>{contact.fullName}</Link></>}</p>
      </div>
      <div className="space-y-3">
        {c.messages.map((m) => {
          const mine = m.sender.id === u.id;
          const fresh = !mine && m.createdAt > me.lastReadAt;
          return (
            <div key={m.id} className={`card ${mine ? "ml-8 bg-black/[0.03]" : "mr-8"} ${fresh ? "border-gold-dark" : ""}`}>
              <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
                <span className="font-semibold text-ink">{mine ? "You" : m.sender.name}{fresh && <span className="ml-2 rounded-full bg-gold px-1.5 py-0.5 font-bold text-ink">New</span>}</span>
                <span>{fmtWhen(m.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">{m.body}</p>
            </div>
          );
        })}
      </div>
      <ActionForm key={c.messages.length} action={replyMessage} submit="Send reply" className="card space-y-3" buttonClass="btn-gold">
        <input type="hidden" name="conversationId" value={c.id} />
        <div><label className="label" htmlFor="body">Reply</label>
          <textarea className="input" id="body" name="body" rows={4} maxLength={MAX_BODY} required /></div>
      </ActionForm>
    </div>
  );
}
