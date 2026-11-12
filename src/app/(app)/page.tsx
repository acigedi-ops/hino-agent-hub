import Link from "next/link";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { STAGES, daysUntil, fmtDate, fmtMoney } from "@/lib/contacts";
import { assistantEnabled } from "@/lib/assistant";
import { AssistantBox } from "@/components/AssistantBox";

export default async function Home() {
  const u = await requireUser();
  const scope = contactScope(u);
  const soon = new Date(Date.now() + 90 * 864e5);
  const [byStage, renewals, requotes, premium] = await Promise.all([
    db.contact.groupBy({ by: ["stage"], where: scope, _count: true }),
    db.policy.findMany({
      where: { status: "ACTIVE", expirationDate: { lte: soon }, contact: scope },
      include: { contact: { include: { agent: true } } }, orderBy: { expirationDate: "asc" }, take: 50,
    }),
    db.contact.findMany({
      where: { ...scope, stage: "LOST", requoteDate: { lte: new Date(Date.now() + 30 * 864e5) } },
      orderBy: { requoteDate: "asc" }, take: 20,
    }),
    db.policy.aggregate({ where: { status: "ACTIVE", contact: scope }, _sum: { premium: true }, _count: true }),
  ]);
  const count = (k: string) => byStage.find((b) => b.stage === k)?._count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Welcome, {u.name.split(" ")[0]}</h1>
        <Link href="/contacts/new" className="btn-gold">+ New applicant</Link>
      </div>

      <AssistantBox enabled={assistantEnabled()} firstName={u.name.split(" ")[0]} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {STAGES.map((s) => (
          <Link key={s.key} href={s.key === "CLIENT" ? "/clients" : `/pipeline?stage=${s.key}`} className="card hover:border-gold-dark">
            <div className="text-2xl font-bold">{count(s.key)}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</div>
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="text-sm text-muted">Premium in force{u.role === "ADMIN" ? " (all agents)" : ""}</div>
        <div className="text-2xl font-bold">{fmtMoney(Number(premium._sum.premium ?? 0))}</div>
        <div className="text-xs text-muted">{premium._count} active {premium._count === 1 ? "policy" : "policies"}</div>
      </div>

      <section className="space-y-2">
        <h2 className="h2">Renewals in the next 90 days</h2>
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
      </section>

      <section className="space-y-2">
        <h2 className="h2">Lost quotes to try again</h2>
        <div className="card">
          {requotes.length === 0 ? <p className="text-sm text-muted">No requote dates in the next 30 days.</p> : (
            <ul className="space-y-1 text-sm">
              {requotes.map((c) => (
                <li key={c.id}><Link className="font-semibold underline" href={`/contacts/${c.id}`}>{c.fullName}</Link> requote on {fmtDate(c.requoteDate)} ({c.lostReason})</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
