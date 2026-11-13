"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { contactScope, hashPassword, requireAdmin, requireUser, signIn, signOut, type SessionUser } from "@/lib/auth";
import { SOURCE_KINDS, MANUAL_STAGES, parseDate, stageFromPolicies, stageLabel } from "@/lib/contacts";
import { createContactCore, findReferrer, logActivity, saveDocumentCore, saveIntakeCore, uploadProblem } from "@/lib/ops";
import { lookupVin } from "@/lib/vin";
import { AGENT_DOC_KINDS } from "@/lib/agent-docs";
import { MAX_BODY, MAX_SUBJECT, replyTo, startConversation } from "@/lib/messages";
import { addDays, settleTasks, syncAutoTasks, taskScope, today } from "@/lib/tasks";
import type { FormState } from "@/components/ActionForm";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// ---------- sign in ----------

const attempts = new Map<string, { n: number; until: number }>();
const MAX_TRIES = 8;
const WINDOW_MS = 15 * 60 * 1000;

export async function loginAction(_: FormState, f: FormData): Promise<FormState> {
  const email = s(f, "email").toLowerCase();
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const key = `${ip}|${email}`;
  const now = Date.now();
  const a = attempts.get(key);
  if (a && a.until > now && a.n >= MAX_TRIES) return { error: "Too many attempts. Try again in 15 minutes." };
  if (!(await signIn(email, String(f.get("password") ?? "")))) {
    attempts.set(key, { n: a && a.until > now ? a.n + 1 : 1, until: now + WINDOW_MS });
    return { error: "Email or password is incorrect." };
  }
  attempts.delete(key);
  redirect("/");
}

export async function logoutAction() {
  await signOut();
  redirect("/login");
}

// ---------- helpers ----------

async function ownedContact(u: SessionUser, id: string) {
  const c = await db.contact.findFirst({ where: { id, ...contactScope(u) } });
  if (!c) throw new Error("Contact not found");
  return c;
}

const log = logActivity;

async function syncStage(contactId: string) {
  const [c, active, total] = await Promise.all([
    db.contact.findUniqueOrThrow({ where: { id: contactId } }),
    db.policy.count({ where: { contactId, status: "ACTIVE" } }),
    db.policy.count({ where: { contactId } }),
  ]);
  const next = stageFromPolicies(c.stage, active, total);
  if (next !== c.stage) await db.contact.update({ where: { id: contactId }, data: { stage: next } });
  return next;
}

// ---------- contacts ----------

export async function createContact(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const res = await createContactCore(u, {
    fullName: s(f, "fullName"), phone: s(f, "phone"), email: s(f, "email"), type: s(f, "type"),
    leadSource: s(f, "leadSource"), priority: s(f, "priority"), agentId: s(f, "agentId"), referralCode: s(f, "referralCode"), referralSourceId: s(f, "referralSourceId"),
  });
  if ("error" in res) return res;
  redirect(`/contacts/${res.contact.id}`);
}

export async function setStage(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const c = await ownedContact(u, s(f, "contactId"));
  const stage = s(f, "stage") as Stage;
  if (!MANUAL_STAGES.includes(stage)) return { error: "That stage is set automatically from policies." };
  if (c.stage === "CLIENT") return { error: "This contact has an active policy, so they stay a client." };
  if (stage === "QUOTED" && !(await db.intake.findUnique({ where: { contactId: c.id } })))
    return { error: "Fill the intake form before marking this applicant as quoted." };

  let lostReason: string | null = null;
  let requoteDate: Date | null = null;
  if (stage === "LOST") {
    lostReason = s(f, "lostReason");
    if (!lostReason) return { error: "Pick a reason so lost quotes can be reviewed later." };
    requoteDate = parseDate(s(f, "requoteDate"));
  }
  await db.contact.update({ where: { id: c.id }, data: { stage, lostReason, requoteDate } });
  await log(c.id, u.id, "stage", `Moved to ${stageLabel(stage)}${lostReason ? `: ${lostReason}` : ""}`);
  // A requote date makes a task; leaving Lost drops a requote task that no longer applies.
  if (stage !== "LOST") await db.task.updateMany({ where: { contactId: c.id, kind: "requote", doneAt: null }, data: { doneAt: new Date(), doneNote: `Moved to ${stageLabel(stage)}` } });
  await syncAutoTasks(true);
  revalidatePath("/", "layout");
  return { ok: `Moved to ${stageLabel(stage)}.` };
}

