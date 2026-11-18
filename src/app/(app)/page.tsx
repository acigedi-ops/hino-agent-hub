import Link from "next/link";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { daysUntil, fmtDate } from "@/lib/contacts";
import { REQUIRED_AGENT_DOCS, docState, needsAction } from "@/lib/agent-docs";
import { assistantEnabled } from "@/lib/assistant";
import { unreadCount } from "@/lib/messages";
import { syncAutoTasks, taskScope, today } from "@/lib/tasks";
import { TaskRow } from "@/components/TaskRow";
import { AssistantBox } from "@/components/AssistantBox";

export default async function Home() {
  const u = await requireUser();
  const scope = contactScope(u);
  const soon = new Date(Date.now() + 90 * 864e5);
  const renewalWhere = { status: "ACTIVE" as const, expirationDate: { lte: soon }, contact: scope };
  const [renewalTotal, renewals] = await Promise.all([
    db.policy.count({ where: renewalWhere }),
    db.policy.findMany({
      where: renewalWhere,
      include: { contact: { include: { agent: true } } }, orderBy: { expirationDate: "asc" }, take: 50,
    }),
  ]);
  const myDocs = u.role === "AGENT" ? await db.agentDocument.findMany({ where: { userId: u.id }, select: { kind: true, status: true, expiresOn: true, createdAt: true } }) : [];
  const docsToDo = u.role === "AGENT" ? REQUIRED_AGENT_DOCS.filter((k) => needsAction(docState(myDocs, k))) : [];
  const docsToReview = u.role === "ADMIN" ? await db.agentDocument.count({ where: { status: "PENDING" } }) : 0;
  const unread = await unreadCount(u.id);
  await syncAutoTasks();
  const t = today();
  const dueWhere = { ...taskScope(u), doneAt: null, dueOn: { lte: t } };
  const [dueTasks, dueTotal] = await Promise.all([
    db.task.findMany({
      where: dueWhere, orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }], take: 8,
      include: { assignee: { select: { name: true } }, contact: { select: { id: true, fullName: true, phone: true } }, policy: { select: { premium: true, expirationDate: true } } },
    }),
    db.task.count({ where: dueWhere }),
  ]);

  const count = (n: number) => <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${n ? "bg-red-50 text-red-700" : "text-red-700"}`}>{n}</span>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Welcome, {u.name.split(" ")[0]}</h1>
        <Link href="/contacts/new" className="btn-gold">+ New applicant</Link>
      </div>

      {unread > 0 && (
        <Link href="/inbox" className="block rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:underline">
          You have {unread} unread {unread === 1 ? "message" : "messages"} in your inbox.
        </Link>
      )}
      {docsToDo.length > 0 && (
        <Link href="/documents" className="block rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:underline">
          Your {docsToDo.join(" and ")} {docsToDo.length === 1 ? "needs" : "need"} attention. Open My documents to upload.
        </Link>
      )}
      {docsToReview > 0 && (
        <Link href="/admin/documents" className="block rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:underline">
          {docsToReview} agent {docsToReview === 1 ? "document is" : "documents are"} waiting for your approval.
        </Link>
      )}

      {/* Each part of Home opens on a tap. The red numbers show what is waiting without opening anything. */}
      <details className="group space-y-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 [&::-webkit-details-marker]:hidden">
          <h2 className="h2">To do today</h2>{count(dueTotal)}<span className="ml-auto text-xs font-semibold text-muted group-open:hidden">Show</span><span className="ml-auto hidden text-xs font-semibold text-muted group-open:inline">Hide</span>
        </summary>
        <p className="text-right text-sm"><Link className="font-semibold underline" href="/tasks">All tasks</Link></p>
        <div className="card p-0">
          {dueTasks.length === 0 ? <p className="p-4 text-sm text-muted">Nothing due today.</p> : dueTasks.map((x) => <TaskRow key={x.id} t={x} today={t} showAgent={u.role === "ADMIN"} />)}
          {dueTotal > dueTasks.length && <p className="border-t border-line p-3 text-sm"><Link className="font-semibold underline" href="/tasks">See the other {dueTotal - dueTasks.length}</Link></p>}
        </div>
      </details>

      <details className="group space-y-2">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-line bg-white px-4 py-3 [&::-webkit-details-marker]:hidden">
          <h2 className="h2">Renewals in the next 90 days</h2>{count(renewalTotal)}<span className="ml-auto text-xs font-semibold text-muted group-open:hidden">Show</span><span className="ml-auto hidden text-xs font-semibold text-muted group-open:inline">Hide</span>
        </summary>
        <div className="card overflow-x-auto p-0">
          {renewals.length === 0 ? <p className="p-4 text-sm text-muted">Nothing is renewing in the next 90 days.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-line">
                <th className="th">Client</th><th className="th">Carrier</th><th className="th">Policy</th>
                <th className="th">Expires</th><th className="th">Days</th>{u.role === "ADMIN" && <th className="th">Agent</th>}
              </tr></thead>
              <tbody>
                {renewals.map((p) => {
                  const d = daysUntil(p.expirationDate);
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="td"><Link className="font-semibold underline" href={`/contacts/${p.contactId}`}>{p.contact.fullName}</Link></td>
                      <td className="td">{p.carrier}</td><td className="td">{p.policyNumber}</td>
                      <td className="td">{fmtDate(p.expirationDate)}</td>
                      <td className={`td font-semibold ${d <= 30 ? "text-red-700" : ""}`}>{d < 0 ? `${-d} overdue` : d}</td>
                      {u.role === "ADMIN" && <td className="td">{p.contact.agent.name}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </details>

      <AssistantBox enabled={assistantEnabled()} firstName={u.name.split(" ")[0]} />
    </div>
  );
}
