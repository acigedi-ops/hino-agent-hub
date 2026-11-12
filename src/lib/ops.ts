import "server-only";
import type { Contact } from "@prisma/client";
import { db } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { normalizeEmail, normalizePhone, parseDate, stageLabel } from "@/lib/contacts";
import { intakeSchema, isValidVin, type IntakeData } from "@/lib/intake";
import { DOC_KINDS, DOC_TYPES, MAX_DOC_BYTES, sniffMatches } from "@/lib/documents";

/** The work behind the forms, shared with the assistant so both follow the same rules. */

export const logActivity = (contactId: string, userId: string, kind: string, text: string) =>
  db.activity.create({ data: { contactId, userId, kind, text } });

/** Finds an existing contact with the same phone or email, across all agents. */
export async function findDuplicate(phoneNorm: string | null, emailNorm: string | null, exceptId?: string) {
  const or = [phoneNorm && { phoneNorm }, emailNorm && { emailNorm }].filter(Boolean) as object[];
  if (!or.length) return null;
  return db.contact.findFirst({ where: { OR: or, NOT: exceptId ? { id: exceptId } : undefined }, include: { agent: true } });
}

export type NewContact = { fullName: string; phone?: string; email?: string; type?: string; leadSource?: string; priority?: string; agentId?: string };

export async function createContactCore(u: SessionUser, n: NewContact, opts: { allowNoPhoneOrEmail?: boolean } = {}): Promise<{ error: string } | { contact: Contact }> {
  const fullName = n.fullName.trim();
  const phone = (n.phone ?? "").trim();
  const email = (n.email ?? "").trim();
  if (fullName.length < 2) return { error: "Enter the person's or business's name." };
  const phoneNorm = normalizePhone(phone);
  const emailNorm = normalizeEmail(email);
  if (!phoneNorm && !emailNorm && !opts.allowNoPhoneOrEmail) return { error: "Enter a valid phone number or email so the hub can spot duplicates." };

  const dup = await findDuplicate(phoneNorm, emailNorm);
  if (dup) {
    return {
      error: dup.agentId === u.id || u.role === "ADMIN"
        ? `${dup.fullName} is already in the hub (${stageLabel(dup.stage)}, agent ${dup.agent.name}).`
        : `This person is already in the hub with ${dup.agent.name}. Message them or ask the owner before quoting.`,
    };
  }

  let agentId = u.id;
  if (u.role === "ADMIN" && n.agentId) {
    const agent = await db.user.findFirst({ where: { id: n.agentId, active: true } });
    if (!agent) return { error: "Pick an active agent." };
    agentId = agent.id;
  }
  const contact = await db.contact.create({
    data: {
      agentId, fullName, phone: phone || null, phoneNorm, email: email || null, emailNorm,
      type: n.type === "COMMERCIAL" ? "COMMERCIAL" : "PERSONAL",
      leadSource: n.leadSource || null,
      priority: ["High", "Normal", "Low"].includes(n.priority ?? "") ? n.priority : null,
    },
  });
  await logActivity(contact.id, u.id, "created", "Applicant added");
  return { contact };
}

export async function saveIntakeCore(u: SessionUser, c: Contact, raw: unknown, note = "Intake form saved"): Promise<{ error: string } | { data: IntakeData }> {
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
  await logActivity(c.id, u.id, "intake", note);
  return { data: d };
}

export type Upload = { name: string; type: string; data: Uint8Array<ArrayBuffer> };

/** Checks a file is one the hub accepts. Returns a message for the person if not. */
export function uploadProblem(f: Upload): string | null {
  if (f.data.length === 0) return "That file is empty.";
  if (f.data.length > MAX_DOC_BYTES) return "That file is over 10 MB. Take a smaller photo or compress the PDF.";
  if (!DOC_TYPES[f.type]) return "Only PDF, JPEG, PNG, WebP and HEIC files are accepted.";
  if (!sniffMatches(f.type, f.data)) return "That file does not look like a real PDF or image. Export it again and retry.";
  return null;
}

export async function saveDocumentCore(u: SessionUser, contactId: string, f: Upload, kindWanted: string) {
  const kind = DOC_KINDS.includes(kindWanted) ? kindWanted : "Other";
  const filename = f.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "document";
  const doc = await db.document.create({
    data: { contactId, uploadedById: u.id, kind, filename, mimeType: f.type, size: f.data.length, data: f.data },
    select: { id: true },
  });
  await logActivity(contactId, u.id, "document", `Document added: ${kind} (${filename})`);
  return { id: doc.id, kind, filename };
}
