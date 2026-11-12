"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { runReport, type Plan } from "@/lib/report-import";

const MAX_CHARS = 5_000_000;

export async function previewReport(text: string): Promise<Plan | { error: string }> {
  const u = await requireAdmin();
  if (typeof text !== "string" || !text.trim()) return { error: "That file is empty." };
  if (text.length > MAX_CHARS) return { error: "That file is too large. Export a shorter date range." };
  return runReport(u, text, false);
}

export async function applyReport(text: string, filename: string): Promise<Plan | { error: string }> {
  const u = await requireAdmin();
  if (typeof text !== "string" || !text.trim() || text.length > MAX_CHARS) return { error: "Upload the report again." };
  const plan = await runReport(u, text, true, String(filename || "report.csv"));
  revalidatePath("/", "layout");
  return plan;
}
