"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/ops";
import { MAX_FEE, shareOf } from "@/lib/fees";
import { feeContact, feeMonth, markFeePaid, requestPayLink } from "@/lib/fee-ops";
import type { FormState } from "@/components/ActionForm";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const dollars = (v: string) => Math.round(Number(v.replace(/[$,]/g, "")) * 100) / 100;
const usd = (n: number) => "$" + n.toFixed(2);

/** Makes an agency fee for a client picked from the hub or typed by name, and asks the payment account for a link. */
export async function createFeeLink(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const amount = dollars(s(f, "amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the fee amount, for example 55." };
  if (amount > MAX_FEE) return { error: `The most a fee can be is ${usd(MAX_FEE)}.` };
  const res = await feeContact(u, s(f, "contactId"), s(f, "name"));
  if ("error" in res) return { error: res.error };
  const c = res.contact;
  const open = await db.agencyFee.findFirst({ where: { contactId: c.id, status: "PENDING" } });
  if (open) return { error: `${c.fullName} already has a fee waiting for payment. Use that one, or cancel it first.` };
  const fee = await db.agencyFee.create({
    // The agent who takes the fee is credited. When the owner makes one, it goes to the client's agent.
    data: { contactId: c.id, agentId: u.role === "ADMIN" ? c.agentId : u.id, createdById: u.id, amount, agentShare: shareOf(amount) },
  });
  const link = await requestPayLink({ feeId: fee.id, client: c.fullName, email: c.email, amount });
  if (link) await db.agencyFee.update({ where: { id: fee.id }, data: link });
  await logActivity(c.id, u.id, "fee", `Agency fee of ${usd(amount)} created${res.created ? ". Applicant file made from the Agency fee tab" : ""}`);
  revalidatePath("/", "layout");
  redirect(`/fees?fee=${fee.id}`);
}

/** Mark a fee paid by hand or refund it (owner), or cancel an unpaid one (owner, or the agent whose fee it is). */
export async function reviewAgencyFee(_: FormState, f: FormData): Promise<FormState> {
  const u = await requireUser();
  const to = s(f, "to");
  const fee = await db.agencyFee.findUnique({ where: { id: s(f, "feeId") } });
  if (!fee || !["PAID", "VOID", "REFUNDED"].includes(to)) return { error: "Fee not found." };
  if (u.role !== "ADMIN" && !(to === "VOID" && fee.agentId === u.id)) return { error: "Only the owner can do that." };
  if (to === "REFUNDED" ? fee.status !== "PAID" : fee.status !== "PENDING") return { error: "This fee was already settled." };
  if (to === "PAID") await markFeePaid(fee.id, u.id);
  else {
    await db.agencyFee.update({ where: { id: fee.id }, data: { status: to as "VOID" | "REFUNDED" } });
    await logActivity(fee.contactId, u.id, "fee", `Agency fee ${to === "VOID" ? "cancelled" : "refunded"}`);
  }
  revalidatePath("/", "layout");
  return {};
}

/** Owner only: change what the agent is paid for one fee. */
export async function setFeeShare(_: FormState, f: FormData): Promise<FormState> {
  await requireAdmin();
  const fee = await db.agencyFee.findUnique({ where: { id: s(f, "feeId") } });
  const share = dollars(s(f, "share"));
  if (!fee || fee.paidOutAt) return { error: "This fee was already paid out." };
  if (!Number.isFinite(share) || share < 0 || share > Number(fee.amount)) return { error: "Enter an amount between 0 and the fee." };
  await db.agencyFee.update({ where: { id: fee.id }, data: { agentShare: share } });
  revalidatePath("/fees");
  return {};
}

/** Owner only: mark an agent's paid fees for a month as paid out to them. */
export async function markFeesPaidOut(_: FormState, f: FormData): Promise<FormState> {
  await requireAdmin();
  const range = feeMonth(s(f, "month"));
  if (!range) return { error: "Pick a month." };
  const res = await db.agencyFee.updateMany({ where: { agentId: s(f, "agentId"), status: "PAID", paidOutAt: null, paidAt: range }, data: { paidOutAt: new Date() } });
  revalidatePath("/fees");
  return { ok: `${res.count} marked as paid to the agent.` };
}
