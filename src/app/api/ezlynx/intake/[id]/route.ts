import { db } from "@/lib/db";
import { intakePdf, linkIsValid } from "@/lib/ezlynx-sync";

/** Lets Zapier fetch the filled intake PDF to copy into EZLynx. Works only with the signed, short-lived link the hub sent. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!linkIsValid("intake", id, new URL(req.url))) return new Response("Not found", { status: 404 });
  const c = await db.contact.findUnique({ where: { id }, select: { fullName: true, intake: { select: { data: true } } } });
  if (!c?.intake) return new Response("Not found", { status: 404 });
  const { bytes, filename } = await intakePdf(c);
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store" },
  });
}
