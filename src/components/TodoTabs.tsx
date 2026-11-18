import Link from "next/link";
import { unreadCount } from "@/lib/messages";
import { dueCount } from "@/lib/tasks";
import type { SessionUser } from "@/lib/auth";

/** Agents see Tasks and Inbox as one page, To do, with a tab for each. */
export async function TodoTabs({ u, active }: { u: SessionUser; active: "tasks" | "messages" }) {
  const [unread, due] = await Promise.all([unreadCount(u.id), dueCount(u)]);
  const tab = (key: "tasks" | "messages", href: string, label: string, n: number, what: string) => (
    <Link href={href} aria-current={active === key ? "page" : undefined}
      className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-1 text-sm font-semibold md:min-h-9 ${active === key ? "border-gold-dark text-ink" : "border-transparent text-muted hover:text-ink"}`}>
      {label}{n ? <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-bold leading-none text-white" aria-label={`${n} ${what}`}>{n}</span> : null}
    </Link>
  );
  return (
    <div className="space-y-2">
      <h1 className="h1">To do</h1>
      <nav className="flex gap-5 border-b border-line" aria-label="To do">{tab("tasks", "/tasks", "Tasks", due, "due")}{tab("messages", "/inbox", "Messages", unread, "unread")}</nav>
    </div>
  );
}
