import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MAX_UPLOADS, assistantEnabled, runAssistant } from "@/lib/assistant";
import { uploadProblem, type Upload } from "@/lib/ops";
import { readUpload } from "@/lib/upload-read";
import { MAX_READ_IMAGE_BYTES, MAX_READ_PDF_BYTES } from "@/lib/documents";
import { CONTEXT_TURNS, getChat, saveExchange } from "@/lib/assistant-chats";

export const maxDuration = 300;

const historySchema = z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().min(1).max(12000) })).max(40);

/** Per-person cap so one login cannot run up the bill: 40 messages an hour. */
const used = new Map<string, number[]>();
const LIMIT = 40, WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
  if (!assistantEnabled()) return NextResponse.json({ error: "The assistant is not connected yet. It will start answering once the owner adds the Claude API key in the hosting settings." });

  const now = Date.now();
  const recent = (used.get(u.id) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) return NextResponse.json({ error: "You have sent a lot of messages this hour. Try again a little later." }, { status: 429 });
  used.set(u.id, [...recent, now]);

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "That message could not be read. Try again with smaller files." }, { status: 400 }); }
  const text = String(form.get("text") ?? "").trim().slice(0, 6000);
  let raw: unknown = [];
  try { raw = JSON.parse(String(form.get("history") ?? "[]")); } catch { /* treated as no history */ }
  const history = historySchema.safeParse(raw);
  // A message sent from a saved chat continues it. The earlier messages then come from the hub's own copy, not from the browser.
  const chatId = String(form.get("chatId") ?? "").trim() || null;
  const chat = chatId ? await getChat(u.id, chatId) : null;
  if (chatId && !chat) return NextResponse.json({ error: "That chat no longer exists. Start a new chat." }, { status: 404 });
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (!text && !files.length) return NextResponse.json({ error: "Type a message or attach a file." }, { status: 400 });
  if (files.length > MAX_UPLOADS) return NextResponse.json({ error: `Attach up to ${MAX_UPLOADS} files at a time.` }, { status: 400 });

  // Files from earlier messages of this chat that were never saved to Documents come along again, first in the list.
  await db.assistantUpload.deleteMany({ where: { createdAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } } });
  const waiting = chat ? await db.assistantUpload.findMany({ where: { chatId: chat.id, userId: u.id }, orderBy: { createdAt: "asc" }, take: MAX_UPLOADS }) : [];
  const uploads: Upload[] = waiting.map((w) => ({ name: w.name, type: w.type, data: new Uint8Array(w.data) as Uint8Array<ArrayBuffer>, earlier: true, pendingId: w.id }));
  for (const f of files) {
    const upload = await readUpload(f);
    const problem = uploadProblem(upload)
      ?? (upload.type === "application/pdf" && upload.data.length > MAX_READ_PDF_BYTES ? "PDFs sent to the assistant can be up to 20 MB. Upload it on the client's page instead." : null)
      ?? (upload.type.startsWith("image/") && upload.type !== "image/heic" && upload.data.length > MAX_READ_IMAGE_BYTES ? "That photo is too large for the assistant to read. Send it from a phone, or save it as a smaller JPG first." : null);
    if (problem) return NextResponse.json({ error: `${f.name}: ${problem}` }, { status: 400 });
    uploads.push(upload);
  }

  // The first turn must come from the person, so drop anything before their first message.
  const turns = chat ? chat.turns.slice(-CONTEXT_TURNS) : history.success ? history.data.slice(-CONTEXT_TURNS) : [];
  while (turns.length && turns[0].role !== "user") turns.shift();
  const reply = await runAssistant(u, turns, text, uploads);
  // Saved with the file names only; the files themselves live in the contact's Documents.
  const shown = text || "Please handle the attached files.";
  const savedId = await saveExchange(u.id, chat?.id ?? null, files.length ? `${shown}\n(Attached: ${files.map((f) => f.name).join(", ")})` : shown, reply);
  // Saved files leave the waiting list; new ones that were not saved join it, so the next message can still file them.
  const done = uploads.filter((f) => f.saved && f.pendingId).map((f) => f.pendingId!);
  if (done.length) await db.assistantUpload.deleteMany({ where: { id: { in: done } } });
  const keep = uploads.filter((f) => !f.saved && !f.pendingId).slice(0, Math.max(0, MAX_UPLOADS - (waiting.length - done.length)));
  for (const f of keep) await db.assistantUpload.create({ data: { userId: u.id, chatId: savedId, name: f.name, type: f.type, data: f.data } });
  revalidatePath("/", "layout");
  return NextResponse.json({ reply, chatId: savedId });
}
