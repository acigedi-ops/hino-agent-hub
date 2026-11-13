import Link from "next/link";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { fmtMoney } from "@/lib/contacts";
import { createReferralSource } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { SourceFields } from "@/components/SourceFields";

export default async function Sources() {
  const u = await requireUser();
  const scope = contactScope(u);
  const [sources, people, policies] = await Promise.all([
    db.referralSource.findMany({ orderBy: { name: "asc" } }),
    db.contact.groupBy({ by: ["referralSourceId"], where: { ...scope, referralSourceId: { not: null } }, _count: true }),
    db.policy.findMany({ where: { status: "ACTIVE", contact: { ...scope, referralSourceId: { not: null } } }, select: { premium: true, contact: { select: { referralSourceId: true } } } }),
  ]);
  const sent = new Map(people.map((p) => [p.referralSourceId, p._count]));
  const pol = new Map<string, { n: number; premium: number }>();
  for (const p of policies) {
    const k = p.contact.referralSourceId!;
    const cur = pol.get(k) ?? { n: 0, premium: 0 };
    pol.set(k, { n: cur.n + 1, premium: cur.premium + Number(p.premium) });
  }
  const mine = u.role === "ADMIN" ? "" : "your ";
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="h1">Referral sources</h1>
        <p className="mt-1 text-sm text-muted">Businesses that send us people, like dealerships, lawyers and real estate agents. Pick one when you add an applicant and it is counted here. This is separate from a client&apos;s own referral code.{u.role === "AGENT" ? " The list is shared by the office, and the numbers show your own applicants and clients." : ""}</p>
      </div>
      <div className="card overflow-x-auto p-0">
        {sources.length === 0 ? <p className="p-4 text-sm text-muted">No referral sources yet. Add the first one below.</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line">
              <th className="th">Business</th><th className="th">Type</th><th className="th">Contact</th>
              <th className="th">People sent</th><th className="th">Active policies</th><th className="th">Premium</th>
            </tr></thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="td"><Link className="font-semibold underline" href={`/sources/${s.id}`}>{s.name}</Link></td>
                  <td className="td">{s.kind}</td>
                  <td className="td">{[s.contactName, s.phone].filter(Boolean).join(" · ")}</td>
                  <td className="td">{sent.get(s.id) ?? 0}</td>
                  <td className="td">{pol.get(s.id)?.n ?? 0}</td>
                  <td className="td">{fmtMoney(pol.get(s.id)?.premium ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <section className="space-y-2">
        <h2 className="h2">Add a referral source</h2>
        <ActionForm action={createReferralSource} submit="Add referral source" className="card space-y-3"><SourceFields /></ActionForm>
        <p className="text-xs text-muted">Numbers count {mine}applicants and clients marked with each source.</p>
      </section>
    </div>
  );
}