export async function addNote(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const c = await ownedContact(u, s(f, "contactId"));
  const text = s(f, "text").slice(0, 2000);
  if (!text) return { error: "Write a note first." };
  await log(c.id, u.id, "note", text);
  revalidatePath(`/contacts/${c.id}`);
  return {};
}

export async function reassignContact(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const c = await db.contact.findUnique({ where: { id: s(f, "contactId") } });
  const agent = await db.user.findFirst({ where: { id: s(f, "agentId"), active: true } });
  if (!c || !agent) return { error: "Pick an active agent." };
  await db.contact.update({ where: { id: c.id }, data: { agentId: agent.id } });
  // Open work follows the client to the new agent.
  await db.task.updateMany({ where: { contactId: c.id, doneAt: null }, data: { assigneeId: agent.id } });
  await log(c.id, u.id, "reassigned", `Reassigned to ${agent.name}`);
  revalidatePath("/", "layout");
  return { ok: `Now with ${agent.name}.` };
}

// ---------- referrals ----------

/** Records who referred this contact, for when the code was not entered at the start. */
export async function setReferrer(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const c = await ownedContact(u, s(f, "contactId"));
  if (c.referredById) return { error: "A referrer is already recorded for this contact." };
  const referrer = await findReferrer(s(f, "referralCode"));
  if (!referrer) return { error: "No one in the hub has that referral code." };
  if (referrer.id === c.id) return { error: "That is this person's own code." };
  await db.contact.update({ where: { id: c.id }, data: { referredById: referrer.id, referredAt: new Date(), leadSource: c.leadSource ?? "Referral" } });
  await log(c.id, u.id, "referral", `Referred by ${referrer.fullName}`);
  await log(referrer.id, u.id, "referral", `Referred ${c.fullName}`);
  revalidatePath(`/contacts/${c.id}`);
  return { ok: `Referred by ${referrer.fullName}.` };
}

/** Owner only: marks whether the referrer's reward for this referral has been sent. */
export async function setReferralRewarded(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const c = await db.contact.findUnique({ where: { id: s(f, "contactId") }, include: { referredBy: { select: { id: true, fullName: true } } } });
  if (!c?.referredBy) return { error: "Referral not found." };
  const sent = s(f, "sent") === "true";
  await db.contact.update({ where: { id: c.id }, data: { referralRewardedAt: sent ? new Date() : null } });
  await log(c.referredBy.id, u.id, "referral", sent ? `Reward sent for referring ${c.fullName}` : `Reward for referring ${c.fullName} marked not sent`);
  revalidatePath("/admin/referrals");
  return {};
}

// ---------- intake ----------

export async function saveIntake(contactId: string, raw: unknown): Promise<FormState> {
  const u = await requireUser();
  const res = await saveIntakeCore(u, await ownedContact(u, contactId), raw);
  if ("error" in res) return res;
  revalidatePath("/", "layout");
  return { ok: "Intake saved." };
}

/** Looks up year, make and model for a VIN in the public NHTSA database. Returns null if it cannot be decoded. */
export async function decodeVin(vin: string) {
  await requireUser();
  return lookupVin(vin);
}

// ---------- policies ----------

/** Owner only. Agents do not bind policies in the hub: clients come from the EZLynx report upload. */
export async function addPolicy(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const c = await ownedContact(u, s(f, "contactId"));
  const premium = Number(s(f, "premium").replace(/[$,]/g, ""));
  const effectiveDate = parseDate(s(f, "effectiveDate"));
  const expirationDate = parseDate(s(f, "expirationDate"));
  const carrier = s(f, "carrier");
  const policyNumber = s(f, "policyNumber");
  const line = s(f, "line");
  if (!carrier || !policyNumber || !line) return { error: "Enter the line, carrier and policy number." };
  if (!Number.isFinite(premium) || premium <= 0) return { error: "Enter the premium as a number, for example 1840.50." };
  if (!effectiveDate || !expirationDate) return { error: "Enter both the effective and expiration dates." };
  if (expirationDate <= effectiveDate) return { error: "The expiration date must be after the effective date." };

  await db.policy.create({ data: { contactId: c.id, line, carrier, policyNumber, premium, effectiveDate, expirationDate, writtenDate: effectiveDate } });
  await db.contact.update({ where: { id: c.id }, data: { lostReason: null, requoteDate: null } });
  await syncStage(c.id);
  await syncAutoTasks(true);
  await log(c.id, u.id, "policy", `Policy bound: ${carrier} ${policyNumber}`);
  revalidatePath("/", "layout");
  return { ok: "Policy added. This contact is now a client." };
}

