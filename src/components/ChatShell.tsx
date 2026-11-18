"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ActionForm, type FormState } from "@/components/ActionForm";

export type ChatLink = { id: string; title: string; when: string };

/**
 * Frame of the AI Assistant page: the list of past chats beside the open chat.
 * From tablet size up the list is always visible. On a phone it slides in from the Chats button.
 */
export function ChatShell({
  chats, current, rename, remove, children,
}: {
  chats: ChatLink[]; current: { id: string; title: string } | null;
  rename: (prev: FormState, data: FormData) => Promise<FormState>; remove: (data: FormData) => Promise<void>; children: ReactNode;
}) {
  const [listOpen, setListOpen] = useState(false);
  const [mode, setMode] = useState<"" | "rename" | "delete">("");
  useEffect(() => { setListOpen(false); setMode(""); }, [current?.id, current?.title]);

  const list = (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Link href="/ai-assistant" className="btn-gold w-full" onClick={() => setListOpen(false)}>+ New chat</Link>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Past chats">
        {chats.length === 0 && <p className="px-2 text-sm text-muted">Your chats will show here.</p>}
        {chats.map((c) => (
          <Link key={c.id} href={`/ai-assistant/${c.id}`} aria-current={c.id === current?.id ? "page" : undefined} onClick={() => setListOpen(false)}
            className={`block rounded-md px-3 py-2 text-sm ${c.id === current?.id ? "bg-ink font-semibold text-gold" : "hover:bg-paper"}`}>
            <span className="block truncate">{c.title}</span>
            <span className={`block text-xs ${c.id === current?.id ? "text-white/60" : "text-muted"}`}>{c.when}</span>
          </Link>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="flex h-[calc(100dvh-10rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] min-h-80 gap-4 md:h-[calc(100dvh-4rem)]">
      <aside className="hidden w-64 shrink-0 rounded-lg border border-line bg-white p-3 md:block">{list}</aside>

      {listOpen && (
        <div className="fixed inset-0 z-[60] flex md:hidden" role="dialog" aria-modal="true" aria-label="Past chats">
          <div className="flex w-[85%] max-w-sm flex-col bg-white p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center justify-between">
              <span className="h2">Chats</span>
              <button type="button" className="btn-quiet" onClick={() => setListOpen(false)}>Close</button>
            </div>
            <div className="min-h-0 flex-1">{list}</div>
          </div>
          <button type="button" className="flex-1 bg-black/50" aria-label="Close chat list" onClick={() => setListOpen(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-3 rounded-lg border border-line bg-white p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2 border-b border-line pb-3">
          <button type="button" className="btn-quiet md:hidden" onClick={() => setListOpen(true)}>Chats</button>
          <span className="flex-1 md:hidden" />
          <h1 className="order-last min-w-0 basis-full truncate text-base font-bold md:order-none md:flex-1 md:basis-0">{current?.title ?? "New chat"}</h1>
          <Link href="/ai-assistant" className="btn-quiet md:hidden">New</Link>
          {current && mode === "" && (
            <>
              <button type="button" className="btn-quiet" onClick={() => setMode("rename")}>Rename</button>
              <button type="button" className="btn-quiet" onClick={() => setMode("delete")}>Delete</button>
            </>
          )}
        </div>
        {current && mode === "rename" && (
          <ActionForm action={rename} submit="Save name" buttonClass="btn-gold" className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={current.id} />
            <input className="input max-w-md flex-1" name="title" defaultValue={current.title} maxLength={80} aria-label="Chat name" required />
            <button type="button" className="btn-quiet" onClick={() => setMode("")}>Cancel</button>
          </ActionForm>
        )}
        {current && mode === "delete" && (
          <form action={remove} className="flex flex-wrap items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
            <input type="hidden" name="id" value={current.id} />
            <span className="flex-1">Delete this chat for good? Clients, notes and documents it saved are kept.</span>
            <button className="btn">Yes, delete</button>
            <button type="button" className="btn-quiet" onClick={() => setMode("")}>Cancel</button>
          </form>
        )}
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
