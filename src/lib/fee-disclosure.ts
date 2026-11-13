import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

const INK = rgb(0.055, 0.051, 0.051), GOLD = rgb(0.949, 0.757, 0.173), MUTED = rgb(0.35, 0.35, 0.35);
const L = 54, W = 612 - 2 * L;

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
const money = (n: number) => "$" + n.toFixed(2);

/** A letter page with the black Rhino band across the top. */
async function start(title: string, subtitle: string, logo?: Uint8Array) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  const page: PDFPage = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 0, y: 792 - 96, width: 612, height: 96, color: INK });
  if (logo) {
    const img = await pdf.embedPng(logo);
    const h = 64, w = (img.width / img.height) * h;
    page.drawImage(img, { x: L, y: 792 - 80, width: w, height: h });
  }
  const head = title.toUpperCase();
  page.drawText(head, { x: 612 - L - bold.widthOfTextAtSize(head, 18), y: 792 - 50, size: 18, font: bold, color: GOLD });
  page.drawText(subtitle, { x: 612 - L - regular.widthOfTextAtSize(subtitle, 11), y: 792 - 68, size: 11, font: regular, color: rgb(1, 1, 1) });
  const field = (label: string, value: string, x: number, w: number, y: number) => {
    page.drawText(label.toUpperCase(), { x, y: y + 16, size: 7.5, font: bold, color: MUTED });
    page.drawText(safe(value).slice(0, 60), { x, y, size: 12, font: regular, color: INK });
    page.drawLine({ start: { x, y: y - 4 }, end: { x: x + w, y: y - 4 }, thickness: 0.6, color: MUTED });
  };
  return { pdf, page, regular, bold, field };
}

/** One-page agency fee disclosure with the client's name, agent and amount filled in, ready to print and sign. */
export async function feeDisclosurePdf(o: { client: string; agent: string; date: string; amount: number; logo?: Uint8Array }): Promise<Uint8Array> {
  const { pdf, page, regular, bold, field } = await start("Agency Fee Disclosure", "AND CONSENT", o.logo);
  const fee = money(o.amount);
  let y = 792 - 132;
  field("Client", o.client, L, 300, y); field("Date", o.date, L + 324, W - 324, y);
  y -= 44;
  field("Agent", o.agent, L, 300, y); field("Agency fee", fee, L + 324, W - 324, y);
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

/** The receipt the hub files in the client's file when an agency fee is paid. */
export async function feeReceiptPdf(o: { client: string; agent: string; paidOn: string; amount: number; reference: string; logo?: Uint8Array }): Promise<Uint8Array> {
  const { pdf, page, regular, bold, field } = await start("Agency Fee Receipt", "PAID", o.logo);
  let y = 792 - 132;
  field("Received from", o.client, L, 300, y); field("Date paid", o.paidOn, L + 324, W - 324, y);
  y -= 44;
  field("Agent", o.agent, L, 300, y); field("Reference", o.reference, L + 324, W - 324, y);
  y -= 56;
  page.drawRectangle({ x: L, y: y - 22, width: W, height: 48, borderColor: INK, borderWidth: 1 });
  page.drawText("Agency fee", { x: L + 14, y: y - 4, size: 12, font: regular, color: INK });
  const amt = money(o.amount);
  page.drawText(amt, { x: L + W - 14 - bold.widthOfTextAtSize(amt, 16), y: y - 6, size: 16, font: bold, color: INK });
  y -= 52;
  for (const line of wrap("This fee is charged by Rhino Insurance for its services. It is separate from the premium charged by the insurance company and is not paid to the insurance company.", regular, 10, W)) {
    page.drawText(line, { x: L, y, size: 10, font: regular, color: MUTED }); y -= 15;
  }
  page.drawText("Thank you for your business.", { x: L, y: y - 14, size: 11, font: bold, color: INK });
  return pdf.save();
}
