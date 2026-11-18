import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { emptyIntake, parseIntake } from "@/lib/intake";
import { fillIntakePdf } from "@/lib/intake-pdf";
import { EZLYNX_FILE_TYPES, buildEzlynxPayload, splitName } from "@/lib/ezlynx-push";

/**
 * Hands new applicants and their files to Zapier, where Zaps create them in EZLynx.
 * The Zap addresses live in Render: EZLYNX_ZAP_URL and EZLYNX_DOCS_ZAP_URL for personal applicants,
 * EZLYNX_ZAP_URL_COMMERCIAL and EZLYNX_DOCS_ZAP_URL_COMMERCIAL for commercial ones. Without an address nothing is sent.
 */

const ENV = { applicant: ["EZLYNX_ZAP_URL", "EZLYNX_ZAP_URL_COMMERCIAL"], docs: ["EZLYNX_DOCS_ZAP_URL", "EZLYNX_DOCS_ZAP_URL_COMMERCIAL"] } as const;
const hookFor = (kind: keyof typeof ENV, type: string) => {
  const url = process.env[ENV[kind][type === "COMMERCIAL" ? 1 : 0]]?.trim() ?? "";
  return url.startsWith("https://hooks.zapier.com/") ? url : "";
};
const hubUrl = () => (process.env.HUB_URL ?? process.env.RENDER_EXTERNAL_URL ?? "").replace(/\/$/, "");

/** Whether the owner has connected a Zap for this kind of applicant. */
export const ezlynxConnected = (type: string) => Boolean(hookFor("applicant", type));
export const ezlynxDocsConnected = (type: string) => Boolean(hookFor("docs", type) && hubUrl());

async function post(hook: string, body: unknown) {
  try {
    const res = await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    return res.ok ? null : `Zapier answered ${res.status}`;
  } catch (e) {
    return e instanceof Error && e.name === "TimeoutError" ? "Zapier did not answer in time" : "Could not reach Zapier";
  }
}

export type PushResult = { status: "sent" | "already" | "off" | "waiting" | "failed"; message: string };

/** Sends once. Safe to call after every save: it does nothing when the person was already sent or is not ready. */
export async function pushToEzlynx(contactId: string, userId: string): Promise<PushResult> {
  const c = await db.contact.findUnique({ where: { id: contactId }, include: { intake: true, agent: { select: { name: true, ezlynxUsername: true } } } });
  if (!c) return { status: "failed", message: "That contact no longer exists." };
  if (c.ezlynxSentAt) { await pushDocuments(c.id); return { status: "already", message: "Already sent to EZLynx." }; }
  const hook = hookFor("applicant", c.type);
  if (!hook) return { status: "off", message: "EZLynx is not connected yet." };
  const built = buildEzlynxPayload(c, c.intake ? parseIntake(c.intake.data) : null, c.agent, hubUrl());
  if ("missing" in built) return { status: "waiting", message: `Needs ${built.missing.join(", ")} before it can go to EZLynx.` };

  // Claim first, so two saves at the same moment cannot both send.
  const claimed = await db.contact.updateMany({ where: { id: c.id, ezlynxSentAt: null }, data: { ezlynxSentAt: new Date(), ezlynxError: null } });
  if (!claimed.count) return { status: "already", message: "Already sent to EZLynx." };
  const why = await post(hook, built.payload);
  if (why) {
    await db.contact.update({ where: { id: c.id }, data: { ezlynxSentAt: null, ezlynxError: why } });
    return { status: "failed", message: `Not sent to EZLynx: ${why}. Use "Send to EZLynx" on the contact to try again.` };
  }
  await db.activity.create({ data: { contactId: c.id, userId, kind: "ezlynx", text: "Sent to EZLynx" } });
  await pushDocuments(c.id);
  return { status: "sent", message: "Sent to EZLynx." };
}

/** For use after a save: never lets a problem with Zapier undo or block the save itself. */
export async function pushQuietly(contactId: string, userId: string): Promise<PushResult | null> {
  try { return await pushToEzlynx(contactId, userId); } catch (e) { console.error("EZLynx push failed", e); return null; }
}

// ---------- files ----------

/** Zapier fetches each file from the hub with a link that only works for a few days and cannot be guessed. */
const LINK_DAYS = 3;
const signingKey = () => createHash("sha256").update(Object.values(ENV).flat().map((k) => process.env[k] ?? "").join("|")).digest();
const sign = (what: string, id: string, exp: number) => createHmac("sha256", signingKey()).update(`${what}:${id}:${exp}`).digest("hex");

