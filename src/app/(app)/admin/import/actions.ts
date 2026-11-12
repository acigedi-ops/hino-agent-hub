"use server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { parseCsv } from "@/lib/ezlynx";
import { runReport, type Plan } from "@/lib/report-import";

const MAX_BYTES = 5 * 1024 * 1024;

/** Turns an uploaded .xlsx or .csv into rows of text cells. */
async function readCells(file: File): Promise<string[][] | { error: string }> {
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > MAX_BYTES) return { error: "That file is over 5 MB. Export a shorter date range." };
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name)) return { error: "Upload the report as an Excel (.xlsx) or CSV file." };
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const sheet = wb.worksheets[0];
    if (!sheet) return { error: "That Excel file has no sheets." };
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const v = cell.value;
        cells[col - 1] = v instanceof Date ? v.toISOString().slice(0, 10) : typeof v === "number" ? String(v) : (cell.text ?? "").trim();
      });
      rows.push(Array.from(cells, (c) => c ?? ""));
    });
    return rows;
  } catch {
    return { error: "That Excel file could not be read. Open it in Excel, save it again and retry." };
  }
}

async function run(form: FormData, apply: boolean): Promise<Plan | { error: string }> {
  const u = await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Choose the report file first." };
  const cells = await readCells(file);
  if (!Array.isArray(cells)) return cells;
  const plan = await runReport(u, cells, apply, file.name, {
    carrier: String(form.get("carrier") ?? "").slice(0, 80),
    termMonths: Number(form.get("term")) === 6 ? 6 : 12,
    newClientsTo: String(form.get("agentId") ?? ""),
  });
  if (apply) revalidatePath("/", "layout");
  return plan;
}

export const previewReport = async (form: FormData) => run(form, false);
export const applyReport = async (form: FormData) => run(form, true);
