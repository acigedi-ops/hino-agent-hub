import Link from "next/link";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { POLICY_LINES, fmtDate, fmtMoney } from "@/lib/contacts";
import { REQUIRED_DOCS, missingDocs } from "@/lib/documents";
import { StageBadge } from "@/components/StageBadge";
import { sortClients, type ClientRow, type SortKey, SORT_KEYS } from "@/lib/clients";

type Params = { files?: string; q?: string; agent?: string; type?: string; status?: string; line?: string; sort?: string; dir?: string };

export default async function Clients({ searchParams }: { searchParams: Promise<Params> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status === "FORMER" || sp.status === "ALL" ? sp.status : "CLIENT";
  const sort: SortKey = SORT_KEYS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "name";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const agents = u.role === "ADMIN" ? await db.user.findMany({ orderBy: { name: "asc" } }) : [];

  const found = await db.contact.findMany({
    where: {
      ...contactScope(u),
      stage: status === "ALL" ? { in: ["CLIENT", "FORMER"] } : status,
      ...(u.role === "ADMIN" && sp.agent ? { agentId: sp.agent } : {}),
      ...(sp.type === "PERSONAL" || sp.type === "COMMERCIAL" ? { type: sp.type } : {}),
      ...(sp.line ? { policies: { some: { line: sp.line } } } : {}),
      ...(q ? { OR: [
        { fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" as const } },
        { policies: { some: { OR: [{ policyNumber: { contains: q, mode: "insensitive" as const } }, { carrier: { contains: q, mode: "insensitive" as const } }] } } },
      ] } : {}),
    },
    include: { agent: true, policies: { orderBy: { expirationDate: "asc" } }, documents: { where: { kind: { in: [...REQUIRED_DOCS] } }, select: { kind: true } } },
    take: 2000,
  });

  const missingById = new Map(found.map((c) => [c.id, missingDocs(c.documents.map((d) => d.kind))]));
  const incomplete = found.filter((c) => missingById.get(c.id)!.length).length;
  const rows: ClientRow[] = found.filter((c) => sp.files !== "missing" || missingById.get(c.id)!.length).map((c) => {
    const active = c.policies.filter((p) => p.status === "ACTIVE");
    const shown = active.length ? active : c.policies;
    return {
      id: c.id, name: c.fullName, type: c.type, stage: c.stage, phone: c.phone ?? "", agent: c.agent.name,
      carriers: [...new Set(shown.map((p) => p.carrier))].join(", "),
      premium: active.reduce((m, p) => m + Number(p.premium), 0),
      policies: active.length,
      effective: shown.length ? new Date(Math.max(...shown.map((p) => p.effectiveDate.getTime()))) : null,
      renewal: active.length ? active[0].expirationDate : null,
    };
  });
  sortClients(rows, sort, dir);

  const href = (key: SortKey) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    p.set("sort", key);
    p.set("dir", sort === key && dir === "asc" ? "desc" : "asc");
    return `/clients?${p}`;
  };
  const head = (key: SortKey, label: string) => (
    <th className="th" aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={href(key)} className="hover:text-ink hover:underline">{label}{sort === key ? (dir === "asc" ? " ▲" : " ▼") : ""}</Link>
    </th>
  );

  return (
    <div className="space-y-4">
      <h1 className="h1">{u.role === "ADMIN" ? "All clients" : "My clients"}</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[["Shown", rows.length], ["Active policies", rows.reduce((n, r) => n + r.policies, 0)], ["Premium in force", fmtMoney(rows.reduce((n, r) => n + r.premium, 0))], ["Files missing a document", incomplete]].map(([l, v]) => (
          <div key={l} className="card"><div className="text-xl font-bold">{v}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{l}</div></div>
        ))}
      </div>
      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Name, phone, email, carrier or policy #" aria-label="Search" />
        <select className="input max-w-40" name="status" defaultValue={status} aria-label="Status">
          <option value="CLIENT">Active clients</option><option value="FORMER">Former clients</option><option value="ALL">Active and former</option>
        </select>
        <select className="input max-w-40" name="type" defaultValue={sp.type ?? ""} aria-label="Type">
          <option value="">All types</option><option value="PERSONAL">Personal</option><option value="COMMERCIAL">Commercial</option>
        </select>
        <select className="input max-w-44" name="line" defaultValue={sp.line ?? ""} aria-label="Policy line">
          <option value="">All lines</option>{POLICY_LINES.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className="input max-w-44" name="files" defaultValue={sp.files ?? ""} aria-label="Files">
          <option value="">All files</option><option value="missing">Missing a document</option>
        </select>
        {u.role === "ADMIN" && (
          <select className="input max-w-48" name="agent" defaultValue={sp.agent ?? ""} aria-label="Agent">
            <option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <input type="hidden" name="sort" value={sort} /><input type="hidden" name="dir" value={dir} />
        <button className="btn-quiet">Apply</button>
        <Link className="btn-quiet" href="/clients">Clear</Link>
      </form>
      <p className="text-xs text-muted">Click a column heading to sort by it. Click again to reverse.</p>
      <div className="card overflow-x-auto p-0">
        {rows.length === 0 ? <p className="p-4 text-sm text-muted">No clients match. A contact becomes a client when a bound policy is added.</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line">
              {head("name", "Client")}{head("status", "Status")}{head("type", "Type")}<th className="th">Phone</th><th className="th">Carriers</th>
              {head("premium", "Premium")}{head("effective", "Effective")}{head("renewal", "Next renewal")}<th className="th">File</th>{u.role === "ADMIN" && head("agent", "Agent")}
            </tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="td"><Link className="font-semibold underline" href={`/contacts/${c.id}`}>{c.name}</Link></td>
                  <td className="td"><StageBadge stage={c.stage} /></td>
                  <td className="td">{c.type === "COMMERCIAL" ? "Commercial" : "Personal"}</td>
                  <td className="td whitespace-nowrap">{c.phone}</td>
                  <td className="td">{c.carriers}</td>
                  <td className="td">{fmtMoney(c.premium)}</td>
                  <td className="td whitespace-nowrap">{fmtDate(c.effective)}</td>
                  <td className="td whitespace-nowrap">{fmtDate(c.renewal)}</td>
                  <td className="td text-xs">{missingById.get(c.id)!.length === 0 ? <span className="font-semibold text-green-800">Complete</span> : <span className="font-semibold text-red-700" title={missingById.get(c.id)!.join(", ")}>Missing {missingById.get(c.id)!.length}: {missingById.get(c.id)!.join(", ")}</span>}</td>
                  {u.role === "ADMIN" && <td className="td">{c.agent}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
