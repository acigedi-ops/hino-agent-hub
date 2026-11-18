import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/** A small one-page PDF that shows just the VIN, large enough to read and copy, with the vehicle under it. */
export async function vinPdf(vin: string, car: string): Promise<Uint8Array<ArrayBuffer>> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 300]);
  const bold = await pdf.embedFont(StandardFonts.CourierBold), plain = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("VIN", { x: 48, y: 228, size: 14, font: plain, color: rgb(0.4, 0.4, 0.4) });
  page.drawText(vin, { x: 48, y: 170, size: 40, font: bold });
  page.drawText(car, { x: 48, y: 120, size: 18, font: plain });
  pdf.setTitle(`VIN ${vin}`);
  return new Uint8Array(await pdf.save()) as Uint8Array<ArrayBuffer>;
}
