export const DOC_KINDS = ["Driver's license", "Registration", "Insurance card", "Declarations page", "Agency fee disclosure (signed)", "Signed form", "Other"];
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
