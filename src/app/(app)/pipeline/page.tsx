import Link from "next/link";
import type { Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { PIPELINE, STAGES, fmtDate, stageLabel } from "@/lib/contacts";
import { StageBadge } from "@/components/StageBadge";

export default async function Pipeline({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const only = STAGES.some((s) => s.key === sp.stage) && sp.stage !== "CLIENT" ? (sp.stage as Stage) : null;
  const q = (sp.q ?? "").trim();
  const contacts = await db.contact.findMany({
    where: {
      ...contactScope(u),
      stage: only ?? { in: PIPELINE },
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { email: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    include: { agent: true }, orderBy: { updatedAt: "desc" }, take: 500,
  });
  const columns = only ? [only] : PIPELINE;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{only ? stageLabel(only) : "Applicants"}</h1>
        <Link href="/contacts/new" className="btn-gold">+ New applicant</Link>
      </div>
      <form className="flex flex-wrap gap-2">
        <input className="input max-w-xs" name="q" defaultValue={q} placeholder="Search name, phone or email" />
        {only && <input type="hidden" name="stage" value={only} />}
        <button className="btn-quiet">Search</button>
        <Link className="btn-quiet" href="/pipeline">Board</Link>
        <Link className="btn-quiet" href="/pipeline?stage=LOST">Lost</Link>
        <Link className="btn-quiet" href="/pipeline?stage=FORMER">Former clients</Link>
      </form>
      <div className={`grid gap-3 ${only ? "" : "md:grid-cols-2"}`}>
        {columns.map((stage) => {
          const items = contacts.filter((c) => c.stage === stage);
          return (
            <section key={stage} className="rounded-lg bg-white/60 p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <StageBadge stage={stage} /><span className="text-xs font-semibold text-muted">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.length === 0 && <p className="px-1 py-3 text-xs text-muted">Nobody here.</p>}
                {items.map((c) => (
                  <Link key={c.id} href={`/contacts/${c.id}`} className="card block p-3 hover:border-gold-dark">
                    <div className="font-semibold">{c.fullName}</div>
                    <div className="text-xs text-muted">{c.type === "COMMERCIAL" ? "Commercial" : "Personal"}{c.phone ? ` · ${c.phone}` : ""}</div>
                    {c.stage === "LOST" && <div className="text-xs text-muted">{c.lostReason}{c.requoteDate ? ` · requote ${fmtDate(c.requoteDate)}` : ""}</div>}
                    {u.role === "ADMIN" && <div className="mt-1 text-xs font-medium">{c.agent.name}</div>}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
