import Link from "next/link";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/contacts";

export default async function Clients({ searchParams }: { searchParams: Promise<{ q?: string; agent?: string; type?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const agents = u.role === "ADMIN" ? await db.user.findMany({ orderBy: { name: "asc" } }) : [];
  const clients = await db.contact.findMany({
    where: {
      ...contactScope(u), stage: "CLIENT",
      ...(u.role === "ADMIN" && sp.agent ? { agentId: sp.agent } : {}),
      ...(sp.type === "PERSONAL" || sp.type === "COMMERCIAL" ? { type: sp.type } : {}),
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    include: { agent: true, policies: { where: { status: "ACTIVE" }, orderBy: { expirationDate: "asc" } } },
    orderBy: { fullName: "asc" }, take: 1000,
  });
  const policies = clients.reduce((n, c) => n + c.policies.length, 0);
  const premium = clients.reduce((n, c) => n + c.policies.reduce((m, p) => m + Number(p.premium), 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="h1">{u.role === "ADMIN" ? "All clients" : "My clients"}</h1>
      <div className="grid grid-cols-3 gap-3">
        {[["Clients", clients.length], ["Active policies", policies], ["Premium in force", fmtMoney(premium)]].map(([l, v]) => (
          <div key={l} className="card"><div className="text-xl font-bold">{v}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{l}</div></div>
        ))}
      </div>
      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Search name, phone or email" />
        <select className="input max-w-40" name="type" defaultValue={sp.type ?? ""} aria-label="Type">
          <option value="">All types</option><option value="PERSONAL">Personal</option><option value="COMMERCIAL">Commercial</option>
        </select>
        {u.role === "ADMIN" && (
          <select className="input max-w-48" name="agent" defaultValue={sp.agent ?? ""} aria-label="Agent">
            <option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <button className="btn-quiet">Filter</button>
      </form>
      <div className="card overflow-x-auto p-0">
        {clients.length === 0 ? <p className="p-4 text-sm text-muted">No clients match. A contact becomes a client when a bound policy is added.</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line">
              <th className="th">Client</th><th className="th">Type</th><th className="th">Phone</th><th className="th">Policies</th>
              <th className="th">Premium</th><th className="th">Next renewal</th>{u.role === "ADMIN" && <th className="th">Agent</th>}
            </tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="td"><Link className="font-semibold underline" href={`/contacts/${c.id}`}>{c.fullName}</Link></td>
                  <td className="td">{c.type === "COMMERCIAL" ? "Commercial" : "Personal"}</td>
                  <td className="td">{c.phone}</td>
                  <td className="td">{c.policies.map((p) => p.carrier).join(", ")}</td>
                  <td className="td">{fmtMoney(c.policies.reduce((m, p) => m + Number(p.premium), 0))}</td>
                  <td className="td">{fmtDate(c.policies[0]?.expirationDate)}</td>
                  {u.role === "ADMIN" && <td className="td">{c.agent.name}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
