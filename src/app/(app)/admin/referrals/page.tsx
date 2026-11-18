import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { fmtDate } from "@/lib/contacts";
import { showCode } from "@/lib/referrals";
import { setReferralRewarded } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { StageBadge } from "@/components/StageBadge";

const REWARD = 20;

export default async function Referrals({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = new Date();
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = month.split("-").map(Number);
  const rows = await db.contact.findMany({
    where: { referredById: { not: null }, referredAt: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
    include: { agent: { select: { name: true } }, referredBy: { select: { id: true, fullName: true, phone: true, email: true, referralCode: true } } },
    orderBy: { referredAt: "asc" },
  });
  const owed = rows.filter((r) => !r.referralRewardedAt);
  const became = rows.filter((r) => r.stage === "CLIENT").length;
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Referrals</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Everyone in the hub has a referral code on their page. When an agent adds a new applicant with that code, the referral shows up here. Tick a row once the ${REWARD} gift card has gone out.
        </p>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <div><label className="label" htmlFor="month">Month</label><input className="input" id="month" name="month" type="month" defaultValue={month} /></div>
        <button className="btn-quiet">Show</button>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Referrals in " + label, rows.length], ["Became clients", became], ["Gift cards still to send", owed.length], ["Still to send", `$${owed.length * REWARD}`]].map(([l, v]) => (
          <div key={l} className="card"><div className="text-xl font-bold">{v}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{l}</div></div>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <p className="p-4 text-sm text-muted">No referrals recorded in {label}.</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line">
              <th className="th">Referred by</th><th className="th">Reach them at</th><th className="th">New person</th><th className="th">Status</th>
              <th className="th">Date</th><th className="th">Agent</th><th className="th">Gift card</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="td"><Link className="font-semibold underline" href={`/contacts/${r.referredBy!.id}`}>{r.referredBy!.fullName}</Link>
                    <div className="text-xs text-muted">{r.referredBy!.referralCode ? showCode(r.referredBy!.referralCode) : ""}</div></td>
                  <td className="td text-xs">{[r.referredBy!.phone, r.referredBy!.email].filter(Boolean).join(" · ")}</td>
                  <td className="td"><Link className="underline" href={`/contacts/${r.id}`}>{r.fullName}</Link></td>
                  <td className="td"><StageBadge stage={r.stage} /></td>
                  <td className="td whitespace-nowrap">{fmtDate(r.referredAt)}</td>
                  <td className="td">{r.agent.name}</td>
                  <td className="td">
                    <ActionForm action={setReferralRewarded} submit={r.referralRewardedAt ? "Undo" : "Mark sent"} className="flex items-center gap-2" buttonClass="btn-quiet">
                      <input type="hidden" name="contactId" value={r.id} />
                      <input type="hidden" name="sent" value={r.referralRewardedAt ? "false" : "true"} />
                      {r.referralRewardedAt && <span className="text-xs text-green-800">Sent {fmtDate(r.referralRewardedAt)}</span>}
                    </ActionForm>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
