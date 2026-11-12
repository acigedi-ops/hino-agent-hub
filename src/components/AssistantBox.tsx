"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; text: string; files?: string[]; error?: boolean };

const IDEAS = ["What renews in the next 30 days?", "Find a client by name or phone", "Add a new applicant", "How does someone become a client?"];
const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

/** Renders the small amount of formatting the assistant uses: links, bold and line breaks. Everything else stays plain text. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]\n]+\]\((?:\/|https:\/\/)[^)\s]*\)|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(p);
        if (link) {
          return link[2].startsWith("/")
            ? <Link key={i} href={link[2]} className="font-semibold underline">{link[1]}</Link>
            : <a key={i} href={link[2]} target="_blank" rel="noreferrer" className="underline">{link[1]}</a>;
        }
        if (/^\*\*.+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function AssistantBox({ enabled, firstName }: { enabled: boolean; firstName: string }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [turns, busy]);

  async function send(message = text) {
    const msg = message.trim();
    if (busy || (!msg && !files.length)) return;
    const history = turns.filter((t) => !t.error).map(({ role, text }) => ({ role, text }));
    const body = new FormData();
    body.set("text", msg);
    body.set("history", JSON.stringify(history));
    files.forEach((f) => body.append("files", f));
    const shown = msg || "Please handle the attached files.";
    setTurns((t) => [...t, { role: "user", text: files.length ? `${shown}\n(Attached: ${files.map((f) => f.name).join(", ")})` : shown, files: files.map((f) => f.name) }]);
    setText(""); setFiles([]); setBusy(true);
    if (picker.current) picker.current.value = "";
    try {
      const res = await fetch("/assistant", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string };
      if (data.reply) { setTurns((t) => [...t, { role: "assistant", text: data.reply! }]); router.refresh(); }
      else setTurns((t) => [...t, { role: "assistant", text: data.error ?? "Something went wrong. Try again.", error: true }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "The hub could not be reached. Check your connection and try again.", error: true }]);
    } finally { setBusy(false); }
  }

  return (
    <section className="card space-y-3" aria-label="Assistant">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h2">Ask the assistant</h2>
        {!enabled && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Not connected yet</span>}
      </div>
      {turns.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            Hi {firstName}. Ask about your clients and applicants, add a new applicant, or attach a driver&apos;s license or registration and I will fill the intake form and file it under the right person.
          </p>
          <div className="flex flex-wrap gap-2">
            {IDEAS.map((q) => <button key={q} type="button" className="btn-quiet text-xs" onClick={() => send(q)} disabled={busy}>{q}</button>)}
          </div>
        </div>
      ) : (
        <div ref={log} className="max-h-96 space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {turns.map((t, i) => (
            <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${
                t.role === "user" ? "bg-ink text-white" : t.error ? "bg-red-50 text-red-800" : "bg-paper"}`}>
                {t.role === "assistant" && !t.error ? <Rich text={t.text} /> : t.text}
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-muted">Working on it...</p>}
        </div>
      )}
      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message to the assistant"
          placeholder="Ask a question, or attach a license or registration..."
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        {files.length > 0 && <p className="text-xs text-muted">Attached: {files.map((f) => f.name).join(", ")}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-gold" disabled={busy || (!text.trim() && !files.length)}>{busy ? "Working..." : "Send"}</button>
          <input ref={picker} id="assistant-files" type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 6))} />
          <label htmlFor="assistant-files" className="btn-quiet cursor-pointer">Attach license or registration</label>
          {turns.length > 0 && <button type="button" className="btn-quiet" onClick={() => setTurns([])} disabled={busy}>New chat</button>}
          <span className="text-xs text-muted">PDF or photo, up to 10 MB each. Always review what the assistant fills in.</span>
        </div>
      </form>
    </section>
  );
}
