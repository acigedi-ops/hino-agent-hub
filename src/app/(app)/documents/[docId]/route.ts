import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

/** An agent can open their own documents. The owner can open anyone's. */
export async function GET(_: Request, { params }: { params: Promise<{ docId: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first", { status: 401 });
  const { docId } = await params;
  const d = await db.agentDocument.findFirst({ where: { id: docId, ...(u.role === "ADMIN" ? {} : { userId: u.id }) } });
  if (!d) return new Response("Not found", { status: 404 });
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
