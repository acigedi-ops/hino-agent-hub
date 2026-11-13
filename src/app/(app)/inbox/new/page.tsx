import Link from "next/link";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { MAX_BODY, MAX_SUBJECT } from "@/lib/messages";
import { sendMessage } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

export default async function NewMessage({ searchParams }: { searchParams: Promise<{ contact?: string }> }) {
  const u = await requireUser();
  const { contact: contactId } = await searchParams;
  const [people, contact] = await Promise.all([
    db.user.findMany({ where: { active: true, id: { not: u.id } }, orderBy: [{ role: "asc" }, { name: "asc" }], select: { id: true, name: true, role: true } }),
    contactId ? db.contact.findFirst({ where: { id: contactId, ...contactScope(u) }, select: { id: true, fullName: true, agentId: true } }) : null,
  ]);
  // A message about a contact most often goes to the owner, or from the owner to that contact's agent.
  const preselect = new Set(contact ? people.filter((p) => (u.role === "ADMIN" ? p.id === contact.agentId : p.role === "ADMIN")).map((p) => p.id) : []);
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <Link href="/inbox" className="text-sm underline">Back to inbox</Link>
        <h1 className="h1 mt-1">New message</h1>
      </div>
      <ActionForm action={sendMessage} submit="Send" className="card space-y-3" buttonClass="btn-gold">
        {contact && (
          <p className="rounded-md bg-black/[0.04] px-3 py-2 text-sm">About <Link className="font-semibold underline" href={`/contacts/${contact.id}`}>{contact.fullName}</Link>
            <input type="hidden" name="contactId" value={contact.id} /></p>
        )}
        <fieldset>
          <legend className="label">Send to</legend>
          {people.length === 0 && <p className="text-sm text-muted">There is nobody else in the hub yet.</p>}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="to" value={p.id} defaultChecked={preselect.has(p.id)} />
                {p.name}{p.role === "ADMIN" && <span className="text-xs text-muted">(owner)</span>}
              </label>
            ))}
          </div>
          {people.length > 1 && <p className="mt-1 text-xs text-muted">If you tick more than one person, everyone ticked sees the message and all replies.</p>}
        </fieldset>
        <div><label className="label" htmlFor="subject">Subject</label>
          <input className="input" id="subject" name="subject" maxLength={MAX_SUBJECT} defaultValue={contact ? `About ${contact.fullName}` : ""} required /></div>
        <div><label className="label" htmlFor="body">Message</label>
          <textarea className="input" id="body" name="body" rows={6} maxLength={MAX_BODY} required /></div>
      </ActionForm>
    </div>
  );
}
