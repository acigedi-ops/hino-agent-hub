import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, fmtMoney } from "@/lib/contacts";
import { today } from "@/lib/tasks";
import { SECTIONS, monthLabel, periodFor, periodLabel, periodMonths, stepPeriod, validPeriod, type Period, type SectionKey } from "@/lib/commission-parse";

const VIEWS: { key: Period["view"]; label: string }[] = [
  { key: "week", label: "Week" }, { key: "month", label: "Month" }, { key: "quarter", label: "Quarter" }, { key: "year", label: "Year" }, { key: "all", label: "All" },
];
const SHORT: Record<SectionKey, string> = { new: "New business", renewal: "Renewals", adjust: "Adjustments", deduction: "Deductions" };
const sum = (ns: number[]) => Math.round(ns.reduce((a, n) => a + n, 0) * 100) / 100;
const tone = (n: number) => (n < 0 ? "text-red-700" : "");

export default async function Commissions({ searchParams }: { searchParams: Promise<{ agent?: string; view?: string; p?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const admin = u.role === "ADMIN";

  // The owner can open any agent's statements. An agent only ever gets their own.
  const agents = admin
    ? await db.user.findMany({ where: { commissionStatements: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  const agentId = admin ? (agents.find((a) => a.id === sp.agent)?.id ?? agents[0]?.id ?? u.id) : u.id;
  const agentName = admin ? (agents.find((a) => a.id === agentId)?.name ?? u.name) : u.name;

  const statements = await db.commissionStatement.findMany({ where: { agentId }, orderBy: { month: "asc" }, select: { id: true, month: true, net: true, createdAt: true } });
  const latest = statements.at(-1)?.month ?? today().toISOString().slice(0, 7);
  const view: Period["view"] = VIEWS.some((v) => v.key === sp.view) ? (sp.view as Period["view"]) : "month";
  const key = validPeriod(view, sp.p ?? "") ? (sp.p ?? "") : periodFor(view, latest);
  const period: Period = { view, key };

  const range = periodMonths(period);
  const weekFrom = view === "week" ? new Date(Date.parse(key)) : null;
  const lines = await db.commissionLine.findMany({
    where: {
      statement: { agentId, ...(range ? { month: { gte: range.from, lte: range.to } } : {}) },
      ...(weekFrom ? { section: { not: "deduction" }, date: { gte: weekFrom, lt: new Date(weekFrom.getTime() + 7 * 864e5) } } : {}),
    },
    orderBy: [{ statement: { month: "asc" } }, { position: "asc" }],
    include: { statement: { select: { month: true } } },
  });

  const months = [...new Set(lines.map((l) => l.statement.month))];
  const many = months.length > 1 || view === "week";
  const bySection = (k: SectionKey, rows = lines) => rows.filter((l) => l.section === k);
  const total = (rows: typeof lines) => sum(rows.map((l) => Number(l.amount)));
  const net = total(lines);

  const q = (v: Period["view"], p: string) => `/commissions?${new URLSearchParams({ ...(admin ? { agent: agentId } : {}), view: v, ...(p ? { p } : {}) })}`;
  const used = statements.map((s) => s.month);

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{admin ? `Commissions: ${agentName}` : "My commissions"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {admin ? "What this agent sees under My commissions. Agents only see their own statements." : "Your commission statements, as uploaded by the office. Ask the owner about any line that looks wrong."}
          </p>
        </div>
        {admin && <Link className="btn-gold" href="/admin/commissions">Upload a statement</Link>}
      </div>

      {admin && agents.length > 1 && (
        <form className="flex items-center gap-2">
          <select className="input w-auto min-w-0 flex-1 md:flex-none" name="agent" defaultValue={agentId} aria-label="Agent">{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <button className="btn-quiet">Show</button>
        </form>
      )}

      {statements.length === 0 ? (
        <div className="card text-sm text-muted">{admin ? "No statements uploaded yet. Use Upload a statement to add the first one." : "No commission statement has been uploaded for you yet."}</div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {VIEWS.map((v) => (
                <Link key={v.key} href={q(v.key, v.key === "all" ? "" : periodFor(v.key, view === "month" ? key : latest))} aria-current={view === v.key ? "page" : undefined}
                  className={`rounded-full border px-3 py-1.5 text-sm font-medium ${view === v.key ? "border-ink bg-ink text-gold" : "border-line bg-white hover:bg-paper"}`}>{v.label}</Link>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {view !== "all" && <Link className="btn-quiet" href={q(view, stepPeriod(period, -1))}>Previous</Link>}
              <span className="px-1 text-base font-bold">{periodLabel(period)}</span>
              {view !== "all" && <Link className="btn-quiet" href={q(view, stepPeriod(period, 1))}>Next</Link>}
              {view === "month" && used.length > 1 && (
                <form className="flex items-center gap-2">
                  {admin && <input type="hidden" name="agent" value={agentId} />}<input type="hidden" name="view" value="month" />
                  <select className="input w-auto" name="p" defaultValue={used.includes(key) ? key : ""} aria-label="Jump to a statement">
                    {!used.includes(key) && <option value="">Statements</option>}{[...used].reverse().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                  <button className="btn-quiet">Go</button>
                </form>
              )}
            </div>
            {view === "week" && <p className="text-xs text-muted">A week shows the lines dated in that week (transaction date, or effective date when there is none). Monthly deductions are not included.</p>}
          </div>

          {lines.length === 0 ? (
            <div className="card text-sm text-muted">Nothing for {periodLabel(period)}. {view === "month" ? "No statement has been uploaded for this month." : "Try another period."}</div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <div className="card col-span-2 border-ink bg-ink text-white md:col-span-1">
                  <div className="text-2xl font-bold text-gold">{fmtMoney(net)}</div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Net commission</div>
                </div>
                {SECTIONS.filter((s) => view !== "week" || s.key !== "deduction").map((s) => {
                  const rows = bySection(s.key);
                  return (
                    <a key={s.key} href={`#${s.key}`} className="card block hover:bg-paper">
                      <div className={`text-xl font-bold ${tone(total(rows))}`}>{fmtMoney(total(rows))}</div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{SHORT[s.key]}</div>
                      <div className="mt-1 text-xs text-muted">{rows.length} {rows.length === 1 ? "line" : "lines"}</div>
                    </a>
                  );
                })}
              </div>

              {months.length > 1 && view !== "week" && (
                <section className="space-y-2">
                  <h2 className="h2">By month</h2>
                  <div className="card overflow-x-auto p-0">
                    <table className="w-full">
                      <thead><tr className="border-b border-line"><th className="th">Month</th>{SECTIONS.map((s) => <th key={s.key} className="th">{SHORT[s.key]}</th>)}<th className="th">Net commission</th></tr></thead>
                      <tbody>
                        {months.map((m) => {
                          const rows = lines.filter((l) => l.statement.month === m);
                          return (
                            <tr key={m} className="border-b border-line last:border-0">
                              <td className="td font-semibold"><Link className="underline" href={q("month", m)}>{monthLabel(m)}</Link></td>
                              {SECTIONS.map((s) => <td key={s.key} className={`td ${tone(total(bySection(s.key, rows)))}`}>{fmtMoney(total(bySection(s.key, rows)))}</td>)}
                              <td className="td font-bold">{fmtMoney(total(rows))}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {SECTIONS.map((s) => {
                const rows = bySection(s.key);
                if (!rows.length) return null;
                const deduction = s.key === "deduction";
                return (
                  <section key={s.key} id={s.key} className="scroll-mt-4 space-y-2">
                    <details open={rows.length <= 60 || view === "month"}>
                      <summary className="cursor-pointer"><span className="h2 inline-block">{s.label} ({rows.length})</span> <span className={`ml-2 text-sm font-bold ${tone(total(rows))}`}>{fmtMoney(total(rows))}</span></summary>
                      <div className="card mt-2 overflow-x-auto p-0">
                        <table className="w-full">
                          <thead><tr className="border-b border-line">
                            {deduction ? <><th className="th">Item</th><th className="th">Description</th><th className="th">For</th></> : <>
                              <th className="th">Client</th><th className="th">Company</th><th className="th">Policy #</th><th className="th">Eff date</th><th className="th">Trans date</th>
                              <th className="th">Type</th><th className="th">Premium</th></>}
                            {many && <th className="th">Statement</th>}
                            <th className="th">{deduction ? "Amount" : "Commission"}</th>
                          </tr></thead>
                          <tbody>
                            {rows.map((l) => (
                              <tr key={l.id} className="border-b border-line last:border-0">
                                {deduction ? <><td className="td font-semibold">{l.company}</td><td className="td">{l.client}</td><td className="td">{l.line}</td></> : <>
                                  <td className="td font-semibold">{l.client}</td><td className="td">{l.company}</td><td className="td">{l.policyNumber}</td>
                                  <td className="td whitespace-nowrap">{l.effDate ? fmtDate(l.effDate) : ""}</td><td className="td whitespace-nowrap">{l.transDate ? fmtDate(l.transDate) : ""}</td>
                                  <td className="td">{l.type}{l.line && <span className="block text-xs text-muted">{l.line}</span>}</td><td className={`td ${tone(Number(l.premium ?? 0))}`}>{l.premium === null ? "" : fmtMoney(Number(l.premium))}</td></>}
                                {many && <td className="td whitespace-nowrap">{monthLabel(l.statement.month)}</td>}
                                <td className={`td font-semibold ${tone(Number(l.amount))}`}>{fmtMoney(Number(l.amount))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </div>
  );
}
