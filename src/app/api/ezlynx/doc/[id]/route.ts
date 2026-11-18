import { db } from "@/lib/db";
import { linkIsValid } from "@/lib/ezlynx-sync";

/** Lets Zapier fetch one uploaded file to copy into EZLynx. Works only with the signed, short-lived link the hub sent. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!linkIsValid("doc", id, new URL(req.url))) return new Response("Not found", { status: 404 });
  const d = await db.document.findUnique({ where: { id } });
  if (!d) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(d.data), {
    headers: { "Content-Type": d.mimeType, "Content-Disposition": `attachment; filename="${d.filename.replace(/"/g, "")}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
  });
}
