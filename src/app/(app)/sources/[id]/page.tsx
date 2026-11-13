import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/contacts";
import { updateReferralSource } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { SourceFields } from "@/components/SourceFields";
import { StageBadge } from "@/components/StageBadge";

export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const src = await db.referralSource.findUnique({ where: { id }, include: { createdBy: { select: { name: true } } } });
  if (!src) notFound();
  const people = await db.contact.findMany({
    where: { referralSourceId: id, ...contactScope(u) }, orderBy: { createdAt: "desc" },
    include: { agent: { select: { name: true } }, policies: { orderBy: { effectiveDate: "desc" } } },
  });
  const policies = people.flatMap((c) => c.policies.map((p) => ({ ...p, client: c })));
  const active = policies.filter((p) => p.status === "ACTIVE");
  const premium = active.reduce((n, p) => n + Number(p.premium), 0);
  const canEdit = u.role === "ADMIN" || src.createdById === u.id;
  const admin = u.role === "ADMIN";
  const stats: [string, string | number][] = [["People sent", people.length], ["Became clients", people.filter((c) => c.policies.length > 0).length], ["Active policies", active.length], ["Premium in force", fmtMoney(premium)]];
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/sources" className="text-sm underline">Back to referral sources</Link>
        <h1 className="h1 mt-1">{src.name}</h1>
        <p className="text-sm text-muted">{[src.kind, src.contactName, src.phone, src.email, src.address].filter(Boolean).join(" · ")}</p>
        {src.notes && <p className="mt-1 whitespace-pre-wrap text-sm">{src.notes}</p>}
        <p className="mt-1 text-xs text-muted">Added by {src.createdBy.name} on {fmtDate(src.createdAt)}.{admin ? "" : " You see your own applicants and clients here."}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, v]) => (
          <div key={label} className="card"><div className="text-2xl font-bold">{v}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div></div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="h2">Policies from this source</h2>
        <div className="card overflow-x-auto p-0">
          {policies.length === 0 ? <p className="p-4 text-sm text-muted">No policies yet from people this source sent.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-line">
                <th className="th">Client</th><th className="th">Carrier</th><th className="th">Line</th><th className="th">Policy</th>
                <th className="th">Premium</th><th className="th">Effective</th><th className="th">Expires</th><th className="th">Status</th>{admin && <th className="th">Agent</th>}
              </tr></thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="td"><Link className="font-semibold underline" href={`/contacts/${p.client.id}`}>{p.client.fullName}</Link></td>
                    <td className="td">{p.carrier}</td><td className="td">{p.line}</td><td className="td">{p.policyNumber}</td>
                    <td className="td">{fmtMoney(Number(p.premium))}</td><td className="td">{fmtDate(p.effectiveDate)}</td><td className="td">{fmtDate(p.expirationDate)}</td>
                    <td className="td">{p.status === "ACTIVE" ? "Active" : p.status === "CANCELLED" ? "Cancelled" : "Expired"}</td>
                    {admin && <td className="td">{p.client.agent.name}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="h2">Everyone this source sent</h2>
        <div className="card overflow-x-auto p-0">
          {people.length === 0 ? <p className="p-4 text-sm text-muted">Nobody yet. Pick this source when you add an applicant.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Name</th><th className="th">Stage</th><th className="th">Added</th>{admin && <th className="th">Agent</th>}</tr></thead>
              <tbody>
                {people.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0">
                    <td className="td"><Link className="font-semibold underline" href={`/contacts/${c.id}`}>{c.fullName}</Link></td>
                    <td className="td"><StageBadge stage={c.stage} /></td><td className="td">{fmtDate(c.createdAt)}</td>
                    {admin && <td className="td">{c.agent.name}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {canEdit && (
        <section className="space-y-2">
          <h2 className="h2">Edit details</h2>
          <ActionForm action={updateReferralSource} submit="Save" className="card space-y-3"><input type="hidden" name="id" value={src.id} /><SourceFields v={src} /></ActionForm>
        </section>
      )}
    </div>
  );
}
