/**
 * Camera / photo preprocess for NOVA Reader vision.
 * PDF text-first path is unchanged — this only runs on image uploads.
 */

import sharp from "sharp";
import {
  NOVA_READER_IMAGE_JPEG_QUALITY,
  NOVA_READER_IMAGE_LONG_EDGE,
  NOVA_READER_IMAGE_MAX_VISION_BYTES,
  NOVA_READER_IMAGE_MIN_SHORT_EDGE,
} from "@/lib/nova-reader/limits";

export type PreprocessedImage = {
  buffer: Buffer;
  mime: "image/jpeg" | "image/png" | "image/webp";
  width: number;
  height: number;
  /** True when we rotated, resized, recompressed, inverted, or converted format. */
  transformed: boolean;
  /** Dark UI / low-light path applied (invert + contrast). */
  darkEnhanced: boolean;
};

const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
]);

export function isNovaReaderImageExtension(ext: string): boolean {
  return IMAGE_EXTS.has(ext.toLowerCase());
}

export function novaReaderMimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".heic":
    case ".heif":
      return "image/heic";
    case ".jpg":
    case ".jpeg":
    default:
      return "image/jpeg";
  }
}

/** Mean of R/G/B channel means — low values ≈ dark UI / low light. */
export async function imageMeanLuminance(buffer: Buffer): Promise<number> {
  const stats = await sharp(buffer, { failOn: "none" }).stats();
  const rgb = stats.channels.slice(0, 3);
  if (!rgb.length) return 128;
  return rgb.reduce((a, c) => a + c.mean, 0) / rgb.length;
}

/**
 * Prepare a camera capture / scan / screenshot for vision LLM:
 * - honour EXIF orientation
 * - upscale tiny crops (WhatsApp strips) so OCR has enough pixels
 * - downscale long edge while keeping OCR sharpness
 * - dark UI / low-light: invert + mild contrast (preserve sharpness)
 * - light photos: mild normalize + light sharpen
 * - JPEG compress under a vision byte budget
 * - HEIC/HEIF → JPEG
 */
export async function preprocessImageForNovaReader(
  buffer: Buffer,
  opts?: {
    longEdge?: number;
    maxBytes?: number;
    quality?: number;
    minShortEdge?: number;
  }
): Promise<PreprocessedImage> {
  const longEdge = opts?.longEdge ?? NOVA_READER_IMAGE_LONG_EDGE;
  const maxBytes = opts?.maxBytes ?? NOVA_READER_IMAGE_MAX_VISION_BYTES;
  const minShortEdge = opts?.minShortEdge ?? NOVA_READER_IMAGE_MIN_SHORT_EDGE;
  let quality = opts?.quality ?? NOVA_READER_IMAGE_JPEG_QUALITY;

  let pipeline = sharp(buffer, { failOn: "none", animated: false }).rotate();
  const meta = await pipeline.metadata();
  const w = meta.width || longEdge;
  const h = meta.height || longEdge;
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  let transformed =
    maxDim > longEdge ||
    minDim < minShortEdge ||
    (meta.orientation != null && meta.orientation !== 1) ||
    meta.format === "heif" ||
    meta.format === "gif";

  const mean = await imageMeanLuminance(buffer);
  const darkEnhanced = mean < 90;

  // Tiny screenshots / crops: enlarge so vision models can resolve glyphs.
  // Prefer exact short-edge target (wide WhatsApp strips may exceed longEdge).
  if (minDim < minShortEdge && minDim > 0) {
    if (w >= h) {
      pipeline = pipeline.resize({
        height: minShortEdge,
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      });
    } else {
      pipeline = pipeline.resize({
        width: minShortEdge,
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3,
      });
    }
    transformed = true;
  } else if (maxDim > longEdge) {
    pipeline = pipeline.resize({
      width: w >= h ? longEdge : undefined,
      height: h > w ? longEdge : undefined,
      fit: "inside",
      withoutEnlargement: true,
      kernel: sharp.kernel.lanczos3,
    });
    transformed = true;
  }

  if (darkEnhanced) {
    // Dark chat UIs / low-light: invert to light-on-paper, then gentle contrast.
    // Avoid crushing with aggressive normalize alone on near-black histograms.
    pipeline = pipeline
      .negate({ alpha: false })
      .normalize({ lower: 2, upper: 98 })
      .sharpen({ sigma: 0.55, m1: 0.45, m2: 0.25 });
    transformed = true;
  } else {
    // Mild contrast + light sharpen — helps phone photos of printed invoices.
    pipeline = pipeline.normalize().sharpen({ sigma: 0.7, m1: 0.5, m2: 0.3 });
  }

  // 4:4:4 keeps thin colored text (WhatsApp name headers) from chroma blur.
  let out = await pipeline
    .jpeg({
      quality,
      mozjpeg: true,
      chromaSubsampling: darkEnhanced || minDim < minShortEdge ? "4:4:4" : "4:2:0",
    })
    .toBuffer({ resolveWithObject: true });

  while (out.data.length > maxBytes && quality > 55) {
    quality -= 10;
    transformed = true;
    out = await sharp(out.data, { failOn: "none" })
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer({ resolveWithObject: true });
  }

  const info = out.info;
  return {
    buffer: out.data,
    mime: "image/jpeg",
    width: info.width || w,
    height: info.height || h,
    transformed: transformed || out.data.length !== buffer.length,
    darkEnhanced,
  };
}
