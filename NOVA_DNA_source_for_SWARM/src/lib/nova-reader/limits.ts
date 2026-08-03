/** Shared limits for NOVA Reader document ingest. */

export const NOVA_READER_MAX_MB = 25;
export const NOVA_READER_MAX_BYTES = NOVA_READER_MAX_MB * 1024 * 1024;
/**
 * Max pages rasterized for preview / vision (first N).
 * Bills/POs almost always have the useful header on page 1; keep ≤2 for speed.
 */
export const NOVA_READER_MAX_PREVIEW_PAGES = 2;
/** Low DPI for vision + thumbs — readable enough, much faster than 140–300. */
export const NOVA_READER_VISION_DPI = 96;
/** Thumbnail long-edge px for UI preview data URLs. */
export const NOVA_READER_THUMB_MAX_EDGE = 480;
/**
 * PDF text-layer chars that count as “rich enough” to skip heavy vision
 * (digital invoices / POs). Below this → raster + vision path.
 */
export const NOVA_READER_RICH_TEXT_CHARS = 180;
/** Hard wall-clock budget for a single readDocument call (ms). */
export const NOVA_READER_OVERALL_TIMEOUT_MS = 55_000;
/** Per LLM attempt timeout — text-only path. */
export const NOVA_READER_TEXT_LLM_TIMEOUT_MS = 22_000;
/** Per LLM attempt timeout — vision / multimodal path. */
export const NOVA_READER_VISION_LLM_TIMEOUT_MS = 28_000;
/**
 * Long-edge px for camera photos before vision (OCR sharpness vs base64 size).
 * ~1600–2000 keeps receipt text readable without multi-MB payloads.
 */
export const NOVA_READER_IMAGE_LONG_EDGE = 1800;
/**
 * Upscale crops shorter than this (WhatsApp bubble strips etc.) so vision
 * models have enough pixels for digital / handwritten glyphs.
 */
export const NOVA_READER_IMAGE_MIN_SHORT_EDGE = 360;
/** JPEG quality for vision-bound photos after preprocess. */
export const NOVA_READER_IMAGE_JPEG_QUALITY = 82;
/** Soft cap on vision image bytes after preprocess (before base64). */
export const NOVA_READER_IMAGE_MAX_VISION_BYTES = 1_400_000;

export function novaReaderTooLargeMessage(fileBytes: number): string {
  const actualMb = (fileBytes / (1024 * 1024)).toFixed(1);
  return `File is too large for NOVA Reader (${actualMb} MB). Maximum is ${NOVA_READER_MAX_MB} MB — compress the scan, export a smaller PDF, or use a photo under ${NOVA_READER_MAX_MB} MB.`;
}

/** @deprecated Prefer novaReaderTooLargeMessage — kept for purchase-bill UI copy. */
export const EXTRACT_MAX_MB = NOVA_READER_MAX_MB;
export const EXTRACT_MAX_BYTES = NOVA_READER_MAX_BYTES;
export const invoiceExtractTooLargeMessage = novaReaderTooLargeMessage;
