import { db } from "@/lib/db";
import { viewScope, currentUser } from "@/lib/auth";
import { intakePdf } from "@/lib/ezlynx-sync";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const c = await db.contact.findFirst({ where: { id, ...viewScope(u) }, include: { intake: true } });
  if (!c?.intake) return new Response("Not found", { status: 404 });

  const { bytes, filename } = await intakePdf(c);
  await db.activity.create({ data: { contactId: c.id, userId: u.id, kind: "pdf", text: "Intake PDF opened" } });
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
