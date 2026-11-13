import Link from "next/link";
import { completeTask, reopenTask, snoozeTask } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { fmtDate, fmtMoney } from "@/lib/contacts";
import { TASK_KINDS, type TaskKind } from "@/lib/tasks";

export type TaskView = {
  id: string; kind: string; title: string; dueOn: Date; doneAt: Date | null; doneNote: string | null;
  assignee?: { name: string } | null;
  contact?: { id: string; fullName: string; phone: string | null } | null;
  policy?: { premium: unknown; expirationDate: Date } | null;
};

const TONE: Record<string, string> = {
  manual: "bg-black/[0.06] text-ink", requote: "bg-blue-50 text-blue-800", renewal: "bg-amber-50 text-amber-800",
  cancel_notice: "bg-red-50 text-red-800", cancelled: "bg-red-50 text-red-800",
};

/** One task with its Done and push-back buttons. `today` is the office's date, so overdue is judged the same everywhere. */
export function TaskRow({ t, today, showAgent, showContact = true }: { t: TaskView; today: Date; showAgent?: boolean; showContact?: boolean }) {
  const late = Math.round((today.getTime() - t.dueOn.getTime()) / 864e5);
  const due = t.doneAt ? `Done ${fmtDate(t.doneAt)}` : late > 0 ? `${late} ${late === 1 ? "day" : "days"} overdue` : late === 0 ? "Today" : fmtDate(t.dueOn);
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line p-3 text-sm last:border-0">
      <div className="min-w-0 flex-1 basis-64">
        <div className={`break-words ${t.doneAt ? "text-muted line-through" : "font-medium"}`}>{t.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className={`rounded-full px-2 py-0.5 font-semibold ${TONE[t.kind] ?? TONE.manual}`}>{TASK_KINDS[t.kind as TaskKind] ?? "Follow-up"}</span>
          <span className={!t.doneAt && late > 0 ? "font-semibold text-red-700" : !t.doneAt && late === 0 ? "font-semibold text-ink" : ""}>{due}</span>
          {showContact && t.contact && <Link className="font-semibold text-ink underline" href={`/contacts/${t.contact.id}`}>{t.contact.fullName}</Link>}
          {showContact && t.contact?.phone && <span>{t.contact.phone}</span>}
          {t.policy && <span>{fmtMoney(Number(t.policy.premium))} premium</span>}
          {showAgent && t.assignee && <span>Agent: {t.assignee.name}</span>}
        </div>
        {t.doneNote && <div className="mt-1 whitespace-pre-wrap text-xs text-muted">{t.doneNote}</div>}
      </div>
      {t.doneAt ? (
        <ActionForm action={reopenTask} submit="Reopen" buttonClass="btn-quiet"><input type="hidden" name="taskId" value={t.id} /></ActionForm>
      ) : (
        <div className="flex flex-wrap items-start gap-2">
          <ActionForm action={snoozeTask} submit="Push back" className="flex items-start gap-1" buttonClass="btn-quiet">
            <input type="hidden" name="taskId" value={t.id} />
            <select className="input w-auto" name="days" aria-label="Push back by" defaultValue="1">
              <option value="1">Tomorrow</option><option value="3">3 days</option><option value="7">1 week</option><option value="14">2 weeks</option>
            </select>
          </ActionForm>
          <ActionForm action={completeTask} submit="Done" className="flex items-start gap-1" buttonClass="btn-gold">
            <input type="hidden" name="taskId" value={t.id} />
            <input className="input w-36" name="note" placeholder="What happened" aria-label="What happened (optional)" maxLength={500} />
          </ActionForm>
        </div>
      )}
    </div>
  );
}
