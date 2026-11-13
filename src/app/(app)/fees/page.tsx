import Link from "next/link";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/contacts";
import { AGENCY_FEE, AGENT_SHARE, FEE_STATUS, MAX_FEE } from "@/lib/fees";
import { feeMonth, paymentsConnected } from "@/lib/fee-ops";
import { today } from "@/lib/tasks";
import { createFeeLink, markFeesPaidOut, reviewAgencyFee, setFeeShare } from "@/app/fee-actions";
import { ActionForm } from "@/components/ActionForm";

const pacific = (d: Date) => d.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" });

export default async function Fees({ searchParams }: { searchParams: Promise<{ month?: string; contact?: string; fee?: string }> }) {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const sp = await searchParams;
  const month = feeMonth(sp.month ?? "") ? sp.month! : today().toISOString().slice(0, 7);
  const range = feeMonth(month)!;
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const step = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const mine = admin ? {} : { agentId: u.id };
  const connected = paymentsConnected();
  const include = { agent: { select: { id: true, name: true } }, contact: { select: { id: true, fullName: true } } };

  const [picked, people, open, fees, justMade] = await Promise.all([
    sp.contact ? db.contact.findFirst({ where: { id: sp.contact, ...contactScope(u) }, select: { id: true, fullName: true } }) : null,
    db.contact.findMany({ where: { ...contactScope(u), stage: { in: ["APPLICANT", "QUOTED", "CLIENT"] } }, orderBy: { updatedAt: "desc" }, take: 500, select: { fullName: true } }),
    db.agencyFee.findMany({ where: { ...mine, status: "PENDING" }, orderBy: { createdAt: "desc" }, include }),
    // A month's fees are the ones paid in it, so the payout follows the money.
    db.agencyFee.findMany({ where: { ...mine, status: { in: ["PAID", "REFUNDED"] }, paidAt: range }, orderBy: { paidAt: "desc" }, include }),
    sp.fee ? db.agencyFee.findFirst({ where: { id: sp.fee, ...mine }, include }) : null,
  ]);

  const byAgent = new Map<string, { name: string; paid: number; collected: number; share: number; owed: number; refunded: number }>();
  for (const f of fees) {
    const r = byAgent.get(f.agentId) ?? byAgent.set(f.agentId, { name: f.agent.name, paid: 0, collected: 0, share: 0, owed: 0, refunded: 0 }).get(f.agentId)!;
    if (f.status === "REFUNDED") { r.refunded++; continue; }
    r.paid++; r.collected += Number(f.amount); r.share += Number(f.agentShare);
    if (!f.paidOutAt) r.owed += Number(f.agentShare);
  }
  const rows = [...byAgent].map(([id, r]) => ({ id, ...r })).sort((a, b) => a.name.localeCompare(b.name));
  const sum = (k: "paid" | "collected" | "share" | "owed") => rows.reduce((n, r) => n + r[k], 0);
  const cards: [string, string | number][] = admin
    ? [["Fees paid", sum("paid")], ["Collected", fmtMoney(sum("collected"))], ["Agents earn", fmtMoney(sum("share"))], ["Agency keeps", fmtMoney(sum("collected") - sum("share"))]]
    : [["Fees paid", sum("paid")], ["Collected", fmtMoney(sum("collected"))], ["You earn", fmtMoney(sum("share"))], ["Still to be paid to you", fmtMoney(sum("owed"))]];

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="h1">Agency fee</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Create a payment link for the agency fee, then pay it with the client&apos;s card. Fees are only taken through the link. Once it is paid, the receipt is filed in the client&apos;s file{admin ? "." : ` and it counts toward your payout.`}
        </p>
      </div>
      {!connected && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          QuickBooks is not connected yet, so a fee is created without a payment link. {admin ? "Until it is connected you can mark a fee paid by hand below." : "The owner can mark a fee paid by hand until it is connected."}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="h2">New agency fee</h2>
        <ActionForm action={createFeeLink} submit="Create link" className="card space-y-3" buttonClass="btn-gold">
          <div className="flex flex-wrap items-end gap-3">
            {picked ? (
              <div className="min-w-0 flex-1 basis-64">
                <div className="label">Client</div>
                <div className="flex flex-wrap items-center gap-3 text-sm"><Link className="font-semibold underline" href={`/contacts/${picked.id}`}>{picked.fullName}</Link><Link className="text-xs underline" href="/fees">Choose someone else</Link></div>
                <input type="hidden" name="contactId" value={picked.id} />
              </div>
            ) : (
              <div className="min-w-0 flex-1 basis-64"><label className="label" htmlFor="name">Client first and last name</label>
                <input className="input" id="name" name="name" list="fee-clients" autoComplete="off" placeholder="Start typing to pick a client, or type a new name" required />
                <datalist id="fee-clients">{[...new Set(people.map((p) => p.fullName))].map((n) => <option key={n} value={n} />)}</datalist></div>
            )}
            <div><label className="label" htmlFor="amount">Amount ($)</label>
              <input className="input w-28" id="amount" name="amount" inputMode="decimal" defaultValue={AGENCY_FEE} aria-describedby="amount-hint" required /></div>
          </div>
          <p id="amount-hint" className="text-xs text-muted">The usual fee is {fmtMoney(AGENCY_FEE)}. You can change it, up to {fmtMoney(MAX_FEE)}. A name that is not in the hub yet gets its own applicant file.</p>
        </ActionForm>
      </section>

      {justMade && (
        <section className="card space-y-2 border-gold-dark">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="font-semibold">{fmtMoney(Number(justMade.amount))} agency fee for <Link className="underline" href={`/contacts/${justMade.contact.id}`}>{justMade.contact.fullName}</Link></div>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FEE_STATUS[justMade.status][1]}`}>{FEE_STATUS[justMade.status][0]}</span>
          </div>
          {justMade.payLink
            ? <a className="btn-gold" href={justMade.payLink} target="_blank" rel="noreferrer">Open payment page</a>
            : justMade.status === "PENDING" && <p className="text-sm text-muted">No payment link yet because QuickBooks is not connected.</p>}
          <div><a className="text-sm font-semibold underline" href={`/contacts/${justMade.contact.id}/fee-disclosure?amount=${Number(justMade.amount)}`} target="_blank">Print fee disclosure for {fmtMoney(Number(justMade.amount))}</a></div>
        </section>
      )}

      {open.length > 0 && (
        <section className="space-y-2">
          <h2 className="h2">Waiting for payment ({open.length})</h2>
          <div className="card p-0">
            {open.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3 text-sm last:border-0">
                <div className="min-w-0">
                  <Link className="font-semibold underline" href={`/contacts/${f.contact.id}`}>{f.contact.fullName}</Link>
                  <div className="text-xs text-muted">{fmtMoney(Number(f.amount))} · created {pacific(f.createdAt)}{admin ? ` · ${f.agent.name}` : ""}</div>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  {f.payLink && <a className="btn-quiet" href={f.payLink} target="_blank" rel="noreferrer">Open payment page</a>}
                  <ActionForm action={reviewAgencyFee} submit="Cancel" buttonClass="btn-quiet"><input type="hidden" name="feeId" value={f.id} /><input type="hidden" name="to" value="VOID" /></ActionForm>
                  {admin && <ActionForm action={reviewAgencyFee} submit="Mark paid" buttonClass="btn-gold"><input type="hidden" name="feeId" value={f.id} /><input type="hidden" name="to" value="PAID" /></ActionForm>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="h2">{admin ? "Month end" : "My fees"}: {label}</h2>
          <div className="flex items-center gap-2">
            <Link className="btn-quiet" href={`/fees?month=${step(-1)}`}>Previous</Link>
            <form className="flex items-center gap-2"><input className="input w-auto" name="month" type="month" defaultValue={month} aria-label="Month" /><button className="btn-quiet">Show</button></form>
            <Link className="btn-quiet" href={`/fees?month=${step(1)}`}>Next</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {cards.map(([l, v]) => <div key={l} className="card"><div className="text-2xl font-bold">{v}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{l}</div></div>)}
        </div>

        {admin && rows.length > 0 && (
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Agent</th><th className="th">Fees paid</th><th className="th">Refunded</th><th className="th">Collected</th><th className="th">Agent earns</th><th className="th">Still to pay</th><th className="th"></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="td font-semibold">{r.name}</td><td className="td">{r.paid}</td><td className="td">{r.refunded}</td>
                    <td className="td">{fmtMoney(r.collected)}</td><td className="td">{fmtMoney(r.share)}</td>
                    <td className={`td ${r.owed ? "font-semibold" : "text-muted"}`}>{r.owed ? fmtMoney(r.owed) : r.paid ? "Paid" : ""}</td>
                    <td className="td">{r.owed > 0 && (
                      <ActionForm action={markFeesPaidOut} submit={`Mark ${fmtMoney(r.owed)} paid`} buttonClass="btn-quiet"><input type="hidden" name="agentId" value={r.id} /><input type="hidden" name="month" value={month} /></ActionForm>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {admin && <p className="text-xs text-muted">Each paid fee starts at {fmtMoney(AGENT_SHARE)} for the agent. Change the figure on any single fee below. A refunded fee does not count. Press Mark paid once you have paid the agent.</p>}

        <div className="card overflow-x-auto p-0">
          {fees.length === 0 ? <p className="p-4 text-sm text-muted">No fees were paid in {label}.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Client</th><th className="th">Paid</th><th className="th">Amount</th>{admin && <th className="th">Agent</th>}<th className="th">Status</th><th className="th">Agent earns</th>{admin && <th className="th"></th>}</tr></thead>
              <tbody>
                {fees.map((f) => (
                  <tr key={f.id} className="border-b border-line last:border-0">
                    <td className="td"><Link className="font-semibold underline" href={`/contacts/${f.contact.id}`}>{f.contact.fullName}</Link></td>
                    <td className="td whitespace-nowrap">{f.paidAt ? pacific(f.paidAt) : ""}</td><td className="td">{fmtMoney(Number(f.amount))}</td>{admin && <td className="td">{f.agent.name}</td>}
                    <td className="td"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${FEE_STATUS[f.status][1]}`}>{FEE_STATUS[f.status][0]}</span></td>
                    <td className="td">
                      {f.status !== "PAID" ? "" : f.paidOutAt ? `${fmtMoney(Number(f.agentShare))}, paid ${pacific(f.paidOutAt)}` : admin ? (
                        <ActionForm action={setFeeShare} submit="Save" className="flex items-start gap-1" buttonClass="btn-quiet">
                          <input type="hidden" name="feeId" value={f.id} />
                          <input className="input w-20" name="share" inputMode="decimal" defaultValue={Number(f.agentShare)} aria-label={`Agent earns for ${f.contact.fullName}`} />
                        </ActionForm>
                      ) : fmtMoney(Number(f.agentShare))}
                    </td>
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
