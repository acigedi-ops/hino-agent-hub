import { db } from "@/lib/db";
import { nameKey } from "@/lib/ezlynx";

export type EzDoc = { ref: string; name: string; folder: string; policyNumber: string; person: string; addedAt: Date };

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
/** The folder the hub's own uploads land in. Those files are already here, so they are not listed again. */
const OWN_FOLDER = /^rhino agent portal/i;

/** EZLynx writes 11/17/2026 4:49:32 PM. Only the day matters here, so it is kept as noon UTC of that day. */
function day(v: string): Date {
  const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  const d = m ? new Date(Date.UTC(+m[3], +m[1] - 1, +m[2], 12)) : new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Reads what Zapier sends for a new EZLynx document. Folders and the hub's own uploads return null. */
export function readEzDoc(raw: Record<string, unknown>): EzDoc | null {
  const ref = str(raw.DocumentId), name = str(raw.DocumentName), folder = str(raw.FolderPath);
  if (!ref || !name || /^folder$/i.test(str(raw.DocumentType))) return null;
  if (OWN_FOLDER.test(folder) || OWN_FOLDER.test(name)) return null;
  const person = `${str(raw.FirstName)} ${str(raw.LastName)}`.trim();
  return { ref, name: name.slice(0, 200), folder: folder.slice(0, 200), policyNumber: str(raw.PolicyNumber), person, addedAt: day(str(raw.DateCreated)) };
}

/** Lists the document on the right person: by policy number first, then by a name only one person in the hub has. */
export async function applyEzDoc(doc: EzDoc): Promise<string> {
  if (await db.ezlynxDoc.findUnique({ where: { ref: doc.ref }, select: { id: true } })) return "already recorded";
  let ids: string[] = [];
  if (doc.policyNumber) ids = [...new Set((await db.policy.findMany({ where: { policyNumber: doc.policyNumber }, select: { contactId: true }, take: 5 })).map((p) => p.contactId))];
  if (ids.length !== 1 && doc.person.length > 2) {
    const k = nameKey(doc.person), last = doc.person.split(/\s+/).pop()!;
    const same = (await db.contact.findMany({ where: { fullName: { contains: last, mode: "insensitive" } }, select: { id: true, fullName: true }, take: 200 })).filter((c) => nameKey(c.fullName) === k);
    if (same.length) ids = same.map((c) => c.id);
  }
  if (ids.length === 0) return "no match";
  if (ids.length > 1) return "more than one match";
  await db.ezlynxDoc.create({ data: { contactId: ids[0], ref: doc.ref, name: doc.name, folder: doc.folder || null, policyNumber: doc.policyNumber || null, addedAt: doc.addedAt } });
  return "listed";
}
