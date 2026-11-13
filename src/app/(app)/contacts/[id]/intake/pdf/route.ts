import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { contactScope, currentUser } from "@/lib/auth";
import { parseIntake } from "@/lib/intake";
import { fillIntakePdf } from "@/lib/intake-pdf";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const c = await db.contact.findFirst({ where: { id, ...contactScope(u) }, include: { intake: true } });
  if (!c?.intake) return new Response("Not found", { status: 404 });

  const template = await readFile(path.join(process.cwd(), "public/forms/rhino-intake-template.pdf"));
  const bytes = await fillIntakePdf(template, parseIntake(c.intake.data));
  await db.activity.create({ data: { contactId: c.id, userId: u.id, kind: "pdf", text: "Intake PDF opened" } });
  const name = c.fullName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="Rhino-Intake-${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
