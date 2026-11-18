import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { applySold, readSold, type SoldInput } from "@/lib/sold";

/**
 * Zapier calls this when an opportunity changes in EZLynx. Off unless EZLYNX_SOLD_KEY is set (24+ characters) and the
 * caller sends the same value in the x-hub-key header. Anything that is not a sold opportunity is ignored.
 */
export async function POST(req: Request) {
  const want = Buffer.from(process.env.EZLYNX_SOLD_KEY ?? ""), got = Buffer.from(req.headers.get("x-hub-key") ?? "");
  if (want.length < 24 || want.length !== got.length || !timingSafeEqual(want, got)) return new Response("Not found", { status: 404 });
  let body: SoldInput;
  try {
    const type = req.headers.get("content-type") ?? "";
    body = type.includes("json") ? await req.json() : Object.fromEntries((await req.formData()).entries());
  } catch { return Response.json({ result: "unreadable" }, { status: 400 }); }
  const sold = readSold(body ?? {});
  if (!sold) return Response.json({ result: "not sold" });
  const result = await applySold(sold);
  if (result === "client" || result === "noted") revalidatePath("/", "layout");
  return Response.json({ result });
}