export async function setPolicyStatus(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const p = await db.policy.findFirst({ where: { id: s(f, "policyId"), contact: contactScope(u) } });
  const status = s(f, "status");
  if (!p || !["ACTIVE", "CANCELLED", "EXPIRED"].includes(status)) return { error: "Policy not found." };
  await db.policy.update({ where: { id: p.id }, data: { status: status as "ACTIVE" | "CANCELLED" | "EXPIRED", cancelledAt: status === "CANCELLED" ? new Date() : null } });
  if (status !== "ACTIVE") await settleTasks(p.id, ["renewal", "cancel_notice"], `Policy marked ${status.toLowerCase()}`);
  await syncStage(p.contactId);
  await log(p.contactId, u.id, "policy", `Policy ${p.policyNumber} marked ${status.toLowerCase()}`);
  revalidatePath("/", "layout");
  return {};
}

// ---------- documents ----------

export async function uploadDocument(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const c = await ownedContact(u, s(f, "contactId"));
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };
  const upload = { name: file.name, type: file.type, data: new Uint8Array(await file.arrayBuffer()) };
  const problem = uploadProblem(upload);
  if (problem) return { error: problem };
  const doc = await saveDocumentCore(u, c.id, upload, s(f, "kind"));
  revalidatePath(`/contacts/${c.id}`);
  return { ok: `${doc.kind} saved to this contact.` };
}

export async function deleteDocument(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const d = await db.document.findUnique({ where: { id: s(f, "documentId") }, select: { id: true, contactId: true, kind: true, filename: true } });
  if (!d) return { error: "Document not found." };
  await db.document.delete({ where: { id: d.id } });
  await log(d.contactId, u.id, "document", `Document deleted: ${d.kind} (${d.filename})`);
  revalidatePath(`/contacts/${d.contactId}`);
  return {};
}

// ---------- agent compliance documents ----------

export async function uploadAgentDocument(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const file = f.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file first." };
  const upload = { name: file.name, type: file.type, data: new Uint8Array(await file.arrayBuffer()) };
  const problem = uploadProblem(upload);
  if (problem) return { error: problem };
  const kind = AGENT_DOC_KINDS.includes(s(f, "kind")) ? s(f, "kind") : "Other";
  // A W-9 does not expire, so a date left in the form from an earlier upload is ignored.
  const expiresOn = kind === "W-9" ? null : parseDate(s(f, "expiresOn"));
  if (kind === "Producer license" && !expiresOn) return { error: "Enter the date your license expires." };
  await db.agentDocument.create({
    data: { userId: u.id, kind, filename: upload.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "document", mimeType: upload.type, size: upload.data.length, data: upload.data, expiresOn },
  });
  revalidatePath("/", "layout");
  return { ok: `${kind} uploaded. The owner will review it.` };
}

/** Owner only: approves or rejects an agent's document. A rejection needs a reason the agent can act on. */
export async function reviewAgentDocument(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const approve = s(f, "decision") === "approve";
  const note = s(f, "note").slice(0, 300);
  if (!approve && !note) return { error: "Say what is wrong so the agent can fix it." };
  const d = await db.agentDocument.findUnique({ where: { id: s(f, "documentId") }, select: { id: true } });
  if (!d) return { error: "Document not found." };
  await db.agentDocument.update({ where: { id: d.id }, data: { status: approve ? "APPROVED" : "REJECTED", reviewNote: approve ? null : note, reviewedById: u.id, reviewedAt: new Date() } });
  revalidatePath("/", "layout");
  return {};
}

// ---------- admin ----------

