import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { RETENTION_KINDS, addDays, syncAutoTasks, taskScope, today } from "@/lib/tasks";
import { addTask } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { TaskRow } from "@/components/TaskRow";

const VIEWS = [
  { key: "all", label: "Everything" },
  { key: "followups", label: "Follow-ups" },
  { key: "retention", label: "Renewals and cancellations" },
] as const;

export default async function Tasks({ searchParams }: { searchParams: Promise<{ view?: string; agent?: string }> }) {
  const u = await requireUser();
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "all";
  const admin = u.role === "ADMIN";
  await syncAutoTasks();
  const t = today();
  const agents = admin ? await db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [];
  const agent = admin && agents.some((a) => a.id === sp.agent) ? sp.agent! : "";
  const where = {
    ...taskScope(u), ...(agent ? { assigneeId: agent } : {}),
    ...(view === "followups" ? { kind: { notIn: RETENTION_KINDS as string[] } } : view === "retention" ? { kind: { in: RETENTION_KINDS as string[] } } : {}),
  };
  const include = { assignee: { select: { name: true } }, contact: { select: { id: true, fullName: true, phone: true } }, policy: { select: { premium: true, expirationDate: true } } };
  const [open, done] = await Promise.all([
    db.task.findMany({ where: { ...where, doneAt: null }, orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }], take: 500, include }),
    db.task.findMany({ where: { ...where, doneAt: { gte: addDays(t, -14) } }, orderBy: { doneAt: "desc" }, take: 30, include }),
  ]);
  const groups = [
    { title: "Overdue", rows: open.filter((x) => x.dueOn < t) },
    { title: "Today", rows: open.filter((x) => x.dueOn.getTime() === t.getTime()) },
    { title: "Next 7 days", rows: open.filter((x) => x.dueOn > t && x.dueOn <= addDays(t, 7)) },
    { title: "Later", rows: open.filter((x) => x.dueOn > addDays(t, 7)) },
  ];
  const q = (v: string, a = agent) => `/tasks?view=${v}${a ? `&agent=${a}` : ""}`;
  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="h1">Tasks</h1>
        <p className="mt-1 text-sm text-muted">
          Your follow-ups, plus the ones the hub makes for you: a renewal task for every policy expiring within 30 days, a task for every cancel notice and cancellation on the policy report, and a task when a lost quote&apos;s requote date comes up.
          {admin ? " As the owner you see every agent's tasks." : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {VIEWS.map((v) => (
          <Link key={v.key} href={q(v.key)} aria-current={view === v.key ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium ${view === v.key ? "border-ink bg-ink text-gold" : "border-line bg-white hover:bg-paper"}`}>{v.label}</Link>
        ))}
        {admin && (
          <form className="ml-auto flex items-center gap-2">
            <input type="hidden" name="view" value={view} />
            <select className="input w-auto" name="agent" defaultValue={agent} aria-label="Agent"><option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            <button className="btn-quiet">Show</button>
          </form>
        )}
      </div>

      <ActionForm action={addTask} submit="Add task" className="card flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-64"><label className="label" htmlFor="title">New follow-up</label>
          <input className="input" id="title" name="title" maxLength={300} placeholder="Call back about the truck quote" required /></div>
        <div><label className="label" htmlFor="dueOn">Due</label><input className="input" id="dueOn" name="dueOn" type="date" defaultValue={t.toISOString().slice(0, 10)} /></div>
        {admin && (
          <div><label className="label" htmlFor="assigneeId">For</label>
            <select className="input" id="assigneeId" name="assigneeId" defaultValue={agent || u.id}>{agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        )}
      </ActionForm>
      <p className="-mt-3 text-xs text-muted">To tie a follow-up to a person, add it from their page under Follow-ups.</p>

      {open.length === 0 && <div className="card text-sm text-muted">Nothing open here. </div>}
      {groups.filter((g) => g.rows.length).map((g) => (
        <section key={g.title} className="space-y-2">
          <h2 className="h2">{g.title} ({g.rows.length})</h2>
          <div className="card p-0">{g.rows.map((x) => <TaskRow key={x.id} t={x} today={t} showAgent={admin} />)}</div>
        </section>
      ))}
      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Done in the last 14 days ({done.length})</summary>
          <div className="card mt-2 p-0">{done.map((x) => <TaskRow key={x.id} t={x} today={t} showAgent={admin} />)}</div>
        </details>
      )}
    </div>
  );
}
