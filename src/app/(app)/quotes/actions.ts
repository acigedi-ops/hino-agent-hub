"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireUser, type SessionUser } from "@/lib/auth";
import { parseDate } from "@/lib/contacts";
import { uploadProblem } from "@/lib/ops";
import { readUpload } from "@/lib/upload-read";
import { readQuoteForm } from "@/lib/quote-fields";
import { firstOwner, quoteScope, quoteTask } from "@/lib/quotes";
import type { FormState } from "@/components/ActionForm";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const money = (v: string) => { const n = Number(v.replace(/[$,\s]/g, "")); return v && Number.isFinite(n) && n >= 0 && n < 1e9 ? n : null; };
const MAX_FILES = 8;

/** Checks and reads the files in a form box. Returns a message for the person if one cannot be taken. */
async function readFiles(f: FormData, key: string) {
  const files = f.getAll(key).filter((x): x is File => x instanceof File && x.size > 0);
  if (files.length > MAX_FILES) return { error: `Attach up to ${MAX_FILES} files at a time.` } as const;
  const out = [];
  for (const file of files) {
    const up = await readUpload(file);
    const problem = uploadProblem(up);
    if (problem) return { error: `${file.name}: ${problem}` } as const;
    out.push(up);
  }
  return { files: out } as const;
}
const cleanName = (n: string) => n.replace(/[^\w.\- ()]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "file";
const saveFiles = (requestId: string, u: SessionUser, files: { name: string; type: string; data: Uint8Array<ArrayBuffer> }[], isQuote: boolean) =>
  db.quoteFile.createMany({ data: files.map((x) => ({ requestId, uploadedById: u.id, isQuote, filename: cleanName(x.name), mimeType: x.type, size: x.data.length, data: x.data })) });

const mine = (u: SessionUser, id: string) => db.quoteRequest.findFirst({ where: { id, ...quoteScope(u) }, select: { id: true, agentId: true, businessName: true, status: true } });

export async function createQuoteRequest(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const read = readQuoteForm((k) => s(f, k), (k) => f.getAll(k).map(String));
  if ("error" in read) return { error: read.error };
  const got = await readFiles(f, "files");
  if ("error" in got) return { error: got.error };
  const name = read.data.fields.dba ? `${read.data.fields.legal_name} (${read.data.fields.dba})` : read.data.fields.legal_name;
  const r = await db.quoteRequest.create({ data: { agentId: u.id, businessName: name.slice(0, 160), data: read.data }, select: { id: true } });
  if (got.files.length) await saveFiles(r.id, u, got.files, false);
  if (u.role !== "ADMIN") await quoteTask(r.id, "sent", (await firstOwner())?.id, `Quote request from ${u.name}: ${name}. Open Quote Desk.`, u.id);
  revalidatePath("/", "layout");
  redirect(`/quotes/${r.id}`);
}

/** A note on a request, with files if any. From the owner it asks the agent for more; from the agent it answers and hands the request back. */
export async function addQuoteNote(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const r = await mine(u, s(f, "requestId"));
  if (!r) return { error: "Request not found." };
  const text = s(f, "text").slice(0, 3000);
  const got = await readFiles(f, "files");
  if ("error" in got) return { error: got.error };
  if (!text && !got.files.length) return { error: "Write a note or attach a file." };
  if (text) await db.quoteNote.create({ data: { requestId: r.id, userId: u.id, text } });
  if (got.files.length) {
    await saveFiles(r.id, u, got.files, false);
    if (!text) await db.quoteNote.create({ data: { requestId: r.id, userId: u.id, text: `Added ${got.files.length === 1 ? "a file" : `${got.files.length} files`}.` } });
  }
  const open = r.status === "SENT" || r.status === "NEED_INFO";
  if (u.role === "ADMIN" && r.agentId !== u.id) {
    if (open) await db.quoteRequest.update({ where: { id: r.id }, data: { status: "NEED_INFO" } });
    await quoteTask(r.id, "info", r.agentId, `More info needed for the ${r.businessName} quote. Open Quote Desk.`, u.id);
  } else if (u.role !== "ADMIN") {
    if (open) await db.quoteRequest.update({ where: { id: r.id }, data: { status: "SENT" } });
    await quoteTask(r.id, "answer", (await firstOwner())?.id, `${u.name} answered on the ${r.businessName} quote. Open Quote Desk.`, u.id);
  }
  revalidatePath("/", "layout");
  return { ok: u.role === "ADMIN" ? "Sent to the agent." : "Sent to the office." };
}

export async function attachQuote(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const r = await mine(u, s(f, "requestId"));
  if (!r) return { error: "Request not found." };
  const premium = money(s(f, "premium")), down = s(f, "downPayment") ? money(s(f, "downPayment")) : null;
  if (!s(f, "carrier")) return { error: "Enter the carrier." };
  if (premium === null) return { error: "Enter the premium as a number." };
  if (s(f, "downPayment") && down === null) return { error: "Enter the down payment as a number." };
  const got = await readFiles(f, "quote");
  if ("error" in got) return { error: got.error };
  const have = await db.quoteFile.count({ where: { requestId: r.id, isQuote: true } });
  if (!got.files.length && !have) return { error: "Attach the quote file." };
  if (got.files.length) {
    // A new quote replaces the earlier one, so the agent never presents an old number.
    await db.quoteFile.deleteMany({ where: { requestId: r.id, isQuote: true } });
    await saveFiles(r.id, u, got.files, true);
  }
  await db.quoteRequest.update({ where: { id: r.id }, data: { status: "QUOTED", carrier: s(f, "carrier").slice(0, 120), premium, downPayment: down, expiresOn: parseDate(s(f, "expiresOn")), quotedAt: new Date(), closedAt: null, outcomeReason: null } });
  if (s(f, "text")) await db.quoteNote.create({ data: { requestId: r.id, userId: u.id, text: s(f, "text").slice(0, 3000) } });
  await quoteTask(r.id, "quoted", r.agentId === u.id ? null : r.agentId, `Quote ready for ${r.businessName}. Download it in Quote Desk and present it.`, u.id);
  revalidatePath("/", "layout");
  return { ok: "Quote attached. The agent has it on their To do list." };
}

export async function setQuoteOutcome(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const r = await mine(u, s(f, "requestId"));
  if (!r) return { error: "Request not found." };
  const outcome = s(f, "outcome");
  if (outcome === "DONE") {
    // The owner closes an accepted request once the policy is bound.
    if (u.role !== "ADMIN" || r.status !== "ACCEPTED") return { error: "Only an accepted request can be closed." };
    await db.quoteRequest.update({ where: { id: r.id }, data: { closedAt: new Date() } });
    await quoteTask(r.id, "bound", null, "", u.id);
    revalidatePath("/", "layout");
    return { ok: "Marked as bound." };
  }
  if (r.status !== "QUOTED") return { error: "There is no quote to answer yet." };
  if (outcome !== "ACCEPTED" && outcome !== "NOT_TAKEN") return { error: "Choose accepted or not taken." };
  const reason = s(f, "reason").slice(0, 500);
  if (outcome === "NOT_TAKEN" && !reason) return { error: "Say why the client did not take it." };
  await db.quoteRequest.update({ where: { id: r.id }, data: { status: outcome, outcomeReason: reason || null, closedAt: outcome === "NOT_TAKEN" ? new Date() : null } });
  await db.quoteNote.create({ data: { requestId: r.id, userId: u.id, text: outcome === "ACCEPTED" ? `Client accepted the quote.${reason ? ` ${reason}` : ""}` : `Client did not take the quote: ${reason}` } });
  const owner = await firstOwner();
  await quoteTask(r.id, "outcome", outcome === "ACCEPTED" ? owner?.id : null, `${r.businessName} accepted the quote. Bind it, then mark it bound in Quote Desk.`, u.id);
  revalidatePath("/", "layout");
  return { ok: outcome === "ACCEPTED" ? "Marked as accepted. The office will bind it." : "Marked as not taken." };
}