export function fileLink(what: "doc" | "intake", id: string) {
  const exp = Math.floor(Date.now() / 1000) + LINK_DAYS * 86400;
  return `${hubUrl()}/api/ezlynx/${what}/${id}?e=${exp}&t=${sign(what, id, exp)}`;
}

export function linkIsValid(what: "doc" | "intake", id: string, url: URL) {
  const exp = Number(url.searchParams.get("e")), t = url.searchParams.get("t") ?? "";
  if (!Object.values(ENV).flat().some((k) => process.env[k]) || !exp || exp < Date.now() / 1000) return false;
  const want = Buffer.from(sign(what, id, exp)), got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The filled intake PDF, as the agent would download it. */
export async function intakePdf(c: { fullName: string; intake: { data: unknown } | null }) {
  const template = await readFile(path.join(process.cwd(), "public/forms/rhino-intake-template.pdf"));
  const bytes = await fillIntakePdf(template, c.intake ? parseIntake(c.intake.data) : emptyIntake());
  const name = c.fullName.replace(/[^\w.\- ()]+/g, " ").replace(/\s+/g, " ").trim() || "client";
  return { bytes, filename: `Intake form - ${name}.pdf` };
}

/**
 * Copies the intake PDF and uploaded files to the person's Documents in EZLynx, each one once.
 * Only runs after the person themself was sent, since EZLynx files a document under an existing applicant.
 */
export async function pushDocuments(contactId: string): Promise<number> {
  const c = await db.contact.findUnique({
    where: { id: contactId },
    select: { id: true, fullName: true, type: true, email: true, phone: true, zip: true, ezlynxSentAt: true, ezlynxIntakeSentAt: true,
      intake: { select: { id: true, data: true } },
      documents: { where: { ezlynxSentAt: null, mimeType: { in: EZLYNX_FILE_TYPES } }, select: { id: true, kind: true, filename: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!c?.ezlynxSentAt) return 0;
  const hook = hookFor("docs", c.type);
  if (!hook || !hubUrl()) return 0;
  const name = splitName(c.fullName);
  const who = {
    hub_contact_id: c.id, type: c.type === "COMMERCIAL" ? "Commercial" : "Personal",
    first_name: name?.first ?? "", last_name: name?.last ?? "",
    business_name: c.type === "COMMERCIAL" ? ((c.intake && parseIntake(c.intake.data).text.business_name) || c.fullName) : "",
    // No zip: EZLynx corrects addresses, so a search by the zip the hub holds often finds nobody. The Zap then searches by name alone.
    zip: "", email: c.email ?? "", mobile_phone: c.phone ?? "", folder: "Rhino Agent Portal",
  };
  let sent = 0;

  if (c.intake && !c.ezlynxIntakeSentAt) {
    const claimed = await db.contact.updateMany({ where: { id: c.id, ezlynxIntakeSentAt: null }, data: { ezlynxIntakeSentAt: new Date() } });
    if (claimed.count) {
      const why = await post(hook, { ...who, document_name: "Intake form", file_name: (await intakePdf(c)).filename.replace(/^Intake form - /, ""), file_url: fileLink("intake", c.id) });
      if (why) await db.contact.update({ where: { id: c.id }, data: { ezlynxIntakeSentAt: null } }); else sent++;
    }
  }
  for (const d of c.documents) {
    const claimed = await db.document.updateMany({ where: { id: d.id, ezlynxSentAt: null }, data: { ezlynxSentAt: new Date() } });
    if (!claimed.count) continue;
    // The Zap names the file "document_name - file_name". A standard name such as "DL - Maria Lopez.jpg" is split so it arrives unchanged.
    const cut = d.filename.indexOf(" - ");
    const named = cut > 0 ? { document_name: d.filename.slice(0, cut), file_name: d.filename.slice(cut + 3) } : { document_name: d.kind, file_name: d.filename };
    const why = await post(hook, { ...who, ...named, file_url: fileLink("doc", d.id) });
    if (why) { await db.document.update({ where: { id: d.id }, data: { ezlynxSentAt: null } }); break; }
    sent++;
  }
  return sent;
}

export async function pushDocumentsQuietly(contactId: string) {
  try { return await pushDocuments(contactId); } catch (e) { console.error("EZLynx document push failed", e); return 0; }
}
