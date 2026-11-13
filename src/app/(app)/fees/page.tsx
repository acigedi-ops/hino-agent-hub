import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/contacts";
import { AGENCY_FEE, AGENT_SHARE, FEE_DISCLOSURE_KIND, FEE_STATUS } from "@/lib/fees";
import { today } from "@/lib/tasks";
import { markFeesPaidOut, reviewAgencyFee } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

export default async function Fees({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : today().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const d0 = new Date(Date.UTC(y, m - 1, 1)), d1 = new Date(Date.UTC(y, m, 1));
  const label = d0.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const step = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const mine = admin ? {} : { agentId: u.id };
  const contactSel = { select: { id: true, fullName: true, documents: { where: { kind: FEE_DISCLOSURE_KIND }, select: { id: true }, take: 1 } } };

  const [fees, pending, newPolicies] = await Promise.all([
    db.agencyFee.findMany({ where: { ...mine, collectedOn: { gte: d0, lt: d1 } }, orderBy: { collectedOn: "desc" }, include: { agent: { select: { id: true, name: true } }, contact: contactSel } }),
    admin ? db.agencyFee.findMany({ where: { status: "PENDING" }, orderBy: { collectedOn: "asc" }, include: { agent: { select: { id: true, name: true } }, contact: contactSel } }) : [],
    // New business this month, to spot policies sold without a fee.
    db.policy.findMany({
      where: { writtenDate: { gte: d0, lt: d1 }, contact: admin ? {} : { agentId: u.id } }, orderBy: { writtenDate: "asc" },
      select: { id: true, carrier: true, policyNumber: true, writtenDate: true, contact: { select: { id: true, fullName: true, agent: { select: { name: true } }, agencyFees: { where: { status: { in: ["PENDING", "PAID"] } }, select: { id: true } }, policies: { select: { id: true, writtenDate: true } } } } },
    }),
  ]);
  // A client owes one fee per new policy. Flag a policy when the client has fewer live fees than policies written up to it.
  const missing = newPolicies.filter((p) => {
    const before = p.contact.policies.filter((x) => (x.writtenDate?.getTime() ?? 0) < (p.writtenDate?.getTime() ?? 0) || (x.writtenDate?.getTime() === p.writtenDate?.getTime() && x.id <= p.id)).length;
    return p.contact.agencyFees.length < before;
  });

  const byAgent = new Map<string, { name: string; paid: number; pending: number; collected: number; share: number; owed: number; owedCount: number; refunded: number }>();
  for (const f of fees) {
    const r = byAgent.get(f.agentId) ?? byAgent.set(f.agentId, { name: f.agent.name, paid: 0, pending: 0, collected: 0, share: 0, owed: 0, owedCount: 0, refunded: 0 }).get(f.agentId)!;
    if (f.status === "PAID") {
      r.paid++; r.collected += Number(f.amount); r.share += Number(f.agentShare);
      if (!f.paidOutAt) { r.owed += Number(f.agentShare); r.owedCount++; }
    } else if (f.status === "PENDING") r.pending++;
    else if (f.status === "REFUNDED") r.refunded++;
  }
  const rows = [...byAgent].map(([id, r]) => ({ id, ...r })).sort((a, b) => a.name.localeCompare(b.name));
  const sum = (k: "paid" | "pending" | "collected" | "share" | "owed") => rows.reduce((n, r) => n + r[k], 0);
  const cards: [string, string | number][] = admin
    ? [["Fees confirmed", sum("paid")], ["Collected", fmtMoney(sum("collected"))], ["Owed to agents", fmtMoney(sum("owed"))], ["Agency keeps", fmtMoney(sum("collected") - sum("share"))]]
    : [["Fees confirmed", sum("paid")], ["Waiting for owner", sum("pending")], ["You earned", fmtMoney(sum("share"))], ["Still to be paid to you", fmtMoney(sum("owed"))]];
  const noDisclosure = (c: { documents: { id: string }[] }) => c.documents.length === 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Agency fees</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            All new business is charged a ${AGENCY_FEE} agency fee, and the agent earns ${AGENT_SHARE} of each one. The agent logs the fee on the client&apos;s page, {admin ? "you confirm the money arrived, and it then counts toward their payout." : "the owner confirms the money arrived, and it then counts toward your payout."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-quiet" href={`/fees?month=${step(-1)}`}>Previous</Link>
          <form className="flex items-center gap-2"><input className="input w-auto" name="month" type="month" defaultValue={month} aria-label="Month" /><button className="btn-quiet">Show</button></form>
          <Link className="btn-quiet" href={`/fees?month=${step(1)}`}>Next</Link>
        </div>
      </div>

      {admin && pending.length > 0 && (
        <section className="space-y-2">
          <h2 className="h2">Waiting for you to confirm ({pending.length})</h2>
          <div className="card p-0">
            {pending.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3 text-sm last:border-0">
                <div className="min-w-0">
                  <Link className="font-semibold underline" href={`/contacts/${f.contact.id}`}>{f.contact.fullName}</Link>
                  <div className="text-xs text-muted">{fmtMoney(Number(f.amount))} · {f.method} · collected {fmtDate(f.collectedOn)} · {f.agent.name}{f.note ? ` · ${f.note}` : ""}</div>
                  {noDisclosure(f.contact) && <div className="text-xs font-semibold text-red-700">No signed fee disclosure on file</div>}
                </div>
                <div className="flex gap-2">
                  <ActionForm action={reviewAgencyFee} submit="Not received" buttonClass="btn-quiet"><input type="hidden" name="feeId" value={f.id} /><input type="hidden" name="to" value="VOID" /></ActionForm>
                  <ActionForm action={reviewAgencyFee} submit="Confirm received" buttonClass="btn-gold"><input type="hidden" name="feeId" value={f.id} /><input type="hidden" name="to" value="PAID" /></ActionForm>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([l, v]) => <div key={l} className="card"><div className="text-2xl font-bold">{v}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{l} · {label}</div></div>)}
      </div>

      {admin && (
        <section className="space-y-2">
          <h2 className="h2">Payout for {label}</h2>
          <div className="card overflow-x-auto p-0">
            {rows.length === 0 ? <p className="p-4 text-sm text-muted">No fees logged in {label}.</p> : (
              <table className="w-full">
                <thead><tr className="border-b border-line"><th className="th">Agent</th><th className="th">Confirmed</th><th className="th">Waiting</th><th className="th">Refunded</th><th className="th">Collected</th><th className="th">Agent earns</th><th className="th">Still to pay</th><th className="th"></th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="td font-semibold">{r.name}</td><td className="td">{r.paid}</td><td className="td">{r.pending}</td><td className="td">{r.refunded}</td>
                      <td className="td">{fmtMoney(r.collected)}</td><td className="td">{fmtMoney(r.share)}</td>
                      <td className={`td ${r.owed ? "font-semibold" : "text-muted"}`}>{r.owed ? fmtMoney(r.owed) : "Paid"}</td>
                      <td className="td">{r.owedCount > 0 && (
                        <ActionForm action={markFeesPaidOut} submit={`Mark ${fmtMoney(r.owed)} paid`} buttonClass="btn-quiet"><input type="hidden" name="agentId" value={r.id} /><input type="hidden" name="month" value={month} /></ActionForm>
                      )}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p className="text-xs text-muted">Only confirmed fees count. A refunded fee comes off the agent&apos;s count. Press Mark paid once you have paid the agent, so next time you only see what is new.</p>
        </section>
      )}

      {missing.length > 0 && (
        <section className="space-y-2">
          <h2 className="h2">New policies with no fee logged ({missing.length})</h2>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Client</th><th className="th">Carrier</th><th className="th">Policy</th><th className="th">Effective</th>{admin && <th className="th">Agent</th>}</tr></thead>
              <tbody>
                {missing.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="td"><Link className="font-semibold underline" href={`/contacts/${p.contact.id}`}>{p.contact.fullName}</Link></td>
                    <td className="td">{p.carrier}</td><td className="td">{p.policyNumber}</td><td className="td">{fmtDate(p.writtenDate)}</td>{admin && <td className="td">{p.contact.agent.name}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="h2">Fees in {label}</h2>
        <div className="card overflow-x-auto p-0">
          {fees.length === 0 ? <p className="p-4 text-sm text-muted">No fees logged in {label}. Log one from a client&apos;s page under Agency fee.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Client</th><th className="th">Collected</th><th className="th">Paid by</th>{admin && <th className="th">Agent</th>}<th className="th">Status</th><th className="th">Agent payout</th>{admin && <th className="th"></th>}</tr></thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-line last:border-0">
                    <td className="td"><Link className="font-semibold underline" href={`/contacts/${f.contact.id}`}>{f.contact.fullName}</Link>{noDisclosure(f.contact) && <div className="text-xs text-red-700">No signed disclosure</div>}</td>
                    <td className="td">{fmtDate(f.collectedOn)}</td><td className="td">{f.method}</td>{admin && <td className="td">{f.agent.name}</td>}
                    <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FEE_STATUS[f.status][1]}`}>{FEE_STATUS[f.status][0]}</span></td>
                    <td className="td">{f.status !== "PAID" ? "" : f.paidOutAt ? `Paid ${fmtDate(f.paidOutAt)}` : fmtMoney(Number(f.agentShare))}</td>
                    {admin && <td className="td">{f.status === "PAID" && !f.paidOutAt && (
                      <ActionForm action={reviewAgencyFee} submit="Refund" buttonClass="btn-quiet"><input type="hidden" name="feeId" value={f.id} /><input type="hidden" name="to" value="REFUNDED" /></ActionForm>
                    )}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
