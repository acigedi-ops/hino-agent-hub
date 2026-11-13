import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { AGENCY_FEE } from "./fees";

const INK = rgb(0.055, 0.051, 0.051), GOLD = rgb(0.949, 0.757, 0.173), MUTED = rgb(0.35, 0.35, 0.35);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Standard fonts only cover Latin-1, so anything else in a name is dropped rather than crashing the PDF. */
const safe = (s: string) => s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "").trim();

/** One-page agency fee disclosure with the client's and agent's names filled in, ready to print and sign. */
export async function feeDisclosurePdf(o: { client: string; agent: string; date: string; logo?: Uint8Array }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Agency Fee Disclosure");
  const page: PDFPage = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const L = 54, W = 612 - 2 * L;
  const fee = `$${AGENCY_FEE.toFixed(2)}`;

  page.drawRectangle({ x: 0, y: 792 - 96, width: 612, height: 96, color: INK });
  if (o.logo) {
    const img = await pdf.embedPng(o.logo);
    const h = 64, w = (img.width / img.height) * h;
    page.drawImage(img, { x: L, y: 792 - 80, width: w, height: h });
  }
  page.drawText("AGENCY FEE DISCLOSURE", { x: 612 - L - bold.widthOfTextAtSize("AGENCY FEE DISCLOSURE", 18), y: 792 - 50, size: 18, font: bold, color: GOLD });
  page.drawText("AND CONSENT", { x: 612 - L - regular.widthOfTextAtSize("AND CONSENT", 11), y: 792 - 68, size: 11, font: regular, color: rgb(1, 1, 1) });

  let y = 792 - 132;
  const field = (label: string, value: string, x: number, w: number) => {
    page.drawText(label.toUpperCase(), { x, y: y + 16, size: 7.5, font: bold, color: MUTED });
    page.drawText(safe(value).slice(0, 60), { x, y, size: 12, font: regular, color: INK });
    page.drawLine({ start: { x, y: y - 4 }, end: { x: x + w, y: y - 4 }, thickness: 0.6, color: MUTED });
  };
  field("Client", o.client, L, 300); field("Date", o.date, L + 324, W - 324);
  y -= 44;
  field("Agent", o.agent, L, 300); field("Agency fee", fee, L + 324, W - 324);
  y -= 40;

  const para = (text: string, font = regular, size = 11, indent = 0) => {
    for (const line of wrap(text, font, size, W - indent)) { page.drawText(line, { x: L + indent, y, size, font, color: INK }); y -= size + 5; }
    y -= 6;
  };
  para(`Rhino Insurance charges an agency fee of ${fee} on new business. The fee covers the agency's work in placing your coverage, such as gathering your information, comparing insurance companies, and preparing and submitting your application.`);
  para("Please read the following before you sign:", bold);
  const points = [
    "This fee is charged by the agency. It is separate from, and in addition to, the premium charged by the insurance company.",
    "The fee is not part of your premium and is not paid to the insurance company.",
    "The agency may also be paid a commission by the insurance company for placing your policy.",
    "You may choose not to pay this fee and not to buy insurance through this agency.",
    "Any refund of this fee follows the agency's refund policy and applicable law.",
  ];
  for (const p of points) {
    page.drawCircle({ x: L + 5, y: y + 3.5, size: 1.8, color: INK });
    para(p, regular, 11, 16);
  }
  y -= 4;
  para(`I have read and understand this disclosure. I agree to pay the agency fee of ${fee}.`, bold);

  y -= 34;
  const sign = (label: string, x: number, w: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 0.8, color: INK });
    page.drawText(label, { x, y: y - 12, size: 8.5, font: regular, color: MUTED });
  };
  sign("Client signature", L, 300); sign("Date", L + 324, W - 324);
  y -= 52;
  sign("Client printed name", L, 300);
  y -= 52;
  sign("Agent signature", L, 300); sign("Date", L + 324, W - 324);

  page.drawText("Keep a signed copy in the client's file.", { x: L, y: 40, size: 8.5, font: regular, color: MUTED });
  return pdf.save();
}
