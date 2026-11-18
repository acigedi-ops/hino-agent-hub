import { NextResponse } from "next/server";
import { serviceSignIn } from "@/lib/auth";

/** Wrong keys are limited to 10 an hour across all callers, so the key cannot be guessed by trying many. */
let failures: number[] = [];

export async function POST(req: Request) {
  const now = Date.now();
  failures = failures.filter((t) => now - t < 36e5);
  if (failures.length >= 10) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  const key = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!key || !(await serviceSignIn(key))) {
    failures.push(now);
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
