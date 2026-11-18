import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/contacts";
import { fmtSize } from "@/lib/documents";
import { QUOTE_SECTIONS, QUOTE_STATUS, QUOTE_TONE, parseQuoteData } from "@/lib/quote-fields";
import { quoteScope } from "@/lib/quotes";
import { ActionForm } from "@/components/ActionForm";
import { addQuoteNote, attachQuote, setQuoteOutcome } from "../actions";

const FILES = "application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export default async function Quote({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  const { id } = await params;
  const r = await db.quoteRequest.findFirst({
    where: { id, ...quoteScope(u) },
    include: {
      agent: { select: { name: true } },
      files: { orderBy: { createdAt: "asc" }, select: { id: true, filename: true, size: true, isQuote: true, createdAt: true } },
      notes: { orderBy: { createdAt: "asc" }, include: { user: { select: { name: true, role: true } } } },
    },
  });
  if (!r) notFound();
  const admin = u.role === "ADMIN";
  const d = parseQuoteData(r.data);
  const quote = r.files.filter((f) => f.isQuote), sent = r.files.filter((f) => !f.isQuote);
  const quoted = r.status === "QUOTED" || r.status === "ACCEPTED" || r.status === "NOT_TAKEN";
  const status = r.status === "ACCEPTED" && r.closedAt ? "Bound" : QUOTE_STATUS[r.status] ?? r.status;
  const open = r.status === "SENT" || r.status === "NEED_INFO";
  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link className="text-sm text-muted underline" href="/quotes">Back to Quote Desk</Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="h1">{r.businessName}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${QUOTE_TONE[r.status] ?? ""}`}>{status}</span>
        </div>
        <p className="mt-1 text-sm text-muted">Sent {fmtDate(r.createdAt)}{admin ? ` by ${r.agent.name}` : ""}. {d.coverages.join(", ")}</p>
      </div>

      {quoted && (
        <section className="card space-y-3 border-2 border-gold">
          <h2 className="h2">The quote</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
            <div><dt className="text-muted">Carrier</dt><dd className="font-semibold">{r.carrier}</dd></div>
            <div><dt className="text-muted">Premium</dt><dd className="font-semibold">{r.premium ? fmtMoney(Number(r.premium)) : ""}</dd></div>
            <div><dt className="text-muted">Down payment</dt><dd className="font-semibold">{r.downPayment ? fmtMoney(Number(r.downPayment)) : "Not given"}</dd></div>
            <div><dt className="text-muted">Good until</dt><dd className="font-semibold">{r.expiresOn ? fmtDate(r.expiresOn) : "Not given"}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2">{quote.map((f) => <a key={f.id} className="btn-gold" href={`/quotes/${r.id}/files/${f.id}`}>Download quote{quote.length > 1 ? ` (${f.filename})` : ""}</a>)}</div>
          {r.status === "QUOTED" && (
            <div className="grid gap-3 border-t border-line pt-3 md:grid-cols-2">
              <ActionForm action={setQuoteOutcome} submit="Client accepted" buttonClass="btn">
                <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="outcome" value="ACCEPTED" />
                <p className="text-sm text-muted">Tap this once the client says yes. The office then binds it.</p>
              </ActionForm>
              <ActionForm action={setQuoteOutcome} submit="Not taken" buttonClass="btn-quiet" className="space-y-2">
                <input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="outcome" value="NOT_TAKEN" />
                <label className="label" htmlFor="reason">Why the client did not take it</label><input className="input" id="reason" name="reason" />
              </ActionForm>
            </div>
          )}
          {r.status === "ACCEPTED" && !r.closedAt && (admin
            ? <ActionForm action={setQuoteOutcome} submit="Mark as bound" buttonClass="btn"><input type="hidden" name="requestId" value={r.id} /><input type="hidden" name="outcome" value="DONE" /><p className="text-sm">The client accepted. Bind the policy, then mark it here.</p></ActionForm>
            : <p className="text-sm">The client accepted. The office is binding it.</p>)}
          {r.status === "NOT_TAKEN" && <p className="text-sm text-muted">Not taken: {r.outcomeReason}</p>}
        </section>
      )}

      {admin && r.status !== "NOT_TAKEN" && !(r.status === "ACCEPTED" && r.closedAt) && (
        <section className="space-y-2">
          <h2 className="h2">{quoted ? "Replace the quote" : "Attach your quote"}</h2>
          <ActionForm action={attachQuote} submit={quoted ? "Save the new quote" : "Attach quote"} className="card space-y-3" buttonClass="btn-gold">
            <input type="hidden" name="requestId" value={r.id} />
            <div className="grid gap-3 md:grid-cols-2">
              <div><label className="label" htmlFor="carrier">Carrier</label><input className="input" id="carrier" name="carrier" defaultValue={r.carrier ?? ""} required /></div>
              <div><label className="label" htmlFor="premium">Premium</label><input className="input" id="premium" name="premium" inputMode="decimal" placeholder="$" defaultValue={r.premium ? String(r.premium) : ""} required /></div>
              <div><label className="label" htmlFor="downPayment">Down payment</label><input className="input" id="downPayment" name="downPayment" inputMode="decimal" placeholder="$" defaultValue={r.downPayment ? String(r.downPayment) : ""} /></div>
              <div><label className="label" htmlFor="expiresOn">Quote good until</label><input className="input" id="expiresOn" name="expiresOn" type="date" defaultValue={r.expiresOn ? r.expiresOn.toISOString().slice(0, 10) : ""} /></div>
            </div>
            <div><label className="label" htmlFor="quote">Quote file (PDF)</label><input className="input" id="quote" name="quote" type="file" accept={FILES} required={!quote.length} /></div>
            <div><label className="label" htmlFor="quote-text">Note for the agent (optional)</label><textarea className="input" id="quote-text" name="text" rows={2} /></div>
          </ActionForm>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="h2">Notes</h2>
        <div className="card space-y-3">
          {r.notes.length === 0 && <p className="text-sm text-muted">{admin ? "Ask the agent for anything that is missing." : "The office writes here if it needs more from you."}</p>}
          {r.notes.map((n) => (
            <div key={n.id} className="text-sm">
              <div className="text-xs text-muted"><span className="font-semibold text-ink">{n.user.name}</span>{n.user.role === "ADMIN" ? " (office)" : ""} · {fmtDate(n.createdAt)}</div>
              <div className="whitespace-pre-wrap break-words">{n.text}</div>
            </div>
          ))}
          {r.status !== "NOT_TAKEN" && !(r.status === "ACCEPTED" && r.closedAt) && (
            <ActionForm action={addQuoteNote} submit={admin ? (open ? "Ask for more info" : "Send note") : (r.status === "NEED_INFO" ? "Send answer" : "Send note")} className="space-y-2 border-t border-line pt-3" buttonClass="btn-quiet">
              <input type="hidden" name="requestId" value={r.id} />
              <label className="label" htmlFor="note-text">{admin ? "What do you need from the agent?" : "Your note or answer"}</label>
              <textarea className="input" id="note-text" name="text" rows={2} />
              <label className="label" htmlFor="note-files">Add files (optional)</label>
              <input className="input" id="note-files" name="files" type="file" multiple accept={FILES} />
            </ActionForm>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="h2">Files sent in ({sent.length})</h2>
        <div className="card text-sm">
          {sent.length === 0 ? <p className="text-muted">No files.</p> : (
            <ul className="divide-y divide-line">{sent.map((f) => <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5"><a className="min-w-0 break-words font-semibold underline" href={`/quotes/${r.id}/files/${f.id}`} target="_blank">{f.filename}</a><span className="text-muted">{fmtSize(f.size)} · {fmtDate(f.createdAt)}</span></li>)}</ul>
          )}
        </div>
      </section>

      {QUOTE_SECTIONS.map((sec) => {
        const rows = sec.fields.filter((f) => d.fields[f.key]);
        if (!rows.length && sec.title !== "Coverage wanted") return null;
        return (
          <section key={sec.title} className="space-y-2">
            <h2 className="h2">{sec.title}</h2>
            <dl className="card grid gap-x-6 gap-y-2 text-sm md:grid-cols-2">
              {sec.title === "Coverage wanted" && <div className="md:col-span-2"><dt className="text-muted">Coverage</dt><dd className="font-semibold">{d.coverages.join(", ")}</dd></div>}
              {rows.map((f) => <div key={f.key} className={f.kind === "long" ? "md:col-span-2" : ""}><dt className="text-muted">{f.label}</dt><dd className="whitespace-pre-wrap break-words font-semibold">{d.fields[f.key]}</dd></div>)}
            </dl>
          </section>
        );
      })}
      {d.notes && <section className="space-y-2"><h2 className="h2">Notes from the agent</h2><p className="card whitespace-pre-wrap break-words text-sm">{d.notes}</p></section>}
    </div>
  );
}
