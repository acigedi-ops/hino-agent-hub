/** Every client file needs these four. Each has its own box on the client's page. */
export const REQUIRED_DOCS = ["Agency fee receipt", "Signed dec page", "ID cards", "Signed fee disclosure"] as const;
export const REQUIRED_DOC_HINTS: Record<(typeof REQUIRED_DOCS)[number], string> = {
  "Agency fee receipt": "The receipt for the agency fee. The hub files it here when the fee is paid.",
  "Signed dec page": "The declarations page signed by the client.",
  "ID cards": "The insurance ID cards for each policy.",
  "Signed fee disclosure": "The agency fee disclosure signed by the client.",
};
export const OTHER_DOC_KINDS = ["Driver's license", "Registration", "Signed form", "Other"];
export const DOC_KINDS: string[] = [...REQUIRED_DOCS, ...OTHER_DOC_KINDS];
/** Which of the required documents a file is still missing, given the kinds it has. */
export const missingDocs = (kinds: Iterable<string>) => { const have = new Set(kinds); return REQUIRED_DOCS.filter((k) => !have.has(k)); };
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

/** File types the hub accepts, keyed by MIME type. Anything else is refused. */
export const DOC_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPEG image",
  "image/png": "PNG image",
  "image/webp": "WebP image",
  "image/heic": "HEIC image",
};

/** Checks the first bytes of a file against the type the browser claimed, so a renamed file cannot pass as a PDF or image. */
export function sniffMatches(mime: string, b: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  const ascii = (from: number, text: string) => [...text].every((ch, i) => b[from + i] === ch.charCodeAt(0));
  switch (mime) {
    case "application/pdf": return ascii(0, "%PDF-");
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47);
    case "image/webp": return ascii(0, "RIFF") && ascii(8, "WEBP");
    case "image/heic": return ascii(4, "ftyp");
    default: return false;
  }
}

export const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
