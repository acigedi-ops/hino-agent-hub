import { db } from "@/lib/db";
import { contactScope, currentUser } from "@/lib/auth";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first", { status: 401 });
  const { id, docId } = await params;
  const d = await db.document.findFirst({ where: { id: docId, contactId: id, contact: contactScope(u) } });
  if (!d) return new Response("Not found", { status: 404 });
  await db.activity.create({ data: { contactId: id, userId: u.id, kind: "document", text: `Document opened: ${d.kind} (${d.filename})` } });
  return new Response(Buffer.from(d.data), {
    headers: {
      "Content-Type": d.mimeType,
      "Content-Disposition": `inline; filename="${d.filename.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'",
      "Cache-Control": "private, no-store",
    },
  });
}
