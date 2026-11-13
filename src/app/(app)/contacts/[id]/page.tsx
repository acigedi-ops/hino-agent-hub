import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { contactScope, requireUser } from "@/lib/auth";
import { LOST_REASONS, MANUAL_STAGES, POLICY_LINES, daysUntil, fmtDate, fmtMoney, stageLabel } from "@/lib/contacts";
import { addNote, addPolicy, addTask, deleteDocument, reassignContact, setReferralSource, setPolicyStatus, setReferrer, setStage, uploadDocument } from "@/app/actions";
import { showCode } from "@/lib/referrals";
import { DOC_KINDS, fmtSize } from "@/lib/documents";
import { ActionForm } from "@/components/ActionForm";
import { TaskRow } from "@/components/TaskRow";
import { today } from "@/lib/tasks";
import { StageBadge } from "@/components/StageBadge";

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const c = await db.contact.findFirst({
    where: { id, ...contactScope(u) },
    include: {
      agent: true, intake: { select: { updatedAt: true } },
      tasks: { where: { OR: [{ doneAt: null }, { doneAt: { gte: new Date(Date.now() - 30 * 864e5) } }] }, orderBy: [{ doneAt: { sort: "desc", nulls: "first" } }, { dueOn: "asc" }], take: 30, include: { assignee: { select: { name: true } }, policy: { select: { premium: true, expirationDate: true } } } },
      referralSource: { select: { id: true, name: true, kind: true } },
      referredBy: { select: { id: true, fullName: true, agentId: true } },
      referrals: { select: { id: true, fullName: true, stage: true, agentId: true, referredAt: true, referralRewardedAt: true }, orderBy: { referredAt: "desc" } },
      policies: { orderBy: { expirationDate: "asc" } },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, kind: true, filename: true, size: true, createdAt: true, uploadedBy: { select: { name: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 100, include: { user: true } },
    },
  });
  if (!c) notFound();
  const agents = u.role === "ADMIN" ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [];
  const sources = await db.referralSource.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } });
  const isClient = c.stage === "CLIENT";
  /** Referrals cross agents, so only link to a contact this person is allowed to open. */
  const see = (agentId: string) => u.role === "ADMIN" || agentId === u.id;

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
                <p className="text-sm text-muted">This contact is a client because a policy from the EZLynx report is on file. They become a former client automatically when the last policy ends.</p>
              ) : (
                <ActionForm action={setStage} submit="Move" className="space-y-3">
                  <input type="hidden" name="contactId" value={c.id} />
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div><label className="label" htmlFor="stage">Move to</label>
                      <select className="input" id="stage" name="stage" defaultValue={MANUAL_STAGES.includes(c.stage) ? c.stage : "APPLICANT"}>
                        {MANUAL_STAGES.map((s) => <option key={s} value={s}>{stageLabel(s)}</option>)}
                      </select></div>
                    <div><label className="label" htmlFor="lostReason">If lost, why</label>
                      <select className="input" id="lostReason" name="lostReason" defaultValue={c.lostReason ?? ""}>
                        <option value="">Not lost</option>{LOST_REASONS.map((r) => <option key={r}>{r}</option>)}
                      </select></div>
                    <div><label className="label" htmlFor="requoteDate">Requote date</label>
                      <input className="input" id="requoteDate" name="requoteDate" type="date" defaultValue={c.requoteDate?.toISOString().slice(0, 10) ?? ""} /></div>
                  </div>
                  {!c.intake && <p className="text-xs text-muted">Fill the intake form before marking this applicant as quoted.</p>}
                </ActionForm>
              )}
              <Link className="inline-block text-sm font-semibold underline" href={`/inbox/new?contact=${c.id}`}>Send a message about this {c.stage === "CLIENT" ? "client" : "applicant"}</Link>
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
              {c.policies.length === 0 && <p className="text-sm text-muted">No policies yet. This applicant becomes a client when their policy shows up on the EZLynx new business report the owner uploads.</p>}
              {c.policies.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                  <div className="text-sm">
                    <div className="font-semibold">{p.line} · {p.carrier} · {p.policyNumber}</div>
                    <div className="text-muted">{fmtMoney(Number(p.premium))} · {fmtDate(p.effectiveDate)} to {fmtDate(p.expirationDate)}
                      {p.status === "ACTIVE" ? ` · renews in ${daysUntil(p.expirationDate)} days` : ` · ${p.status.toLowerCase()}`}</div>
                  </div>
                  {u.role === "ADMIN" && <ActionForm action={setPolicyStatus} submit="Set" className="flex items-center gap-2" buttonClass="btn-quiet">
                    <input type="hidden" name="policyId" value={p.id} />
                    <select className="input" name="status" defaultValue={p.status} aria-label="Policy status">
                      <option value="ACTIVE">Active</option><option value="CANCELLED">Cancelled</option><option value="EXPIRED">Expired</option>
                    </select>
                  </ActionForm>}
                </div>
              ))}
              {u.role === "ADMIN" && <details className="border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-semibold">Add a policy by hand (owner only)</summary>
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
              </details>}
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="h2">Referrals</h2>
            <div className="card space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Their referral code</div>
                  <div className="select-all text-xl font-bold tracking-wider">{c.referralCode ? showCode(c.referralCode) : "None yet"}</div>
                </div>
                <p className="max-w-xs text-xs text-muted">Give this code to {c.fullName.split(" ")[0]} to share with family and friends. Enter it when you add the person they send.</p>
              </div>
              <div className="border-t border-line pt-3">
                {c.referralSource && <p className="mb-2">Sent by <Link className="font-semibold underline" href={`/sources/${c.referralSource.id}`}>{c.referralSource.name}</Link> ({c.referralSource.kind}).</p>}
                <ActionForm action={setReferralSource} submit="Save" className="flex flex-wrap items-end gap-2" buttonClass="btn-quiet">
                  <input type="hidden" name="contactId" value={c.id} />
                  <div><label className="label" htmlFor="referralSourceId">Referral source (business)</label>
                    <select className="input" id="referralSourceId" name="referralSourceId" defaultValue={c.referralSource?.id ?? ""}><option value="">None</option>{sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                </ActionForm>
              </div>
              {c.referredBy ? (
                <p className="border-t border-line pt-3">Referred by{" "}
                  {see(c.referredBy.agentId) ? <Link className="font-semibold underline" href={`/contacts/${c.referredBy.id}`}>{c.referredBy.fullName}</Link> : <span className="font-semibold">{c.referredBy.fullName}</span>}
                  {c.referredAt ? ` on ${fmtDate(c.referredAt)}` : ""}.</p>
              ) : (
                <ActionForm action={setReferrer} submit="Save" className="flex flex-wrap items-end gap-2 border-t border-line pt-3" buttonClass="btn-quiet">
                  <input type="hidden" name="contactId" value={c.id} />
                  <div><label className="label" htmlFor="referralCode">Referred by (code)</label>
                    <input className="input max-w-40 uppercase" id="referralCode" name="referralCode" placeholder="RH-" autoComplete="off" required /></div>
                </ActionForm>
              )}
              {c.referrals.length > 0 && (
                <div className="border-t border-line pt-3">
                  <div className="mb-1 font-semibold">People {c.fullName.split(" ")[0]} referred ({c.referrals.length})</div>
                  <ul className="space-y-1">
                    {c.referrals.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-2">
                        {see(r.agentId) ? <Link className="underline" href={`/contacts/${r.id}`}>{r.fullName}</Link> : <span>{r.fullName}</span>}
                        <StageBadge stage={r.stage} />
                        <span className="text-xs text-muted">{fmtDate(r.referredAt)}{r.referralRewardedAt ? ` · reward sent ${fmtDate(r.referralRewardedAt)}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </section>
          <section className="space-y-2">
            <h2 className="h2">Documents</h2>
            <div className="card space-y-3">
              {c.documents.length === 0 && <p className="text-sm text-muted">No documents yet. Licenses, registrations and other files for this contact are kept here.</p>}
              {c.documents.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0 text-sm">
                    <a className="font-semibold underline" href={`/contacts/${c.id}/documents/${d.id}`} target="_blank">{d.kind}</a>
                    <div className="truncate text-xs text-muted">{d.filename} · {fmtSize(d.size)} · {d.uploadedBy.name} · {fmtDate(d.createdAt)}</div>
                  </div>
                  {u.role === "ADMIN" && (
                    <ActionForm action={deleteDocument} submit="Delete" buttonClass="btn-quiet">
                      <input type="hidden" name="documentId" value={d.id} />
                    </ActionForm>
                  )}
                </div>
              ))}
              <ActionForm action={uploadDocument} submit="Upload" className="flex flex-wrap items-end gap-2 border-t border-line pt-3" buttonClass="btn-quiet">
                <input type="hidden" name="contactId" value={c.id} />
                <div><label className="label" htmlFor="doc-kind">Type</label>
                  <select className="input" id="doc-kind" name="kind">{DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
                <div className="min-w-0 flex-1"><label className="label" htmlFor="doc-file">File (PDF or photo, up to 10 MB)</label>
                  <input className="input" id="doc-file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" required /></div>
              </ActionForm>
            </div>
          </section>
        </div>

        <div className="space-y-6">
        <section className="space-y-2">
          <h2 className="h2">Follow-ups</h2>
          <div className="card space-y-3">
            <ActionForm action={addTask} submit="Add follow-up" className="flex flex-wrap items-end gap-2" buttonClass="btn-quiet">
              <input type="hidden" name="contactId" value={c.id} />
              <div className="min-w-0 flex-1 basis-48"><label className="label" htmlFor="taskTitle">What to do</label>
                <input className="input" id="taskTitle" name="title" maxLength={300} placeholder="Call back with the quote" required /></div>
              <div><label className="label" htmlFor="taskDue">Due</label><input className="input" id="taskDue" name="dueOn" type="date" defaultValue={today().toISOString().slice(0, 10)} /></div>
            </ActionForm>
            {c.tasks.length > 0 && <div className="-mx-4 -mb-4 border-t border-line">{c.tasks.map((x) => <TaskRow key={x.id} t={x} today={today()} showContact={false} showAgent={u.role === "ADMIN"} />)}</div>}
          </div>
        </section>
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
    </div>
  );
}
