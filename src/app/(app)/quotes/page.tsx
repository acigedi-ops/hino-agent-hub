import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/contacts";
import { QUOTE_STATUS, QUOTE_TONE } from "@/lib/quote-fields";
import { quoteScope } from "@/lib/quotes";

export default async function Quotes() {
  const u = await requireUser();
  const admin = u.role === "ADMIN";
  const all = await db.quoteRequest.findMany({
    where: quoteScope(u), orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, businessName: true, status: true, createdAt: true, premium: true, closedAt: true, agent: { select: { name: true } } },
  });
  // Whatever waits on the person looking comes first.
  const waits = (r: (typeof all)[number]) => (admin ? (r.status === "SENT" || (r.status === "ACCEPTED" && !r.closedAt)) : r.status === "NEED_INFO" || r.status === "QUOTED");
  const rows = [...all.filter(waits), ...all.filter((r) => !waits(r))];
  const label = (r: (typeof all)[number]) => (r.status === "ACCEPTED" && r.closedAt ? "Bound" : QUOTE_STATUS[r.status] ?? r.status);
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Quote Desk</h1>
          <p className="mt-1 text-sm text-muted">{admin ? "Commercial quote requests from the agents. Open one to ask for more info or attach your quote." : "Ask the office for a business insurance quote. When it is ready you download it here and present it to the client."}</p>
        </div>
        <Link className="btn-gold" href="/quotes/new">New request</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <p className="p-4 text-sm text-muted">No quote requests yet.</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line"><th className="th">Business</th>{admin && <th className="th">Agent</th>}<th className="th">Status</th><th className="th">Premium</th><th className="th">Sent</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={`border-b border-line last:border-0 ${waits(r) ? "bg-gold/10" : ""}`}>
                  <td className="td"><Link className="font-semibold underline" href={`/quotes/${r.id}`}>{r.businessName}</Link></td>
                  {admin && <td className="td">{r.agent.name}</td>}
                  <td className="td"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${QUOTE_TONE[r.status] ?? ""}`}>{label(r)}</span>{waits(r) && <span className="ml-2 text-xs font-semibold">Waiting on you</span>}</td>
                  <td className="td">{r.premium ? fmtMoney(Number(r.premium)) : ""}</td>
                  <td className="td whitespace-nowrap">{fmtDate(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
