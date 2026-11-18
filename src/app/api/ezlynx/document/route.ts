import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { applyEzDoc, readEzDoc } from "@/lib/ezlynx-docs";

/**
 * Zapier calls this when a document is added in EZLynx. Uses the same key as the sold signal (EZLYNX_SOLD_KEY in the
 * x-hub-key header). Only the document's details arrive; EZLynx does not give Zapier the file.
 */
export async function POST(req: Request) {
  const want = Buffer.from(process.env.EZLYNX_SOLD_KEY ?? ""), got = Buffer.from(req.headers.get("x-hub-key") ?? "");
  if (want.length < 24 || want.length !== got.length || !timingSafeEqual(want, got)) return new Response("Not found", { status: 404 });
  let body: Record<string, unknown>;
  try {
    const type = req.headers.get("content-type") ?? "";
    body = type.includes("json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  } catch { return Response.json({ result: "unreadable" }, { status: 400 }); }
  const doc = readEzDoc(body ?? {});
  if (!doc) return Response.json({ result: "skipped" });
  const result = await applyEzDoc(doc);
  if (result === "listed") revalidatePath("/contacts", "layout");
  return Response.json({ result });
}