export async function createAgent(_: FormState, f: FormData): Promise<FormState> {
  await requireAdmin();
  const name = s(f, "name");
  const email = s(f, "email").toLowerCase();
  const password = String(f.get("password") ?? "");
  if (name.length < 2 || !email.includes("@")) return { error: "Enter a name and a valid email." };
  if (password.length < 10) return { error: "The temporary password needs at least 10 characters." };
  if (await db.user.findUnique({ where: { email } })) return { error: "Someone with that email already has a login." };
  await db.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: s(f, "role") === "ADMIN" ? "ADMIN" : "AGENT" },
  });
  revalidatePath("/admin/agents");
  return { ok: `Login created for ${name}. Share the temporary password with them privately.` };
}

/** Owner only: fixes a login's name or email, for example after a typo. */
export async function renameAgent(_: FormState, f: FormData): Promise<FormState> {
  await requireAdmin();
  const id = s(f, "userId");
  const name = s(f, "name");
  const email = s(f, "email").toLowerCase();
  if (name.length < 2 || !email.includes("@")) return { error: "Enter a name and a valid email." };
  const taken = await db.user.findUnique({ where: { email } });
  if (taken && taken.id !== id) return { error: "Someone else already has that email." };
  await db.user.update({ where: { id }, data: { name, email } });
  revalidatePath("/", "layout");
  return { ok: "Saved." };
}

export async function setAgentActive(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const id = s(f, "userId");
  const active = s(f, "active") === "true";
  if (id === u.id) return { error: "You cannot disable your own login." };
  await db.user.update({ where: { id }, data: { active } });
  if (!active) await db.session.deleteMany({ where: { userId: id } });
  revalidatePath("/admin/agents");
  return {};
}

export async function resetPassword(_: FormState, f: FormData): Promise<FormState> {
  await requireAdmin();
  const password = String(f.get("password") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  const id = s(f, "userId");
  await db.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  await db.session.deleteMany({ where: { userId: id } });
  return { ok: "Password changed. They are signed out everywhere." };
}

export async function changeOwnPassword(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const password = String(f.get("password") ?? "");
  if (password.length < 10) return { error: "Use at least 10 characters." };
  if (password !== String(f.get("confirm") ?? "")) return { error: "The two passwords do not match." };
  await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(password) } });
  return { ok: "Password changed." };
}

// ---------- internal messages ----------

export async function sendMessage(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const subject = s(f, "subject"), body = s(f, "body");
  if (!subject) return { error: "Add a subject." };
  if (!body) return { error: "Write a message." };
  if (subject.length > MAX_SUBJECT || body.length > MAX_BODY) return { error: "That message is too long." };
  let contactId: string | null = s(f, "contactId") || null;
  // Only link a contact the sender is allowed to see.
  if (contactId && !(await db.contact.findFirst({ where: { id: contactId, ...contactScope(u) }, select: { id: true } }))) contactId = null;
  const res = await startConversation(u, f.getAll("to").map(String), subject, body, contactId);
  if ("error" in res) return { error: res.error };
  revalidatePath("/inbox");
  redirect(`/inbox/${res.id}`);
}

export async function replyMessage(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const body = s(f, "body");
  if (!body) return { error: "Write a reply." };
  if (body.length > MAX_BODY) return { error: "That message is too long." };
  const res = await replyTo(u, s(f, "conversationId"), body);
  if ("error" in res) return { error: res.error };
  revalidatePath("/inbox");
  return {};
}

// ---------- referral sources (businesses that send people) ----------

function sourceFields(f: FormData) {
  const opt = (k: string) => s(f, k).slice(0, 300) || null;
  return { name: s(f, "name").slice(0, 150), kind: SOURCE_KINDS.includes(s(f, "kind")) ? s(f, "kind") : "Other business",
    contactName: opt("contactName"), phone: opt("phone"), email: opt("email"), address: opt("address"), notes: s(f, "notes").slice(0, 2000) || null };
}

export async function createReferralSource(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const data = sourceFields(f);
  if (data.name.length < 2) return { error: "Enter the business name." };
  const dup = await db.referralSource.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } } });
  if (dup) return { error: `${dup.name} is already in the list.` };
  const src = await db.referralSource.create({ data: { ...data, createdById: u.id } });
  revalidatePath("/sources");
  redirect(`/sources/${src.id}`);
}

