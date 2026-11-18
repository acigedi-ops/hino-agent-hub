"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

type Turn = { role: "user" | "assistant"; text: string; files?: string[]; error?: boolean };

const ACCEPT = "application/pdf,image/jpeg,image/png,image/webp";

/** The part of the browser's built-in speech recognition this box uses. Safari and Chrome ship it under a webkit prefix. */
type Recognizer = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognizerCtor = new () => Recognizer;
const recognizerCtor = () => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};
const VOICE_ERRORS: Record<string, string> = {
  "not-allowed": "The microphone is blocked. Allow it for this site in your browser settings, then tap Speak again.",
  "service-not-allowed": "Voice typing is turned off on this phone. On iPhone, turn on Dictation in Settings, General, Keyboard.",
  "audio-capture": "No microphone was found.",
  network: "Voice needs an internet connection. Try again.",
  "no-speech": "I did not hear anything. Tap Speak and try again.",
};

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

/**
 * The assistant chat. "home" is the card on the Home page; "page" fills the AI Assistant page and can open on a saved chat.
 * Every exchange is saved by the hub, so a chat started on Home shows up in the AI Assistant page's list.
 */
export function AssistantBox({
  enabled, firstName, variant = "home", chatId: openChatId = null, initialTurns = [],
}: {
  enabled: boolean; firstName: string; variant?: "home" | "page"; chatId?: string | null; initialTurns?: { role: "user" | "assistant"; text: string }[];
}) {
  const router = useRouter();
  const page = variant === "page";
  const [chatId, setChatId] = useState<string | null>(openChatId);
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [canSpeak, setCanSpeak] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState("");
  const recognizer = useRef<Recognizer | null>(null);

  // Checked after mount so the server and the browser render the same first page.
  useEffect(() => {
    setCanSpeak(Boolean(recognizerCtor()));
    return () => recognizer.current?.abort();
  }, []);

  /** Starts or stops listening. Spoken words go into the message box after whatever is already typed; nothing is sent until the agent taps Send. */
  function toggleVoice() {
    if (listening) { recognizer.current?.stop(); return; }
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    const before = text.trim();
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    // One phrase per tap: continuous mode repeats words on some Android phones.
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const said = Array.from(e.results, (r) => r[0].transcript).join(" ").replace(/\s+/g, " ").trim();
      setText([before, said].filter(Boolean).join(" "));
    };
    rec.onerror = (e) => { if (e.error !== "aborted") setVoiceNote(VOICE_ERRORS[e.error] ?? "Voice did not work this time. Try again or type your message."); };
    rec.onend = () => { setListening(false); recognizer.current = null; };
    recognizer.current = rec;
    setVoiceNote("");
    try { rec.start(); setListening(true); } catch { setVoiceNote("Voice did not start. Try again or type your message."); }
  }

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [turns, busy]);

  async function send(message = text) {
    const msg = message.trim();
    if (busy || (!msg && !files.length)) return;
    recognizer.current?.abort();
    const body = new FormData();
    body.set("text", msg);
    if (chatId) body.set("chatId", chatId);
    files.forEach((f) => body.append("files", f));
    const shown = msg || "Please handle the attached files.";
    setTurns((t) => [...t, { role: "user", text: files.length ? `${shown}\n(Attached: ${files.map((f) => f.name).join(", ")})` : shown, files: files.map((f) => f.name) }]);
    setText(""); setFiles([]); setBusy(true);
    if (picker.current) picker.current.value = "";
    try {
      const res = await fetch("/assistant", { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { reply?: string; error?: string; chatId?: string };
      if (data.reply) {
        setTurns((t) => [...t, { role: "assistant", text: data.reply! }]);
        if (data.chatId) setChatId(data.chatId);
        // On the page, a brand new chat moves to its own address so it can be reopened and shows in the list.
        if (page && data.chatId && data.chatId !== chatId) router.replace(`/ai-assistant/${data.chatId}`);
        else router.refresh();
      }
      else setTurns((t) => [...t, { role: "assistant", text: data.error ?? "Something went wrong. Try again.", error: true }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", text: "The hub could not be reached. Check your connection and try again.", error: true }]);
    } finally { setBusy(false); }
  }

  const bubble = "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-base md:text-sm";
  return (
    <section className={page ? "flex h-full min-h-0 flex-col gap-3" : "card space-y-3"} aria-label="Assistant">
      {!page && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="h2">Ask the assistant</h2>
          <div className="flex items-center gap-2">
            {!enabled && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Not connected yet</span>}
            <Link href={chatId ? `/ai-assistant/${chatId}` : "/ai-assistant"} className="btn-quiet">Open</Link>
          </div>
        </div>
      )}
      {turns.length === 0 ? (
        page ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-2xl font-bold">Hi {firstName}. How can I help?</p>
            <p className="max-w-md text-sm text-muted">Ask about your clients and applicants, add a new applicant, or attach a driver&apos;s license or registration and I will fill the intake form.</p>
            {!enabled && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">Not connected yet</span>}
          </div>
        ) : (
          <p className="text-base text-muted md:text-sm">
            Hi {firstName}. Ask about your clients and applicants, add a new applicant, or attach a driver&apos;s license or registration and I will fill the intake form and file it under the right person.
          </p>
        )
      ) : (
        <div ref={log} className={`overflow-y-auto pr-1 ${page ? "min-h-0 flex-1" : "max-h-[60vh] md:max-h-[34rem]"}`} aria-live="polite">
          <div className={page ? "mx-auto max-w-3xl space-y-4 py-2" : "space-y-3"}>
            {turns.map((t, i) => (
              <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`${bubble} ${t.role === "user" ? "bg-ink text-white" : t.error ? "bg-red-50 text-red-800" : "bg-paper"}`}>
                  {t.role === "assistant" && !t.error ? <Rich text={t.text} /> : t.text}
                </div>
              </div>
            ))}
            {busy && <p className="text-sm text-muted">Working on it...</p>}
          </div>
        </div>
      )}
      <form className={page ? "mx-auto w-full max-w-3xl space-y-2" : "space-y-2"} onSubmit={(e) => { e.preventDefault(); send(); }}>
        <textarea
          className="input" rows={page ? 2 : 3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message to the assistant"
          placeholder="Ask a question, or attach a license or registration..."
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
        />
        {files.length > 0 && <p className="text-xs text-muted">Attached: {files.map((f) => f.name).join(", ")}</p>}
        {listening && <p className="text-xs font-semibold text-red-700" role="status">Listening... speak now, then check the text before you send.</p>}
        {voiceNote && !listening && <p className="text-xs text-red-700" role="status">{voiceNote}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-gold" disabled={busy || (!text.trim() && !files.length)}>{busy ? "Working..." : "Send"}</button>
          {canSpeak && (
            <button type="button" className={listening ? "btn-quiet ring-2 ring-red-500" : "btn-quiet"} onClick={toggleVoice} disabled={busy} aria-pressed={listening}>
              {listening ? "Stop listening" : "Speak"}
            </button>
          )}
          <input ref={picker} id="assistant-files" type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => setFiles([...(e.target.files ?? [])].slice(0, 6))} />
          <label htmlFor="assistant-files" className="btn-quiet cursor-pointer">Attach<span className={page ? "hidden md:inline" : undefined}>&nbsp;license or registration</span></label>
          {!page && turns.length > 0 && <button type="button" className="btn-quiet" onClick={() => { setTurns([]); setChatId(null); }} disabled={busy}>New chat</button>}
          <span className={page ? "hidden text-xs text-muted md:inline" : "text-xs text-muted"}>PDF or photo, up to 10 MB each. Always review what the assistant fills in.</span>
        </div>
      </form>
    </section>
  );
}
