"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

export type NavItem = { href: string; label: string; badge?: number };

const ICONS: Record<string, ReactNode> = {
  "/": <path d="M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10" />,
  "/tasks": <path d="M4.5 6.5h15v13h-15zM8 4v4M16 4v4M8.5 14l2.5 2.5 4.5-5" />,
  "/pipeline": <path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" />,
  "/clients": <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2.1.8 3.5 2.8 3.5 5.7" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  inbox: <path d="M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7" />,
};

function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[name]}</svg>;
}

function Badge({ n, label }: { n?: number; label: string }) {
  return n ? <span className="rounded-full bg-gold px-1.5 py-0.5 text-xs font-bold leading-none text-ink" aria-label={`${n} ${label}`}>{n}</span> : null;
}

const TABS = ["/", "/tasks", "/pipeline", "/clients"];

/** Phone-only navigation: a slim top bar, a bottom tab bar for the pages used all day, and a full menu behind the Menu tab. Hidden from tablet size up, where the sidebar shows. */
export function MobileNav({ nav, name, role, signOut }: { nav: NavItem[]; name: string; role: string; signOut: ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { document.body.style.overflow = open ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [open]);
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/")) || (href === "/pipeline" && path.startsWith("/contacts")) ;
  const unread = nav.find((n) => n.href === "/inbox")?.badge;
  const tabs = TABS.map((h) => nav.find((n) => n.href === h)!).filter(Boolean);
  const inMenu = !open && !tabs.some((t) => active(t.href));
  return (
    <div className="md:hidden">
      <header className="flex items-center justify-between bg-ink px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-white">
        <Link href="/" aria-label="Home"><Image src="/brand/rhino-logo-cropped.png" alt="Rhino Insurance" width={90} height={80} priority className="h-10 w-auto" /></Link>
        <Link href="/inbox" className="relative flex h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-white/90">
          <Icon name="inbox" />Inbox<Badge n={unread} label="unread" />
        </Link>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-ink text-white" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="flex items-center justify-between px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <span className="text-lg font-bold text-gold">Menu</span>
            <button type="button" className="h-11 rounded-md px-3 text-sm font-medium text-white/80 underline" onClick={() => setOpen(false)}>Close</button>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 pb-4">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active(n.href) ? "page" : undefined}
                className={`flex min-h-12 items-center justify-between rounded-md px-3 text-base font-medium ${active(n.href) ? "bg-white/10 text-gold" : "text-white/90"}`}>
                {n.label}<Badge n={n.badge} label={n.href === "/tasks" ? "due" : "unread"} />
              </Link>
            ))}
          </nav>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3 pb-[calc(4.25rem+env(safe-area-inset-bottom))] text-sm">
            <div><div className="font-semibold text-gold">{name}</div><div className="text-white/60">{role}</div></div>
            {signOut}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-white/10 bg-ink pb-[env(safe-area-inset-bottom)] text-white" aria-label="Main">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} onClick={() => setOpen(false)} aria-current={!open && active(t.href) ? "page" : undefined}
            className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${!open && active(t.href) ? "text-gold" : "text-white/75"}`}>
            <Icon name={t.href} />{t.label}
            {t.badge ? <span className="absolute right-[18%] top-1.5"><Badge n={t.badge} label="due" /></span> : null}
          </Link>
        ))}
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${open || inMenu ? "text-gold" : "text-white/75"}`}>
          <Icon name="menu" />Menu
        </button>
      </nav>
    </div>
  );
}
