"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { monthLabel, sectionLabel } from "@/lib/commission-parse";
import { previewStatement, saveStatement, type StatementPreview } from "./actions";

const money = (n: number | null) => (n === null ? "" : n.toLocaleString("en-US", { style: "currency", currency: "USD" }));

export function UploadForm({ agents, existing }: { agents: { id: string; name: string }[]; existing: { agentId: string; month: string }[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [agentId, setAgentId] = useState("");
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [month, setMonth] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, start] = useTransition();

  const sheet = preview?.sheets.find((s) => s.name === sheetName) ?? null;
  const pick = (p: StatementPreview, name: string) => { setSheetName(name); setMonth(p.sheets.find((s) => s.name === name)?.month ?? ""); setSaved(""); };
  const read = () => file && start(async () => {
    setError(""); setSaved(""); setPreview(null);
    const f = new FormData(); f.set("file", file);
    const res = await previewStatement(f);
    if ("error" in res) setError(res.error); else { setPreview(res); pick(res, res.sheets[0].name); }
  });
  const save = () => file && sheet && start(async () => {
    setError("");
    const f = new FormData(); f.set("file", file); f.set("sheet", sheet.name); f.set("agentId", agentId); f.set("month", month);
    const res = await saveStatement(f);
    if ("error" in res) setError(res.error); else { setSaved(res.ok); router.refresh(); }
  });
  const replaces = existing.some((e) => e.agentId === agentId && e.month === month);
  const p = sheet?.parsed;

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="agentId">Agent</label>
            <select className="input" id="agentId" value={agentId} onChange={(e) => { setAgentId(e.target.value); setSaved(""); }}>
              <option value="">Choose the agent</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <div><label className="label" htmlFor="statement">Commission statement (Excel)</label>
            <input className="input" id="statement" type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setError(""); setSaved(""); }} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={read} disabled={busy || !file}>Preview</button>
          <span className="text-xs text-muted">Nothing is saved until you check the preview and press Save.</span>
        </div>
      </div>
      {busy && <p className="text-sm text-muted">Working...</p>}
      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}

      {preview && sheet && p && (
        <>
          <div className="card space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label" htmlFor="sheet">Sheet{preview.sheets.length > 1 ? ` (this file has ${preview.sheets.length})` : ""}</label>
                <select className="input" id="sheet" value={sheetName} onChange={(e) => pick(preview, e.target.value)}>{preview.sheets.map((s) => <option key={s.name}>{s.name}</option>)}</select></div>
              <div><label className="label" htmlFor="month">Statement month</label>
                <input className="input" id="month" type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSaved(""); }} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {p.sections.map((s) => (
                <div key={s.key} className="rounded-md border border-line p-3">
                  <div className="text-lg font-bold">{money(s.sum)}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">{sectionLabel(s.key)}</div>
                  <div className="mt-1 text-xs text-muted">{s.count} {s.count === 1 ? "row" : "rows"}{s.fileTotal !== null && Math.abs(s.fileTotal - s.sum) <= 0.01 ? " · matches the sheet" : ""}</div>
                </div>
              ))}
              <div className="rounded-md border border-ink bg-ink p-3 text-white">
                <div className="text-lg font-bold text-gold">{money(p.net)}</div>
                <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Net commission</div>
                <div className="mt-1 text-xs text-white/70">{p.fileNet !== null && Math.abs(p.fileNet - p.net) <= 0.01 ? "Matches the sheet's grand total" : p.fileNet === null ? "No grand total row in the sheet" : "Check the warning below"}</div>
              </div>
            </div>
            {p.skippedBelow && <p className="text-xs text-muted">Everything below the grand total (the section to review) is left out.</p>}
            {p.problems.map((x) => <p key={x} role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{x}</p>)}
            {saved ? <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">{saved}</p> : (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn-gold" onClick={save} disabled={busy || !agentId || !month}>Save statement</button>
                <span className="text-xs text-muted">
                  {!agentId ? "Choose the agent first." : !month ? "Pick the statement month." : replaces ? `This replaces the ${monthLabel(month)} statement already saved for this agent.` : `Saves as the ${monthLabel(month)} statement.`}
                </span>
              </div>
            )}
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="w-full">
              <thead><tr className="border-b border-line">
                <th className="th">Client</th><th className="th">Section</th><th className="th">Company</th><th className="th">Policy #</th><th className="th">Eff date</th>
                <th className="th">Type</th><th className="th">Premium</th><th className="th">Commission</th>
              </tr></thead>
              <tbody>
                {p.lines.map((l, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="td font-semibold">{l.client}</td><td className="td">{sectionLabel(l.section)}</td><td className="td">{l.company}</td><td className="td">{l.policyNumber}</td>
                    <td className="td whitespace-nowrap">{l.effDate}</td><td className="td">{l.type}</td><td className="td">{money(l.premium)}</td>
                    <td className={`td font-semibold ${l.amount < 0 ? "text-red-700" : ""}`}>{money(l.amount)}</td>
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
