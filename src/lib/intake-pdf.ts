import { PDFDocument } from "pdf-lib";
import { CHOICES, DRIVER_FIELDS, TEXT_FIELDS, VEHICLE_FIELDS, VIOLATION_FIELDS, type IntakeData } from "./intake";

/** Date inputs store yyyy-mm-dd. The printed form shows mm/dd/yyyy. */
export const usDate = (v: string) => v.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1");

/** Fills the branded template and returns the PDF bytes. */
export async function fillIntakePdf(template: Uint8Array | ArrayBuffer, d: IntakeData): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(template);
  const form = pdf.getForm();
  const text = (name: string, v: string) => { if (v) form.getTextField(name).setText(usDate(v)); };
  const check = (name: string) => form.getCheckBox(name).check();

  for (const k of TEXT_FIELDS) text(k, d.text[k]);
  for (const [group, options] of Object.entries(CHOICES)) {
    const picked = d.choice[group as keyof typeof CHOICES];
    const field = (options as Record<string, string>)[picked];
    if (field) check(field);
  }
  d.drivers.forEach((row, i) => {
    for (const k of DRIVER_FIELDS) text(`d${i + 1}_${k}`, row[k]);
    if (row.ddc) check(`d${i + 1}_ddc`);
    if (row.gs) check(`d${i + 1}_gs`);
  });
  d.vehicles.forEach((row, i) => {
    for (const k of VEHICLE_FIELDS) text(`v${i + 1}_${k}`, row[k]);
    if (row.liability_only === "Yes") check(`v${i + 1}_liab_yes`);
    if (row.liability_only === "No") check(`v${i + 1}_liab_no`);
  });
  d.violations.forEach((row, i) => {
    for (const k of VIOLATION_FIELDS) text(`x${i + 1}_${k}`, row[k]);
  });
  return pdf.save();
}
