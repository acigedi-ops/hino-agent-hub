"use server";
import { revalidatePath } from "next/cache";
import ExcelJS from "exceljs";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseUsDate } from "@/lib/ezlynx";
import { monthFromName, parseStatement, type ParsedStatement } from "@/lib/commission-parse";

const MAX_BYTES = 5 * 1024 * 1024;

export type SheetPreview = { name: string; month: string; parsed: ParsedStatement };
export type StatementPreview = { sheets: SheetPreview[] };

/** Every sheet of the workbook as rows of text cells. A merged title keeps its text in the first cell only. */
async function readSheets(file: File): Promise<{ name: string; rows: string[][] }[] | { error: string }> {
  if (file.size === 0) return { error: "That file is empty." };
  if (file.size > MAX_BYTES) return { error: "That file is over 5 MB." };
  if (!/\.xlsx$/i.test(file.name)) return { error: "Upload the statement as an Excel (.xlsx) file." };
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    let formulas = 0, answered = 0;
    const sheets = wb.worksheets.map((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          if (cell.isMerged && cell.master !== cell) { cells[col - 1] = ""; return; }
          const v = cell.value;
          // A formula whose answer is 0 can come through with no stored result.
          const formula = Boolean(v && typeof v === "object" && "formula" in v);
          if (formula) { formulas++; if ((v as { result?: unknown }).result !== undefined) answered++; }
          const result = formula ? ((v as { result?: unknown }).result ?? 0) : v;
          cells[col - 1] = result instanceof Date ? result.toISOString().slice(0, 10) : typeof result === "number" ? String(result) : (cell.text ?? "").trim();
        });
        rows.push(Array.from(cells, (c) => c ?? ""));
      });
      return { name: sheet.name, rows };
    });
    // A file written by a program rather than saved from Excel can hold formulas with no answers, which would all read as 0.
    if (formulas > 0 && answered === 0) return { error: "This file's formulas have no saved values. Open it in Excel, press Save, and upload it again." };
    return sheets;
  } catch {
    return { error: "That Excel file could not be read. Open it in Excel, save it again and retry." };
  }
}

export async function previewStatement(form: FormData): Promise<StatementPreview | { error: string }> {
  await requireAdmin();
  const file = form.get("file");
  if (!(file instanceof File)) return { error: "Choose the statement file first." };
  const sheets = await readSheets(file);
  if (!Array.isArray(sheets)) return sheets;
  const found = sheets.map((s) => ({ name: s.name, month: monthFromName(s.name) || monthFromName(file.name), parsed: parseStatement(s.rows) })).filter((s) => s.parsed.lines.length > 0);
  if (!found.length) return { error: "No commission statement was found in that file. Each sheet needs sections titled New business, Renewals, Endorsements or Deductions." };
  return { sheets: found };
}

export async function saveStatement(form: FormData): Promise<{ ok: string } | { error: string }> {
  const u = await requireAdmin();
  const file = form.get("file");
  const month = String(form.get("month") ?? "");
  const sheetName = String(form.get("sheet") ?? "");
  if (!(file instanceof File)) return { error: "Choose the statement file first." };
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) return { error: "Pick the statement month." };
  const agent = await db.user.findUnique({ where: { id: String(form.get("agentId") ?? "") }, select: { id: true, name: true } });
  if (!agent) return { error: "Pick the agent this statement is for." };
  const sheets = await readSheets(file);
  if (!Array.isArray(sheets)) return sheets;
  const sheet = sheets.find((s) => s.name === sheetName);
  if (!sheet) return { error: "That sheet is not in the file. Preview the file again." };
  const parsed = parseStatement(sheet.rows);
  if (!parsed.lines.length) return { error: "That sheet has no statement rows." };

  const date = (v: string) => (v ? parseUsDate(v) : null);
  const lines = parsed.lines.map((l, position) => ({
    section: l.section, position, company: l.company.slice(0, 120), client: l.client.slice(0, 200), policyNumber: l.policyNumber.slice(0, 60),
    effDate: date(l.effDate), transDate: date(l.transDate), date: date(l.transDate) ?? date(l.effDate),
    line: l.line.slice(0, 80), type: l.type.slice(0, 60), premium: l.premium, amount: l.amount,
  }));
  // One statement per agent per month: a new upload takes the place of the old one.
  const replaced = await db.$transaction(async (tx) => {
    const old = await tx.commissionStatement.deleteMany({ where: { agentId: agent.id, month } });
    await tx.commissionStatement.create({
      data: { agentId: agent.id, month, filename: file.name.slice(0, 200), sheet: sheet.name.slice(0, 120), net: parsed.net, uploadedById: u.id, lines: { create: lines } },
    });
    return old.count > 0;
  });
  revalidatePath("/commissions");
  revalidatePath("/admin/commissions");
  return { ok: `${replaced ? "Replaced" : "Saved"} the statement for ${agent.name}: ${lines.length} rows.` };
}

export async function deleteStatement(_: unknown, form: FormData): Promise<{ ok?: string; error?: string }> {
  await requireAdmin();
  await db.commissionStatement.deleteMany({ where: { id: String(form.get("id") ?? "") } });
  revalidatePath("/commissions");
  revalidatePath("/admin/commissions");
  return {};
}
