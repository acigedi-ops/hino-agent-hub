import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { unreadCount } from "@/lib/messages";
import { dueCount } from "@/lib/tasks";
import { logoutAction } from "@/app/actions";
import { MobileNav } from "@/components/MobileNav";
import { StackTables } from "@/components/StackTables";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const [unread, due] = await Promise.all([unreadCount(u.id), dueCount(u)]);
  const admin = u.role === "ADMIN";
  // The owner's menu is left as it is. Agents get a shorter one: Tasks and Inbox are one page (To do), and My documents
  // and My account are one page (My profile).
  const nav: { href: string; label: string; badge?: number; what?: string }[] = admin ? [
    { href: "/", label: "Home" },
    { href: "/ai-assistant", label: "AI Assistant" },
    { href: "/tasks", label: "Tasks", badge: due, what: "due" },
    { href: "/inbox", label: "Inbox", badge: unread, what: "unread" },
    { href: "/pipeline", label: "Applicants" },
    { href: "/clients", label: "Clients" },
    { href: "/admin/scoreboard", label: "Scoreboard" }, { href: "/admin/import", label: "Policy report" }, { href: "/admin/commissions", label: "Commission upload" }, { href: "/admin/referrals", label: "Referrals" }, { href: "/admin/agents", label: "Agents" }, { href: "/admin/documents", label: "Agent documents" },
    { href: "/fees", label: "Agency fee" },
    { href: "/commissions", label: "Commissions" },
    { href: "/sources", label: "Referral sources" },
    { href: "/documents", label: "My documents" },
    { href: "/account", label: "My account" },
  ] : [
    { href: "/", label: "Home" },
    { href: "/ai-assistant", label: "AI Assistant" },
    { href: "/tasks", label: "To do", badge: due + unread, what: "to do" },
    { href: "/pipeline", label: "Applicants" },
    { href: "/clients", label: "Clients" },
    { href: "/fees", label: "Agency fee" },
    { href: "/commissions", label: "My commissions" },
    { href: "/sources", label: "Referral sources" },
    { href: "/account", label: "My profile" },
  ];
  return (
    <div className="min-h-screen md:flex">
      <MobileNav nav={nav} name={u.name} role={u.role === "ADMIN" ? "Owner" : "Agent"}
        signOut={<form action={logoutAction}><button className="h-11 cursor-pointer px-2 text-white/80 underline">Sign out</button></form>} />
      <StackTables />
      <aside className="hidden bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-52 md:shrink-0 md:flex-col md:overflow-y-auto">
        <div className="p-4">
          <Link href="/"><Image src="/brand/rhino-logo-cropped.png" alt="Rhino Insurance" width={90} height={80} priority className="h-20 w-auto" /></Link>
          <nav className="mt-6 flex flex-col gap-1">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-gold">{n.label}{n.badge ? <span className="ml-2 rounded-full bg-gold px-1.5 py-0.5 text-xs font-bold text-ink" aria-label={`${n.badge} ${n.what}`}>{n.badge}</span> : null}</Link>
            ))}
          </nav>
        </div>
        <div className="mt-auto border-t border-white/10 p-4 text-xs">
          <div><div className="font-semibold text-gold">{u.name}</div>
          <div className="text-white/60">{u.role === "ADMIN" ? "Owner" : "Agent"}</div></div>
          <form action={logoutAction}><button className="mt-2 cursor-pointer text-white/70 underline hover:text-gold">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-8">{children}</main>
    </div>
  );
}
