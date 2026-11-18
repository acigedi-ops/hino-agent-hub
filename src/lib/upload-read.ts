import type { Upload } from "@/lib/ops";

/**
 * Reads an uploaded file. An iPhone HEIC picture that reached the server as it is (the browser could not open it to
 * shrink it) is turned into a JPG here, so the assistant can read it and EZLynx accepts it.
 */
export async function readUpload(file: File): Promise<Upload> {
  const data = new Uint8Array(await file.arrayBuffer());
  const heic = /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  if (!heic) return { name: file.name, type: file.type, data };
  try {
    const { default: convert } = await import("heic-convert");
    const out = await convert({ buffer: data, format: "JPEG", quality: 0.7 });
    return { name: (file.name.replace(/\.[^.]+$/, "") || "photo") + ".jpg", type: "image/jpeg", data: new Uint8Array(out) as Uint8Array<ArrayBuffer> };
  } catch {
    // Kept as HEIC: it can still be saved to Documents, and the usual checks decide the rest.
    return { name: file.name, type: "image/heic", data };
  }
}
