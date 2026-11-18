import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { POLICY_LINES, fmtDate, fmtMoney } from "@/lib/contacts";
import { REQUIRED_DOCS, missingDocs } from "@/lib/documents";
import { sortClients, type ClientRow, type SortKey, SORT_KEYS } from "@/lib/clients";

type Params = { tab?: string; files?: string; q?: string; agent?: string; type?: string; status?: string; line?: string; sort?: string; dir?: string };

export default async function Clients({ searchParams }: { searchParams: Promise<Params> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const admin = u.role === "ADMIN";
  const q = (sp.q ?? "").trim();
  // Agents open on their own clients. The owner opens on everyone.
  const all = sp.tab === "all" || (admin && sp.tab !== "mine");
  // An agent looking across the agency has to search for someone; the whole book is not listed for them.
  const mustSearch = all && !admin && q.length < 2;
  const statusDefault = all && !admin ? "ALL" : "CLIENT";
  const status = sp.status === "FORMER" || sp.status === "ALL" || sp.status === "CLIENT" ? sp.status : statusDefault;
  const sort: SortKey = SORT_KEYS.includes(sp.sort as SortKey) ? (sp.sort as SortKey) : "name";
  const dir = sp.dir === "desc" ? "desc" : "asc";
  const agents = admin ? await db.user.findMany({ orderBy: { name: "asc" } }) : [];
  const filtered = [sp.status && status !== statusDefault, sp.type, sp.line, sp.files, admin && sp.agent].filter(Boolean).length;

  const found = mustSearch ? [] : await db.contact.findMany({
    where: {
      ...(all ? {} : { agentId: u.id }),
      stage: status === "ALL" ? { in: ["CLIENT", "FORMER"] } : status,
      ...(admin && all && sp.agent ? { agentId: sp.agent } : {}),
      ...(sp.type === "PERSONAL" || sp.type === "COMMERCIAL" ? { type: sp.type } : {}),
      ...(sp.line ? { policies: { some: { line: sp.line } } } : {}),
      ...(q ? { OR: [
        { fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } },
        { email: { contains: q, mode: "insensitive" as const } },
        { policies: { some: { OR: [{ policyNumber: { contains: q, mode: "insensitive" as const } }, { carrier: { contains: q, mode: "insensitive" as const } }] } } },
      ] } : {}),
    },
    include: { agent: true, policies: { orderBy: { expirationDate: "asc" } }, documents: { where: { kind: { in: [...REQUIRED_DOCS] } }, select: { kind: true } } },
    take: all && !admin ? 100 : 2000,
  });

  const missingById = new Map(found.map((c) => [c.id, missingDocs(c.documents.map((d) => d.kind))]));
  const rows: (ClientRow & { mine: boolean })[] = found.filter((c) => sp.files !== "missing" || missingById.get(c.id)!.length).map((c) => {
    const active = c.policies.filter((p) => p.status === "ACTIVE");
    const shown = active.length ? active : c.policies;
    return {
      id: c.id, name: c.fullName, type: c.type, stage: c.stage, phone: c.phone ?? "", agent: c.agent.name, mine: c.agentId === u.id,
      // Sold in EZLynx, policy not on a report yet: show what the sale said.
      carriers: c.policies.length ? [...new Set(shown.map((p) => p.carrier))].join(", ") : [c.soldCarrier, c.soldAt ? "(details pending)" : ""].filter(Boolean).join(" "),
      premium: c.policies.length ? active.reduce((m, p) => m + Number(p.premium), 0) : Number(c.soldPremium ?? 0),
      policies: active.length,
      effective: shown.length ? new Date(Math.max(...shown.map((p) => p.effectiveDate.getTime()))) : null,
      renewal: active.length ? active[0].expirationDate : null,
    };
  });
  sortClients(rows, sort, dir);
  const incomplete = rows.filter((r) => missingById.get(r.id)!.length).length;

  const link = (change: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(change)) { if (v) p.set(k, v); else p.delete(k); }
    return `/clients${p.size ? `?${p}` : ""}`;
  };
  const head = (key: SortKey, label: string) => (
    <th className="th" aria-sort={sort === key ? (dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={link({ sort: key, dir: sort === key && dir === "asc" ? "desc" : "asc" })} className="hover:text-ink hover:underline">{label}{sort === key ? (dir === "asc" ? " ▲" : " ▼") : ""}</Link>
    </th>
  );
  const tab = (isAll: boolean, label: string) => (
    <Link href={`/clients?tab=${isAll ? "all" : "mine"}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={all === isAll ? "page" : undefined}
      className={`inline-flex min-h-11 items-center border-b-2 px-1 text-sm font-semibold md:min-h-9 ${all === isAll ? "border-gold-dark text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label}</Link>
  );
  const showStatus = status !== "CLIENT";
  const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

  return (
    <div className="max-w-6xl space-y-4">
      <h1 className="h1">Clients</h1>
      <form className="space-y-3">
        <input type="hidden" name="tab" value={all ? "all" : "mine"} />
        <div className="flex gap-2">
          <input className="input min-h-11 flex-1 text-base md:max-w-xl" type="search" name="q" defaultValue={q} placeholder={all ? "Search all clients: name, phone, email, carrier or policy #" : "Name, phone, email, carrier or policy #"} aria-label="Search clients" />
          <button className="btn">Search</button>
        </div>
        <nav className="flex gap-5 border-b border-line" aria-label="Which clients">{tab(false, "My clients")}{tab(true, "All clients")}</nav>
        {!mustSearch && (
          <details className="group" open={filtered > 0}>
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold underline md:min-h-0">Filters{filtered ? ` (${filtered} on)` : ""}</summary>
            <div className="mt-2 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
              <select className="input md:max-w-44" name="status" defaultValue={status} aria-label="Status">
                <option value="CLIENT">Active clients</option><option value="FORMER">Former clients</option><option value="ALL">Active and former</option>
              </select>
              <select className="input md:max-w-40" name="type" defaultValue={sp.type ?? ""} aria-label="Type">
                <option value="">Personal and commercial</option><option value="PERSONAL">Personal</option><option value="COMMERCIAL">Commercial</option>
              </select>
              <select className="input md:max-w-44" name="line" defaultValue={sp.line ?? ""} aria-label="Policy line">
                <option value="">All policy lines</option>{POLICY_LINES.map((l) => <option key={l}>{l}</option>)}
              </select>
              <select className="input md:max-w-48" name="files" defaultValue={sp.files ?? ""} aria-label="Files">
                <option value="">Any file</option><option value="missing">Missing a document</option>
              </select>
              {admin && all && (
                <select className="input md:max-w-48" name="agent" defaultValue={sp.agent ?? ""} aria-label="Agent">
                  <option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
              <select className="input md:hidden" name="sort" defaultValue={sort} aria-label="Sort by">
                <option value="name">Sort by name</option><option value="renewal">Sort by next renewal</option><option value="premium">Sort by premium</option>{all && <option value="agent">Sort by agent</option>}
              </select>
              <input type="hidden" name="dir" value={dir} />
              <button className="btn-quiet">Apply</button>
              <Link className="btn-quiet" href={`/clients?tab=${all ? "all" : "mine"}`}>Clear</Link>
            </div>
          </details>
        )}
      </form>

      {mustSearch ? (
        <p className="card text-sm text-muted">Type at least two letters or numbers above to look up any Rhino client. You can open another agent&apos;s client to look at the file, but only your own clients can be changed.</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {plural(rows.length, status === "FORMER" ? "former client" : "client", status === "FORMER" ? "former clients" : "clients")}
            {(admin || !all) && rows.length > 0 && <> · {plural(rows.reduce((n, r) => n + r.policies, 0), "active policy", "active policies")} · {fmtMoney(rows.reduce((n, r) => n + r.premium, 0))} premium{incomplete > 0 && <> · <Link className="font-semibold text-red-700 underline" href={link({ files: "missing" })}>{plural(incomplete, "file", "files")} missing a document</Link></>}</>}
            {found.length === 100 && all && !admin ? " · showing the first 100, add more to your search to narrow it" : ""}
          </p>
          <div className="card overflow-x-auto p-0">
            {rows.length === 0 ? <p className="p-4 text-sm text-muted">{q || filtered ? "No clients match." : "No clients yet. An applicant becomes a client when their policy is on the new business report."}{!all && q ? <> <Link className="font-semibold underline" href={`/clients?tab=all&q=${encodeURIComponent(q)}`}>Search all clients</Link></> : null}</p> : (
              <table className="w-full">
                <thead><tr className="border-b border-line">
                  {head("name", "Client")}{all && head("agent", "Agent")}{showStatus && <th className="th">Status</th>}<th className="th">Phone</th><th className="th">Carriers</th>
                  {head("premium", "Premium")}{head("renewal", "Next renewal")}<th className="th">File</th>
                </tr></thead>
                <tbody>
                  {rows.map((c) => {
                    const miss = missingById.get(c.id)!;
                    return (
                      <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper/60">
                        <td className="td"><Link className="font-semibold underline" href={`/contacts/${c.id}`}>{c.name}</Link></td>
                        {all && <td className="td">{c.agent}{c.mine ? " (you)" : ""}</td>}
                        {showStatus && <td className="td">{c.stage === "CLIENT" ? "Active" : "Former"}</td>}
                        <td className="td whitespace-nowrap">{c.phone}</td>
                        <td className="td">{c.carriers}</td>
                        <td className="td">{c.premium ? fmtMoney(c.premium) : ""}</td>
                        <td className="td whitespace-nowrap">{fmtDate(c.renewal)}</td>
                        <td className="td text-xs">{miss.length === 0 ? <span className="font-semibold text-green-800">Complete</span> : <span className="font-semibold text-red-700" title={miss.join(", ")}>Missing {miss.length}</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
