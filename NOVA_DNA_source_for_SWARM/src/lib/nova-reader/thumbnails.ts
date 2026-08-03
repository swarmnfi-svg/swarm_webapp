import sharp from "sharp";
import { NOVA_READER_THUMB_MAX_EDGE } from "@/lib/nova-reader/limits";

/** Downscale image buffer to a JPEG data URL for UI preview. */
export async function bufferToThumbnailDataUrl(
  buffer: Buffer,
  mimeHint?: string
): Promise<string | null> {
  try {
    let pipeline = sharp(buffer, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();
    const w = meta.width || NOVA_READER_THUMB_MAX_EDGE;
    const h = meta.height || NOVA_READER_THUMB_MAX_EDGE;
    if (Math.max(w, h) > NOVA_READER_THUMB_MAX_EDGE) {
      pipeline = pipeline.resize({
        width: w >= h ? NOVA_READER_THUMB_MAX_EDGE : undefined,
        height: h > w ? NOVA_READER_THUMB_MAX_EDGE : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }
    const jpeg = await pipeline.jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    if (!jpeg.length) return null;
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch {
    // Fall back to raw data URL for small images.
    if (buffer.length > 1_500_000) return null;
    const mime =
      mimeHint && mimeHint.startsWith("image/")
        ? mimeHint
        : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }
}
