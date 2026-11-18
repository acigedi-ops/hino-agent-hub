import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDate } from "@/lib/contacts";
import { fmtSize } from "@/lib/documents";
import { DOC_STATE_LABEL, DOC_STATE_TONE, REQUIRED_AGENT_DOCS, docState } from "@/lib/agent-docs";
import { reviewAgentDocument } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

export default async function AgentDocuments() {
  await requireAdmin();
  const [users, docs] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } }),
    db.agentDocument.findMany({
      orderBy: { createdAt: "desc" }, take: 500,
      select: { id: true, userId: true, kind: true, filename: true, size: true, status: true, reviewNote: true, expiresOn: true, createdAt: true, user: { select: { name: true } } },
    }),
  ]);
  const pending = docs.filter((d) => d.status === "PENDING");
  const agents = users.filter((x) => x.role === "AGENT");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="h1">Agent documents</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Each agent uploads a W-9 and a producer license under My documents. Open the file, then approve it or reject it with a short reason the agent will see.</p>
      </div>

      <section className="space-y-2">
        <h2 className="h2">Waiting for your review ({pending.length})</h2>
        <div className="card space-y-3">
          {pending.length === 0 && <p className="text-sm text-muted">Nothing is waiting.</p>}
          {pending.map((d) => (
            <div key={d.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 text-sm last:border-0 last:pb-0">
              <div className="min-w-0">
                <div className="font-semibold">{d.user.name} · {d.kind}</div>
                <div className="truncate text-xs text-muted">{d.filename} · {fmtSize(d.size)} · uploaded {fmtDate(d.createdAt)}{d.expiresOn ? ` · expires ${fmtDate(d.expiresOn)}` : ""}</div>
                <a className="btn-quiet mt-2" href={`/documents/${d.id}`} target="_blank">Open file</a>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <ActionForm action={reviewAgentDocument} submit="Approve" buttonClass="btn-gold">
                  <input type="hidden" name="documentId" value={d.id} /><input type="hidden" name="decision" value="approve" />
                </ActionForm>
                <ActionForm action={reviewAgentDocument} submit="Reject" buttonClass="btn-quiet" className="flex flex-wrap items-start gap-2">
                  <input type="hidden" name="documentId" value={d.id} /><input type="hidden" name="decision" value="reject" />
                  <input className="input w-56" name="note" placeholder="Reason, for example: not signed" aria-label={`Reason for rejecting ${d.kind} from ${d.user.name}`} />
                </ActionForm>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="h2">Where each agent stands</h2>
        <div className="card overflow-x-auto p-0">
          {agents.length === 0 ? <p className="p-4 text-sm text-muted">No agent logins yet.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Agent</th>{REQUIRED_AGENT_DOCS.map((k) => <th key={k} className="th">{k}</th>)}<th className="th">License expires</th></tr></thead>
              <tbody>
                {agents.map((a) => {
                  const mine = docs.filter((d) => d.userId === a.id);
                  const license = mine.find((d) => d.kind === "Producer license" && d.status !== "REJECTED");
                  return (
                    <tr key={a.id} className="border-b border-line last:border-0">
                      <td className="td font-semibold">{a.name}</td>
                      {REQUIRED_AGENT_DOCS.map((k) => {
                        const state = docState(mine, k);
                        const latest = mine.find((d) => d.kind === k);
                        return (
                          <td key={k} className="td">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${DOC_STATE_TONE[state]}`}>{DOC_STATE_LABEL[state]}</span>
                            {latest && <a className="ml-2 text-xs underline" href={`/documents/${latest.id}`} target="_blank">Open</a>}
                          </td>
                        );
                      })}
                      <td className="td whitespace-nowrap">{fmtDate(license?.expiresOn)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
