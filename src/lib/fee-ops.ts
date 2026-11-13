import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { contactScope, type SessionUser } from "@/lib/auth";
import { createContactCore, logActivity } from "@/lib/ops";
import { feeReceiptPdf } from "@/lib/fee-disclosure";
import { REQUIRED_DOCS } from "@/lib/documents";

/** A month as a range of timestamps, starting at midnight Pacific. */
export function feeMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [y, m] = month.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1, 8)), lt: new Date(Date.UTC(y, m, 1, 8)) };
}

/**
 * The client a fee is for. A picked client is used as is. A typed name is matched to one of this person's contacts, and
 * when nobody has that name an applicant file is made, so a fee always lands in a client file.
 */
export async function feeContact(u: SessionUser, contactId: string, name: string) {
  if (contactId) {
    const c = await db.contact.findFirst({ where: { id: contactId, ...contactScope(u) } });
    return c ? { contact: c, created: false } : { error: "Client not found." };
  }
  const fullName = name.replace(/\s+/g, " ").trim();
  if (fullName.length < 3 || !fullName.includes(" ")) return { error: "Pick a client, or type their first and last name." };
  const same = await db.contact.findMany({ where: { ...contactScope(u), fullName: { equals: fullName, mode: "insensitive" } }, take: 2 });
  if (same.length === 1) return { contact: same[0], created: false };
  if (same.length > 1) return { error: `More than one person in the hub is named ${fullName}. Open the right one and create the fee from their page.` };
  const made = await createContactCore(u, { fullName }, { allowNoPhoneOrEmail: true });
  return "error" in made ? made : { contact: made.contact, created: true };
}

/** True once the payment account is connected. Until then fees are made without a link. */
export const paymentsConnected = () => false;

/**
 * Asks the payment account for a link the client can pay on. Returns nothing until QuickBooks is connected, which leaves
 * the fee waiting with no link.
 */
export async function requestPayLink(fee: { feeId: string; client: string; email: string | null; amount: number }): Promise<{ payLink: string; externalId: string } | null> {
  void fee;
  return null;
}

/** Marks a fee paid and files its receipt in the client's file. `byUserId` is the owner when marked by hand. */
export async function markFeePaid(feeId: string, byUserId: string) {
  const fee = await db.agencyFee.findUnique({ where: { id: feeId }, include: { contact: { select: { fullName: true } }, agent: { select: { name: true } } } });
  if (!fee || fee.status !== "PENDING") return;
  const paidAt = new Date();
  await db.agencyFee.update({ where: { id: fee.id }, data: { status: "PAID", paidAt } });
  const logo = await readFile(path.join(process.cwd(), "public/brand/rhino-logo-cropped.png")).catch(() => undefined);
  const paidOn = paidAt.toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "2-digit", day: "2-digit", year: "numeric" });
  const bytes = await feeReceiptPdf({ client: fee.contact.fullName, agent: fee.agent.name, paidOn, amount: Number(fee.amount), reference: fee.externalId ?? fee.id.slice(-8).toUpperCase(), logo });
  const data = new Uint8Array(new ArrayBuffer(bytes.length));
  data.set(bytes);
  await db.document.create({
    data: { contactId: fee.contactId, uploadedById: byUserId, kind: REQUIRED_DOCS[0], filename: `Agency-fee-receipt-${paidAt.toISOString().slice(0, 10)}.pdf`, mimeType: "application/pdf", size: data.length, data },
  });
  await logActivity(fee.contactId, byUserId, "fee", `Agency fee of ${"$" + Number(fee.amount).toFixed(2)} paid. Receipt filed`);
}
