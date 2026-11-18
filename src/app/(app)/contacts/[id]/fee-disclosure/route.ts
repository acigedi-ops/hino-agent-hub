import { readFile } from "fs/promises";
import path from "path";
import { db } from "@/lib/db";
import { contactScope, currentUser } from "@/lib/auth";
import { feeDisclosurePdf } from "@/lib/fee-disclosure";
import { AGENCY_FEE, MAX_FEE } from "@/lib/fees";
import { today } from "@/lib/tasks";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first", { status: 401 });
  const { id } = await params;
  const c = await db.contact.findFirst({ where: { id, ...contactScope(u) }, select: { fullName: true, agent: { select: { name: true } } } });
  if (!c) return new Response("Not found", { status: 404 });
  const logo = await readFile(path.join(process.cwd(), "public/brand/rhino-logo-cropped.png")).catch(() => undefined);
  const date = today().toLocaleDateString("en-US", { timeZone: "UTC", month: "2-digit", day: "2-digit", year: "numeric" });
  const asked = Number(new URL(req.url).searchParams.get("amount"));
  const amount = Number.isFinite(asked) && asked > 0 && asked <= MAX_FEE ? asked : AGENCY_FEE;
  const bytes = await feeDisclosurePdf({ client: c.fullName, agent: c.agent.name, date, amount, logo });
  const name = c.fullName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "client";
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Rhino-Agency-Fee-Disclosure-${name}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
