"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import type { Plan, PlanRow } from "@/lib/report-import";
import { applyReport, previewReport } from "./actions";

const LABEL: Record<PlanRow["action"], string> = {
  convert: "Applicant to client", add: "New policy", update: "Already in hub", create: "New client", skip: "Skipped",
};
const TONE: Record<PlanRow["action"], string> = {
  convert: "bg-green-50 text-green-800", add: "bg-green-50 text-green-800", update: "bg-stone-100 text-stone-700",
  create: "bg-amber-50 text-amber-800", skip: "bg-red-50 text-red-800",
};
const money = (n: number | null) => (n === null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));

export function ImportForm({ agents, me }: { agents: { id: string; name: string }[]; me: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [carrier, setCarrier] = useState("");
  const [term, setTerm] = useState("12");
  const [agentId, setAgentId] = useState(me);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, start] = useTransition();

  const form = () => {
    const f = new FormData();
    f.set("file", file!); f.set("carrier", carrier); f.set("term", term); f.set("agentId", agentId);
    return f;
  };
  const preview = () => file && start(async () => {
    setDone(false); setError(""); setPlan(null);
    const res = await previewReport(form());
    if ("error" in res) setError(res.error); else setPlan(res);
  });
  const apply = () => file && start(async () => {
    const res = await applyReport(form());
    if ("error" in res) setError(res.error); else { setPlan(res); setDone(true); }
  });

  const changes = plan ? plan.counts.convert + plan.counts.add + plan.counts.update + plan.counts.create : 0;
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div><label className="label" htmlFor="report">New business report (Excel or CSV)</label>
          <input className="input" id="report" type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPlan(null); setDone(false); setError(""); }} /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label" htmlFor="carrier">Carrier (if the report has no carrier column)</label>
            <input className="input" id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="National General" /></div>
          <div><label className="label" htmlFor="term">Policy term (if no expiration date)</label>
            <select className="input" id="term" value={term} onChange={(e) => setTerm(e.target.value)}><option value="12">12 months</option><option value="6">6 months</option></select></div>
          <div><label className="label" htmlFor="agentId">Clients not in the hub yet go to</label>
            <select className="input" id="agentId" value={agentId} onChange={(e) => setAgentId(e.target.value)}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={preview} disabled={busy || !file}>Preview</button>
          <span className="text-xs text-muted">Nothing is saved until you check the preview and press Apply.</span>
        </div>
      </div>
      {busy && <p className="text-sm text-muted">Working...</p>}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {plan && plan.missing.length > 0 && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
          This file is missing a column the hub needs: {plan.missing.join(", ")}. Columns it did find: {plan.found.join(", ") || "none"}.
        </p>
      )}
      {plan && plan.missing.length === 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {(Object.keys(LABEL) as PlanRow["action"][]).map((k) => (
              <div key={k} className="card"><div className="text-xl font-bold">{plan.counts[k]}</div><div className="text-xs font-semibold uppercase tracking-wide text-muted">{LABEL[k]}</div></div>
            ))}
          </div>
          {done ? (
            <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">Report applied. {plan.counts.convert} applicants are now clients.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <button className="btn-gold" onClick={apply} disabled={busy || changes === 0}>Apply {changes} {changes === 1 ? "row" : "rows"}</button>
              <span className="text-xs text-muted">Columns found: {plan.found.join(", ")}</span>
            </div>
          )}
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr className="border-b border-line">
                <th className="th">Row</th><th className="th">Client</th><th className="th">Policy</th><th className="th">Carrier</th><th className="th">Premium</th>
                <th className="th">Effective</th><th className="th">Expires</th><th className="th">Agent</th><th className="th">What happens</th>
              </tr></thead>
              <tbody>
                {plan.rows.map((r) => (
                  <tr key={r.line} className="border-b border-line last:border-0 align-top">
                    <td className="td">{r.line}</td>
                    <td className="td font-semibold">{r.contactId ? <Link className="underline" href={`/contacts/${r.contactId}`}>{r.name}</Link> : r.name}</td>
                    <td className="td">{r.policy}</td><td className="td">{r.carrier}</td><td className="td">{money(r.premium)}</td>
                    <td className="td whitespace-nowrap">{r.effective}</td><td className="td whitespace-nowrap">{r.expiration}</td><td className="td">{r.agent}</td>
                    <td className="td"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[r.action]}`}>{LABEL[r.action]}</span>
                      <div className="mt-1 text-xs text-muted">{r.note}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
