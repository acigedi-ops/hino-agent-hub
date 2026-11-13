import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/messages";
import { dueCount } from "@/lib/tasks";
import { logoutAction } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const [unread, due] = await Promise.all([unreadCount(u.id), dueCount(u)]);
  const nav: { href: string; label: string; badge?: number }[] = [
    { href: "/", label: "Home" },
    { href: "/tasks", label: "Tasks", badge: due },
    { href: "/inbox", label: "Inbox", badge: unread },
    { href: "/pipeline", label: "Applicants" },
    { href: "/clients", label: "Clients" },
    ...(u.role === "ADMIN" ? [{ href: "/admin/scoreboard", label: "Scoreboard" }, { href: "/admin/import", label: "Policy report" }, { href: "/admin/referrals", label: "Referrals" }, { href: "/admin/agents", label: "Agents" }, { href: "/admin/documents", label: "Agent documents" }] : []),
    { href: "/fees", label: "Agency fee" },
    { href: "/sources", label: "Referral sources" },
    { href: "/documents", label: "My documents" },
    { href: "/account", label: "My account" },
  ];
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-52 md:shrink-0 md:flex-col md:overflow-y-auto">
        <div className="flex items-center justify-between gap-3 p-3 md:block md:p-4">
          <Link href="/"><Image src="/brand/rhino-logo-cropped.png" alt="Rhino Insurance" width={90} height={80} priority className="h-12 w-auto md:h-20" /></Link>
          <nav className="flex flex-wrap gap-1 md:mt-6 md:flex-col">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-gold">{n.label}{n.badge ? <span className="ml-2 rounded-full bg-gold px-1.5 py-0.5 text-xs font-bold text-ink" aria-label={`${n.badge} ${n.href === "/tasks" ? "due" : "unread"}`}>{n.badge}</span> : null}</Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-3 py-2 text-xs md:mt-auto md:block md:p-4">
          <div><div className="font-semibold text-gold">{u.name}</div>
          <div className="text-white/60">{u.role === "ADMIN" ? "Owner" : "Agent"}</div></div>
          <form action={logoutAction}><button className="cursor-pointer md:mt-2 text-white/70 underline hover:text-gold">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
