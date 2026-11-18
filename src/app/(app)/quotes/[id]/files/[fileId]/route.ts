import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { quoteScope } from "@/lib/quotes";

export async function GET(_: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const u = await currentUser();
  if (!u) return new Response("Sign in first", { status: 401 });
  const { id, fileId } = await params;
  const d = await db.quoteFile.findFirst({ where: { id: fileId, requestId: id, request: quoteScope(u) } });
  if (!d) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(d.data), {
    headers: {
      "Content-Type": d.mimeType,
      "Content-Disposition": `${d.isQuote ? "attachment" : "inline"}; filename="${d.filename.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; object-src 'self'",
      "Cache-Control": "private, no-store",
    },
  });
}
