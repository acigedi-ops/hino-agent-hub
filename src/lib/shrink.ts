/**
 * Runs in the browser before a photo is uploaded. A photo of any size (an iPhone HEIC picture included) becomes a JPG
 * no longer than 2400 pixels on its long side, which keeps a license or registration fully readable at 1 to 2 MB.
 * PDFs and anything the browser cannot open are passed on unchanged; the server deals with those.
 */
const LONG_SIDE = 2400, KEEP_UNDER = 1.5 * 1024 * 1024, TARGET = 3.5 * 1024 * 1024;
const isHeic = (f: File) => /^image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
const isPhoto = (f: File) => /^image\/(jpeg|png|webp)$/i.test(f.type) || isHeic(f);

async function open(f: File): Promise<{ source: CanvasImageSource; w: number; h: number; done: () => void }> {
  try {
    const b = await createImageBitmap(f, { imageOrientation: "from-image" });
    return { source: b, w: b.width, h: b.height, done: () => b.close() };
  } catch { /* some browsers only open the file through an image element */ }
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch (e) { URL.revokeObjectURL(url); throw e; }
}

export async function shrinkPhoto(f: File): Promise<File> {
  if (!isPhoto(f) || (!isHeic(f) && f.size <= KEEP_UNDER)) return f;
  try {
    const { source, w, h, done } = await open(f);
    if (!w || !h) { done(); return f; }
    const scale = Math.min(1, LONG_SIDE / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) { done(); return f; }
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    done();
    let blob: Blob | null = null;
    for (const q of [0.85, 0.7, 0.55]) {
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= TARGET) break;
    }
    if (!blob || (!isHeic(f) && blob.size >= f.size)) return f;
    return new File([blob], (f.name.replace(/\.[^.]+$/, "") || "photo") + ".jpg", { type: "image/jpeg", lastModified: f.lastModified });
  } catch { return f; }
}
