import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { fmtMoney } from "@/lib/contacts";
import { rate, scoreboard } from "@/lib/scoreboard";
import { today } from "@/lib/tasks";

export default async function Scoreboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const now = today();
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? "") ? sp.month! : now.toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const s = await scoreboard(y, m);
  const step = (n: number) => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const t = s.total;
  const cards: [string, string | number][] = [["Applicants added", t.added], ["New policies", t.policies], ["Premium written", fmtMoney(t.premium)], ["Close rate", rate(t.won, t.added) || "No applicants"]];
  const sourceTable = (title: string, hint: string, rows: typeof s.leadSources, link: boolean) => (
    <section className="space-y-2">
      <h2 className="h2">{title}</h2>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <p className="p-4 text-sm text-muted">{hint}</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Source</th><th className="th">Applicants</th><th className="th">Became clients</th><th className="th">Close rate</th><th className="th">New policies</th><th className="th">Premium written</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-line last:border-0">
                  <td className="td font-semibold">{link ? <Link className="underline" href={`/sources/${r.key}`}>{r.name}</Link> : r.name}</td>
                  <td className="td">{r.added}</td><td className="td">{r.won}</td><td className="td">{rate(r.won, r.added)}</td><td className="td">{r.policies}</td><td className="td">{fmtMoney(r.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Scoreboard</h1>
          <p className="mt-1 text-sm text-muted">How each agent did in {label}. Only you can see this page.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="btn-quiet" href={`/admin/scoreboard?month=${step(-1)}`}>Previous</Link>
          <form className="flex items-center gap-2"><input className="input w-auto" name="month" type="month" defaultValue={month} aria-label="Month" /><button className="btn-quiet">Show</button></form>
          <Link className="btn-quiet" href={`/admin/scoreboard?month=${step(1)}`}>Next</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map(([l, v]) => <div key={l} className="card"><div className="text-2xl font-bold">{v}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{l}</div></div>)}
      </div>

      <section className="space-y-2">
        <h2 className="h2">By agent</h2>
        <div className="card overflow-x-auto p-0">
          <table className="w-full">
            <thead><tr className="border-b border-line">
              <th className="th">Agent</th><th className="th">Applicants added</th><th className="th">Quoted</th><th className="th">Became clients</th><th className="th">Close rate</th><th className="th">Lost</th>
              <th className="th">New policies</th><th className="th">Premium written</th><th className="th">Cancelled</th><th className="th">Tasks done</th><th className="th">Overdue now</th>
            </tr></thead>
            <tbody>
              {s.rows.map((r) => (
                <tr key={r.id} className="border-b border-line">
                  <td className="td font-semibold"><Link className="underline" href={`/tasks?agent=${r.id}`}>{r.name}</Link></td>
                  <td className="td">{r.added}</td><td className="td">{r.quoted}</td><td className="td">{r.won}</td><td className="td">{rate(r.won, r.added)}</td><td className="td">{r.lost}</td>
                  <td className="td">{r.policies}</td><td className="td">{fmtMoney(r.premium)}</td><td className="td">{r.cancelled}</td><td className="td">{r.tasksDone}</td>
                  <td className={`td ${r.overdue ? "font-semibold text-red-700" : ""}`}>{r.overdue}</td>
                </tr>
              ))}
              <tr className="bg-black/[0.03] font-semibold">
                <td className="td">Total</td><td className="td">{t.added}</td><td className="td">{t.quoted}</td><td className="td">{t.won}</td><td className="td">{rate(t.won, t.added)}</td><td className="td">{t.lost}</td>
                <td className="td">{t.policies}</td><td className="td">{fmtMoney(t.premium)}</td><td className="td">{t.cancelled}</td><td className="td">{t.tasksDone}</td><td className="td">{t.overdue}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Applicants added leaves out clients the policy report created. Became clients and close rate follow the applicants added this month. New policies and premium written count policies whose first effective date is in this month, so renewals are not counted again. Overdue now is each agent&apos;s open tasks past due today, whatever month you are looking at.
        </p>
      </section>

      {sourceTable("By lead source", "No applicants or new policies this month.", s.leadSources, false)}
      {sourceTable("By referral source (businesses)", "Nothing from a referral source this month.", s.businesses, true)}
    </div>
  );
}