export async function updateReferralSource(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const src = await db.referralSource.findUnique({ where: { id: s(f, "id") } });
  if (!src) return { error: "Referral source not found." };
  // The list is shared, so only the person who added a source, or the owner, can change it.
  if (u.role !== "ADMIN" && src.createdById !== u.id) return { error: "Only the owner or the agent who added this source can edit it." };
  const data = sourceFields(f);
  if (data.name.length < 2) return { error: "Enter the business name." };
  const dup = await db.referralSource.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, NOT: { id: src.id } } });
  if (dup) return { error: `${dup.name} is already in the list.` };
  await db.referralSource.update({ where: { id: src.id }, data });
  revalidatePath("/sources");
  revalidatePath(`/sources/${src.id}`);
  return { ok: "Saved." };
}

export async function setReferralSource(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const c = await ownedContact(u, s(f, "contactId"));
  const id = s(f, "referralSourceId");
  const src = id ? await db.referralSource.findUnique({ where: { id } }) : null;
  if (id && !src) return { error: "Referral source not found." };
  if ((c.referralSourceId ?? "") === id) return {};
  await db.contact.update({ where: { id: c.id }, data: { referralSourceId: src?.id ?? null, leadSource: c.leadSource ?? (src ? "Referral" : null) } });
  await log(c.id, u.id, "referral", src ? `Referral source set to ${src.name}` : "Referral source removed");
  revalidatePath(`/contacts/${c.id}`);
  revalidatePath("/sources");
  return { ok: src ? `Sent by ${src.name}.` : "Removed." };
}

// ---------- tasks and follow-ups ----------

export async function addTask(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const title = s(f, "title").slice(0, 300);
  if (title.length < 2) return { error: "Say what needs to be done." };
  const dueOn = parseDate(s(f, "dueOn")) ?? today();
  const contactId = s(f, "contactId");
  const c = contactId ? await db.contact.findFirst({ where: { id: contactId, ...contactScope(u) }, select: { id: true, agentId: true } }) : null;
  if (contactId && !c) return { error: "Contact not found." };
  // Agents make tasks for themselves. The owner can give one to any agent; on a client it defaults to that client's agent.
  let assigneeId = u.id;
  if (u.role === "ADMIN") {
    const pick = s(f, "assigneeId") || c?.agentId || u.id;
    const a = await db.user.findFirst({ where: { id: pick, active: true }, select: { id: true } });
    if (!a) return { error: "Pick an active agent." };
    assigneeId = a.id;
  }
  await db.task.create({ data: { title, dueOn, assigneeId, createdById: u.id, contactId: c?.id ?? null } });
  revalidatePath("/", "layout");
  return { ok: "Task added." };
}

async function ownedTask(u: SessionUser, id: string) {
  return db.task.findFirst({ where: { id, ...taskScope(u) } });
}

export async function completeTask(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const t = await ownedTask(u, s(f, "taskId"));
  if (!t) return { error: "Task not found." };
  if (t.doneAt) return {};
  const note = s(f, "note").slice(0, 500);
  await db.task.update({ where: { id: t.id }, data: { doneAt: new Date(), doneNote: note || null } });
  if (t.contactId) await log(t.contactId, u.id, "task", `Done: ${t.title}${note ? `\n${note}` : ""}`);
  revalidatePath("/", "layout");
  return {};
}

export async function reopenTask(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const t = await ownedTask(u, s(f, "taskId"));
  if (!t) return { error: "Task not found." };
  await db.task.update({ where: { id: t.id }, data: { doneAt: null, doneNote: null } });
  revalidatePath("/", "layout");
  return {};
}

export async function snoozeTask(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const t = await ownedTask(u, s(f, "taskId"));
  const days = Number(s(f, "days"));
  if (!t || t.doneAt) return { error: "Task not found." };
  if (![1, 3, 7, 14].includes(days)) return { error: "Pick how long to push it back." };
  await db.task.update({ where: { id: t.id }, data: { dueOn: addDays(today(), days) } });
  revalidatePath("/", "layout");
  return {};
}
