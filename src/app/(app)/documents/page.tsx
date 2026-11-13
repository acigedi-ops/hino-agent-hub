import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fmtDate } from "@/lib/contacts";
import { fmtSize } from "@/lib/documents";
import { AGENT_DOC_KINDS, DOC_STATE_LABEL, DOC_STATE_TONE, REQUIRED_AGENT_DOCS, docState } from "@/lib/agent-docs";
import { uploadAgentDocument } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";

const STATUS = { PENDING: ["Waiting for approval", "bg-amber-50 text-amber-800"], APPROVED: ["Approved", "bg-green-50 text-green-800"], REJECTED: ["Rejected", "bg-red-50 text-red-800"] } as const;

export default async function MyDocuments() {
  const u = await requireUser();
  const docs = await db.agentDocument.findMany({
    where: { userId: u.id }, orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, filename: true, size: true, status: true, reviewNote: true, expiresOn: true, createdAt: true, reviewedAt: true },
  });
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="h1">My documents</h1>
        <p className="mt-1 text-sm text-muted">Upload your W-9 and your producer license here. The owner checks each one and approves it. Only you and the owner can see these files.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {REQUIRED_AGENT_DOCS.map((kind) => {
          const state = docState(docs, kind);
          return (
            <div key={kind} className="card space-y-1">
              <div className="font-semibold">{kind}</div>
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${DOC_STATE_TONE[state]}`}>{DOC_STATE_LABEL[state]}</span>
            </div>
          );
        })}
      </div>

      <section className="space-y-2">
        <h2 className="h2">Upload a document</h2>
        <ActionForm action={uploadAgentDocument} submit="Upload" className="card space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><label className="label" htmlFor="kind">Document</label>
              <select className="input" id="kind" name="kind">{AGENT_DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
            <div><label className="label" htmlFor="expiresOn">Expires on (license)</label>
              <input className="input" id="expiresOn" name="expiresOn" type="date" /></div>
            <div><label className="label" htmlFor="file">File (PDF or photo, up to 10 MB)</label>
              <input className="input" id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" required /></div>
          </div>
        </ActionForm>
      </section>

      <section className="space-y-2">
        <h2 className="h2">What I have uploaded</h2>
        <div className="card space-y-3">
          {docs.length === 0 && <p className="text-sm text-muted">Nothing uploaded yet.</p>}
          {docs.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 text-sm last:border-0 last:pb-0">
              <div className="min-w-0">
                <a className="font-semibold underline" href={`/documents/${d.id}`} target="_blank">{d.kind}</a>
                <div className="truncate text-xs text-muted">{d.filename} · {fmtSize(d.size)} · uploaded {fmtDate(d.createdAt)}{d.expiresOn ? ` · expires ${fmtDate(d.expiresOn)}` : ""}</div>
                {d.status === "REJECTED" && d.reviewNote && <div className="text-xs text-red-800">Owner&apos;s note: {d.reviewNote}</div>}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[d.status][1]}`}>{STATUS[d.status][0]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
