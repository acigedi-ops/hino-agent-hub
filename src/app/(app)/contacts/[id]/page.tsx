import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { LOST_REASONS, MANUAL_STAGES, POLICY_LINES, daysUntil, fmtDate, fmtMoney, stageLabel } from "@/lib/contacts";
import { addNote, addPolicy, reassignContact, setPolicyStatus, setStage } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { StageBadge } from "@/components/StageBadge";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const c = await db.contact.findFirst({
    where: { id, ...contactScope(u) },
    include: {
      agent: true, intake: { select: { updatedAt: true } },
      policies: { orderBy: { expirationDate: "asc" } },
      activities: { orderBy: { createdAt: "desc" }, take: 100, include: { user: true } },
    },
  });
  if (!c) notFound();
  const agents = u.role === "ADMIN" ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];
  const isClient = c.stage === "CLIENT";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="h1">{c.fullName}</h1><StageBadge stage={c.stage} /></div>
          <p className="text-sm text-muted">
            {c.type === "COMMERCIAL" ? "Commercial" : "Personal"}
            {c.phone ? ` · ${c.phone}` : ""}{c.email ? ` · ${c.email}` : ""}{c.address ? ` · ${c.address}` : ""}
          </p>
          <p className="text-xs text-muted">Agent: {c.agent.name}{c.leadSource ? ` · Source: ${c.leadSource}` : ""}{c.priority ? ` · Priority: ${c.priority}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/contacts/${c.id}/intake`} className="btn-gold">{c.intake ? "Open intake form" : "Fill intake form"}</Link>
          {c.intake && <a href={`/contacts/${c.id}/intake/pdf`} target="_blank" className="btn-quiet">Intake PDF</a>}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section className="space-y-2">
            <h2 className="h2">Stage</h2>
            <div className="card space-y-3">
              {isClient ? (
                <p className="text-sm text-muted">This contact is a client because they have an active policy. They become a former client automatically when the last policy ends.</p>
              ) : (
                <ActionForm action={setStage} submit="Move" className="space-y-3">
                  <input type="hidden" name="contactId" value={c.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div><label className="label" htmlFor="stage">Move to</label>
                      <select className="input" id="stage" name="stage" defaultValue={MANUAL_STAGES.includes(c.stage) ? c.stage : "QUOTING"}>
                        {MANUAL_STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
                      </select></div>
                    <div><label className="label" htmlFor="lostReason">If lost, why</label>
                      <select className="input" id="lostReason" name="lostReason" defaultValue={c.lostReason ?? ""}>
                        <option value="">Not lost</option>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select></div>
                    <div><label className="label" htmlFor="requoteDate">Requote date</label>
                      <input className="input" id="requoteDate" name="requoteDate" type="date" defaultValue={c.requoteDate?.toISOString().slice(0, 10) ?? ""} /></div>
                  </div>
                  {!c.intake && <p className="text-xs text-muted">Quoting opens once the intake form is filled.</p>}
                </ActionForm>
              )}
              {u.role === "ADMIN" && (
                <ActionForm action={reassignContact} submit="Reassign" className="flex flex-wrap items-end gap-2 border-t border-line pt-3" buttonClass="btn-quiet">
                  <input type="hidden" name="contactId" value={c.id} />
                  <div><label className="label" htmlFor="agentId">Owning agent</label>
                    <select className="input" id="agentId" name="agentId" defaultValue={c.agentId}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
                </ActionForm>
              )}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="h2">Policies</h2>
            <div className="card space-y-3">
              {c.policies.length === 0 && <p className="text-sm text-muted">No policies yet. Adding a bound policy makes this contact a client.</p>}
              {c.policies.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                  <div className="text-sm">
                    <div className="font-semibold">{p.line} · {p.carrier} · {p.policyNumber}</div>
                    <div className="text-muted">{fmtMoney(Number(p.premium))} · {fmtDate(p.effectiveDate)} to {fmtDate(p.expirationDate)}
                      {p.status === "ACTIVE" ? ` · renews in ${daysUntil(p.expirationDate)} days` : ` · ${p.status.toLowerCase()}`}</div>
                  </div>
                  <ActionForm action={setPolicyStatus} submit="Set" className="flex items-center gap-2" buttonClass="btn-quiet">
                    <input type="hidden" name="policyId" value={p.id} />
                    <select className="input" name="status" defaultValue={p.status} aria-label="Policy status">
                      <option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option><option value="EXPIRED">Expired</option>
                    </select>
                  </ActionForm>
                </div>
              ))}
              <details className="border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-semibold">Add a bound policy</summary>
                <ActionForm action={addPolicy} submit="Add policy" className="mt-3 space-y-3">
                  <input type="hidden" name="contactId" value={c.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div><label className="label" htmlFor="line">Line</label><select className="input" id="line" name="line">{POLICY_LINES.map((l) => <option key={l}>{l}</option>)}</select></div>
                    <div><label className="label" htmlFor="carrier">Carrier</label><input className="input" id="carrier" name="carrier" required /></div>
                    <div><label className="label" htmlFor="policyNumber">Policy number</label><input className="input" id="policyNumber" name="policyNumber" required /></div>
                    <div><label className="label" htmlFor="premium">Premium ($)</label><input className="input" id="premium" name="premium" inputMode="decimal" required /></div>
                    <div><label className="label" htmlFor="effectiveDate">Effective</label><input className="input" id="effectiveDate" name="effectiveDate" type="date" required /></div>
                    <div><label className="label" htmlFor="expirationDate">Expires</label><input className="input" id="expirationDate" name="expirationDate" type="date" required /></div>
                  </div>
                </ActionForm>
              </details>
            </div>
          </section>
        </div>

        <section className="space-y-2">
          <h2 className="h2">Timeline</h2>
          <div className="card space-y-3">
            <ActionForm action={addNote} submit="Add note" className="space-y-2" buttonClass="btn-quiet">
              <input type="hidden" name="contactId" value={c.id} />
              <textarea className="input" name="text" rows={2} placeholder="Call notes, what was quoted, next step..." aria-label="Note" />
            </ActionForm>
            <ul className="space-y-2">
              {c.activities.map((a) => (
                <li key={a.id} className="border-t border-line pt-2 text-sm">
                  <div className="whitespace-pre-wrap">{a.text}</div>
                  <div className="text-xs text-muted">{a.user.name} · {a.createdAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Los_Angeles" })}</div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
