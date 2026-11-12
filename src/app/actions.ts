"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Stage } from "@prisma/client";
import { db } from "@/lib/db";
import { contactScope, hashPassword, requireAdmin, requireUser, signIn, signOut, type SessionUser } from "@/lib/auth";
import { MANUAL_STAGES, normalizeEmail, normalizePhone, parseDate, stageFromPolicies, stageLabel } from "@/lib/contacts";
import { intakeSchema, isValidVin } from "@/lib/intake";
import { DOC_KINDS, DOC_TYPES, MAX_DOC_BYTES, sniffMatches } from "@/lib/documents";
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

const log = (contactId: string, userId: string, kind: string, text: string) =>
  db.activity.create({ data: { contactId, userId, kind, text } });

/** Finds an existing contact with the same phone or email, across all agents. */
async function findDuplicate(phoneNorm: string | null, emailNorm: string | null, exceptId?: string) {
  const or = [phoneNorm && { phoneNorm }, emailNorm && { emailNorm }].filter(Boolean) as object[];
  if (!or.length) return null;
  return db.contact.findFirst({ where: { OR: or, NOT: exceptId ? { id: exceptId } : undefined }, include: { agent: true } });
}

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
  const fullName = s(f, "fullName");
  const phone = s(f, "phone");
  const email = s(f, "email");
  if (fullName.length < 2) return { error: "Enter the person's or business's name." };
  const phoneNorm = normalizePhone(phone);
  const emailNorm = normalizeEmail(email);
  if (!phoneNorm && !emailNorm) return { error: "Enter a valid phone number or email so the hub can spot duplicates." };

  const dup = await findDuplicate(phoneNorm, emailNorm);
  if (dup) {
    return {
      error: dup.agentId === u.id || u.role === "ADMIN"
        ? `${dup.fullName} is already in the hub (${stageLabel(dup.stage)}, agent ${dup.agent.name}).`
        : `This person is already in the hub with ${dup.agent.name}. Message them or ask the owner before quoting.`,
    };
  }

  let agentId = u.id;
  const wanted = s(f, "agentId");
  if (u.role === "ADMIN" && wanted) {
    const agent = await db.user.findFirst({ where: { id: wanted, active: true } });
    if (!agent) return { error: "Pick an active agent." };
    agentId = agent.id;
  }

  const c = await db.contact.create({
    data: {
      agentId, fullName, phone: phone || null, phoneNorm, email: email || null, emailNorm,
      type: s(f, "type") === "COMMERCIAL" ? "COMMERCIAL" : "PERSONAL",
      leadSource: s(f, "leadSource") || null,
      priority: ["High", "Normal", "Low"].includes(s(f, "priority")) ? s(f, "priority") : null,
    },
  });
  await log(c.id, u.id, "created", "Applicant added");
  redirect(`/contacts/${c.id}`);
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
  await log(c.id, u.id, "reassigned", `Reassigned to ${agent.name}`);
  revalidatePath("/", "layout");
  return { ok: `Now with ${agent.name}.` };
}

// ---------- intake ----------

export async function saveIntake(contactId: string, raw: unknown): Promise<FormState> {
  const u = await requireUser();
  const c = await ownedContact(u, contactId);
  const parsed = intakeSchema.safeParse(raw);
  if (!parsed.success) return { error: "Some fields are too long or invalid. Check the form and try again." };
  const d = parsed.data;
  if (d.text.full_name.length < 2) return { error: "Enter the applicant's full name." };
  const badVin = d.vehicles.find((v) => v.vin && !isValidVin(v.vin));
  if (badVin) return { error: `VIN ${badVin.vin} is not valid. A VIN has 17 characters and never uses I, O or Q.` };

  const phoneNorm = normalizePhone(d.text.phone1);
  const emailNorm = normalizeEmail(d.text.email);
  const dup = await findDuplicate(phoneNorm, emailNorm, c.id);
  if (dup) return { error: `That phone or email already belongs to ${dup.fullName} (agent ${dup.agent.name}).` };

  await db.$transaction([
    db.intake.upsert({ where: { contactId: c.id }, create: { contactId: c.id, data: d }, update: { data: d } }),
    db.contact.update({
      where: { id: c.id },
      data: {
        fullName: d.text.full_name,
        phone: d.text.phone1 || null, phoneNorm,
        email: d.text.email || null, emailNorm,
        dob: parseDate(d.text.dob),
        address: [d.text.address1, d.text.address2].filter(Boolean).join(", ") || null,
        type: d.choice.type === "Commercial" ? "COMMERCIAL" : "PERSONAL",
        leadSource: d.text.lead_source || null,
        priority: d.choice.priority || null,
      },
    }),
  ]);
  await log(c.id, u.id, "intake", "Intake form saved");
  revalidatePath("/", "layout");
  return { ok: "Intake saved." };
}

/** Looks up year, make and model for a VIN in the public NHTSA database. Returns null if it cannot be decoded. */
export async function decodeVin(vin: string): Promise<{ year: string; make: string; model: string } | null> {
  await requireUser();
  if (!isValidVin(vin)) return null;
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin.trim().toUpperCase())}?format=json`,
      { signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const r = (await res.json())?.Results?.[0];
    if (!r?.Make) return null;
    return { year: String(r.ModelYear ?? ""), make: String(r.Make ?? ""), model: String(r.Model ?? "") };
  } catch {
    return null;
  }
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

  await db.policy.create({ data: { contactId: c.id, line, carrier, policyNumber, premium, effectiveDate, expirationDate } });
  await db.contact.update({ where: { id: c.id }, data: { lostReason: null, requoteDate: null } });
  await syncStage(c.id);
  await log(c.id, u.id, "policy", `Policy bound: ${carrier} ${policyNumber}`);
  revalidatePath("/", "layout");
  return { ok: "Policy added. This contact is now a client." };
}

export async function setPolicyStatus(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireAdmin();
  const p = await db.policy.findFirst({ where: { id: s(f, "policyId"), contact: contactScope(u) } });
  const status = s(f, "status");
  if (!p || !["ACTIVE", "CANCELLED", "EXPIRED"].includes(status)) return { error: "Policy not found." };
  await db.policy.update({ where: { id: p.id }, data: { status: status as "ACTIVE" | "CANCELLED" | "EXPIRED" } });
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
  if (file.size > MAX_DOC_BYTES) return { error: "That file is over 10 MB. Take a smaller photo or compress the PDF." };
  if (!DOC_TYPES[file.type]) return { error: "Only PDF, JPEG, PNG, WebP and HEIC files are accepted." };
  const data = new Uint8Array(await file.arrayBuffer());
  if (!sniffMatches(file.type, data)) return { error: "That file does not look like a real PDF or image. Export it again and retry." };
  const kind = DOC_KINDS.includes(s(f, "kind")) ? s(f, "kind") : "Other";
  const filename = file.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "document";
  await db.document.create({ data: { contactId: c.id, uploadedById: u.id, kind, filename, mimeType: file.type, size: file.size, data } });
  await log(c.id, u.id, "document", `Document added: ${kind} (${filename})`);
  revalidatePath(`/contacts/${c.id}`);
  return { ok: `${kind} saved to this contact.` };
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
