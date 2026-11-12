import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser();
  const nav = [
    { href: "/", label: "Home" },
    { href: "/pipeline", label: "Applicants" },
    { href: "/clients", label: "Clients" },
    ...(u.role === "ADMIN" ? [{ href: "/admin/import", label: "EZLynx report" }, { href: "/admin/agents", label: "Agents" }] : []),
    { href: "/account", label: "My account" },
  ];
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-ink text-white md:min-h-screen md:w-52 md:shrink-0">
        <div className="flex items-center justify-between gap-3 p-3 md:block md:p-4">
          <Link href="/"><Image src="/brand/rhino-logo-cropped.png" alt="Rhino Insurance" width={90} height={80} priority className="h-12 w-auto md:h-20" /></Link>
          <nav className="flex flex-wrap gap-1 md:mt-6 md:flex-col">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm font-medium text-white/85 hover:bg-white/10 hover:text-gold">{n.label}</Link>
            ))}
          </nav>
        </div>
        <div className="hidden border-t border-white/10 p-4 text-xs md:block">
          <div className="font-semibold text-gold">{u.name}</div>
          <div className="text-white/60">{u.role === "ADMIN" ? "Owner" : "Agent"}</div>
          <form action={logoutAction}><button className="mt-2 cursor-pointer text-white/70 underline hover:text-gold">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
