import "server-only";
import { db } from "@/lib/db";
import { today } from "@/lib/tasks";

type Row = { added: number; quoted: number; won: number; lost: number; policies: number; premium: number; cancelled: number; tasksDone: number; overdue: number };
const blank = (): Row => ({ added: 0, quoted: 0, won: 0, lost: 0, policies: 0, premium: 0, cancelled: 0, tasksDone: 0, overdue: 0 });

/**
 * One month of results. "Added" leaves out people the policy report created, since nobody worked those as applicants.
 * "Won" is how many of the month's applicants are clients now, so the close rate follows a month's applicants through.
 */
export async function scoreboard(year: number, month: number) {
  // Date columns hold plain calendar dates. Timestamps are shifted so the month starts at midnight Pacific.
  const d0 = new Date(Date.UTC(year, month - 1, 1)), d1 = new Date(Date.UTC(year, month, 1));
  const t0 = new Date(d0.getTime() + 8 * 36e5), t1 = new Date(d1.getTime() + 8 * 36e5);
  const worked = { createdAt: { gte: t0, lt: t1 }, NOT: { leadSource: { in: ["Policy report", "EZLynx report"] } } };
  const [agents, added, moves, policies, cancelled, tasksDone, overdue, sources] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true, role: true } }),
    db.contact.findMany({ where: worked, select: { agentId: true, stage: true, leadSource: true, referralSourceId: true } }),
    db.activity.findMany({ where: { kind: "stage", createdAt: { gte: t0, lt: t1 }, OR: [{ text: { startsWith: "Moved to Quoted" } }, { text: { startsWith: "Moved to Lost" } }] }, select: { text: true, contactId: true, contact: { select: { agentId: true } } } }),
    db.policy.findMany({ where: { writtenDate: { gte: d0, lt: d1 } }, select: { premium: true, contact: { select: { agentId: true, leadSource: true, referralSourceId: true } } } }),
    db.policy.findMany({ where: { cancelledAt: { gte: t0, lt: t1 } }, select: { contact: { select: { agentId: true } } } }),
    db.task.groupBy({ by: ["assigneeId"], where: { doneAt: { gte: t0, lt: t1 } }, _count: true }),
    db.task.groupBy({ by: ["assigneeId"], where: { doneAt: null, dueOn: { lt: today() } }, _count: true }),
    db.referralSource.findMany({ select: { id: true, name: true } }),
  ]);

  const byAgent = new Map<string, Row>();
  const row = (id: string) => byAgent.get(id) ?? byAgent.set(id, blank()).get(id)!;
  type Src = { added: number; won: number; policies: number; premium: number };
  const bySource = new Map<string, Src>(), byBusiness = new Map<string, Src>();
  const src = (m: Map<string, Src>, k: string) => m.get(k) ?? m.set(k, { added: 0, won: 0, policies: 0, premium: 0 }).get(k)!;

  for (const c of added) {
    const r = row(c.agentId); r.added++;
    const won = c.stage === "CLIENT" || c.stage === "FORMER";
    if (won) r.won++;
    const s = src(bySource, c.leadSource || "Not set"); s.added++; if (won) s.won++;
    if (c.referralSourceId) { const b = src(byBusiness, c.referralSourceId); b.added++; if (won) b.won++; }
  }
  // A contact moved to Quoted twice in a month still counts once.
  const seen = new Set<string>();
  for (const m of moves) {
    const kind = m.text.startsWith("Moved to Quoted") ? "quoted" : "lost";
    if (seen.has(`${kind}:${m.contactId}`)) continue;
    seen.add(`${kind}:${m.contactId}`);
    row(m.contact.agentId)[kind]++;
  }
  for (const p of policies) {
    const n = Number(p.premium), r = row(p.contact.agentId);
    r.policies++; r.premium += n;
    const s = src(bySource, p.contact.leadSource || "Not set"); s.policies++; s.premium += n;
    if (p.contact.referralSourceId) { const b = src(byBusiness, p.contact.referralSourceId); b.policies++; b.premium += n; }
  }
  for (const p of cancelled) row(p.contact.agentId).cancelled++;
  for (const g of tasksDone) row(g.assigneeId).tasksDone = g._count;
  for (const g of overdue) row(g.assigneeId).overdue = g._count;

  const rows = agents.filter((a) => byAgent.has(a.id) || (a.active && a.role === "AGENT")).map((a) => ({ id: a.id, name: a.name, ...(byAgent.get(a.id) ?? blank()) }));
  const total = rows.reduce((t, r) => { for (const k of Object.keys(t) as (keyof Row)[]) t[k] += r[k]; return t; }, blank());
  const names = new Map(sources.map((s) => [s.id, s.name]));
  const list = (m: Map<string, Src>, label: (k: string) => string) =>
    [...m].map(([k, v]) => ({ key: k, name: label(k), ...v })).sort((a, b) => b.premium - a.premium || b.added - a.added);
  return { rows, total, leadSources: list(bySource, (k) => k), businesses: list(byBusiness, (k) => names.get(k) ?? "Removed source") };
}

export const rate = (won: number, added: number) => (added ? `${Math.round((won / added) * 100)}%` : "");
