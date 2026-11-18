import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtMoney } from "@/lib/contacts";
import { monthLabel } from "@/lib/commission-parse";
import { ActionForm } from "@/components/ActionForm";
import { deleteStatement } from "./actions";
import { UploadForm } from "./UploadForm";

export default async function CommissionUpload() {
  await requireAdmin();
  const [agents, statements] = await Promise.all([
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.commissionStatement.findMany({ orderBy: [{ month: "desc" }, { createdAt: "desc" }], include: { agent: { select: { name: true } }, _count: { select: { lines: true } } } }),
  ]);
  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="h1">Commission upload</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Upload an agent&apos;s commission statement for a month. The agent then sees it under My commissions. Each agent has one statement per month, so uploading again for the same month replaces the old one.
        </p>
      </div>
      <UploadForm agents={agents} existing={statements.map((s) => ({ agentId: s.agentId, month: s.month }))} />
      <section className="space-y-2">
        <h2 className="h2">Saved statements</h2>
        <div className="card overflow-x-auto p-0">
          {statements.length === 0 ? <p className="p-4 text-sm text-muted">No statements uploaded yet.</p> : (
            <table className="w-full">
              <thead><tr className="border-b border-line"><th className="th">Agent</th><th className="th">Month</th><th className="th">Net commission</th><th className="th">Rows</th><th className="th">Uploaded</th><th className="th">Remove</th></tr></thead>
              <tbody>
                {statements.map((s) => (
                  <tr key={s.id} className="border-b border-line last:border-0">
                    <td className="td font-semibold"><Link className="underline" href={`/commissions?agent=${s.agentId}&view=month&p=${s.month}`}>{s.agent.name}</Link></td>
                    <td className="td whitespace-nowrap">{monthLabel(s.month)}</td>
                    <td className="td">{fmtMoney(Number(s.net))}</td>
                    <td className="td">{s._count.lines}</td>
                    <td className="td whitespace-nowrap">{s.createdAt.toLocaleDateString("en-US", { dateStyle: "medium", timeZone: "America/Los_Angeles" })}</td>
                    <td className="td"><ActionForm action={deleteStatement} submit="Remove" buttonClass="btn-quiet"><input type="hidden" name="id" value={s.id} /></ActionForm></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
