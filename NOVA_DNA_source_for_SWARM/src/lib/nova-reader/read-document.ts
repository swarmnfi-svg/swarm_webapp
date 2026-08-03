/**
 * NOVA Reader entry: upload → PDF text / raster / vision OCR → LLM fields.
 *
 * Performance strategy:
 * 1. Prefer PDF text layer → single text-only LLM call (typical digital PDF ~15–30s).
 * 2. Only rasterize / vision when text is thin (scans) — first page, low DPI.
 * 3. Never send a multi-page PDF blob to Gemini by default (huge base64 = multi-minute).
 * 4. Photos: EXIF + dark-enhance / upscale + sharpen + JPEG → vision (Gemini-first).
 * 5. Cap pages, retries, and wall-clock budget.
 */

import { isNovaLlmConfigured } from "@/lib/ai/llm";
import {
  classifyNovaLlmError,
  novaLlmErrorUserMessage,
} from "@/lib/ai/nova-llm-errors";
import { isNovaReaderEnvEnabled } from "@/lib/nova-reader/gates";
import { validateNovaReaderFormat } from "@/lib/nova-reader/formats";
import {
  isNovaReaderImageExtension,
  novaReaderMimeForExt,
  preprocessImageForNovaReader,
} from "@/lib/nova-reader/preprocess-image";
import {
  NOVA_READER_MAX_BYTES,
  NOVA_READER_MAX_PREVIEW_PAGES,
  NOVA_READER_OVERALL_TIMEOUT_MS,
  NOVA_READER_RICH_TEXT_CHARS,
  NOVA_READER_VISION_DPI,
  novaReaderTooLargeMessage,
} from "@/lib/nova-reader/limits";
import {
  geminiNativeDocumentExtract,
  openAiCompatVisionExtract,
  textOnlyExtract,
  visionFailureUserMessage,
  type LlmExtractOut,
  type VisionExtractFailureReason,
} from "@/lib/nova-reader/llm-extract";
import {
  extractPdfPlainText,
  rasterizePdfPagesPng,
} from "@/lib/nova-reader/pdf";
import {
  fieldsHaveUsablePrefill,
  matchVendorFromHints,
  parseNovaReaderLlmJson,
  readerPayloadIsUsable,
} from "@/lib/nova-reader/parse-fields";
import { bufferToThumbnailDataUrl } from "@/lib/nova-reader/thumbnails";
import type {
  NovaReaderPage,
  NovaReaderResult,
  ReadDocumentOptions,
} from "@/lib/nova-reader/types";

// Re-export mime helper used below (formats + preprocess share the same map).
function mimeForExt(ext: string): string {
  return novaReaderMimeForExt(ext);
}

/** Digital invoice / PO text is usually long enough and has digits / GSTIN-like tokens. */
export function pdfTextLooksRich(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < NOVA_READER_RICH_TEXT_CHARS) return false;
  const digitRuns = (t.match(/\d{2,}/g) || []).length;
  const hasMoneyOrGst =
    /\b(GSTIN|IGST|CGST|SGST|invoice|taxable|total|₹|Rs\.?)\b/i.test(t) ||
    /\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]/i.test(t);
  return digitRuns >= 3 || hasMoneyOrGst;
}

function dedupeWarnings(warnings: string[]): string[] {
  return [...new Set(warnings.map((w) => w.trim()).filter(Boolean))].slice(0, 12);
}

function buildSuccess(opts: {
  rawText: string;
  pages: NovaReaderPage[];
  parsed: NonNullable<ReturnType<typeof parseNovaReaderLlmJson>>;
  vendors: ReadDocumentOptions["vendors"];
  model: string;
  provider: string;
  textSource: "pdf_text" | "vision_llm" | "pdf_text+vision" | "image";
  fileName: string;
}): NovaReaderResult {
  const warnings = [...opts.parsed.warnings];
  const vendorHints = opts.vendors || [];
  // Only when a vendor list was provided (PB/PR/PO). Sales intents pass [] —
  // do not warn about unmatched vendors when matching customers instead.
  if (vendorHints.length > 0) {
    const match = matchVendorFromHints(opts.parsed.fields, vendorHints);
    if (
      !match.matchedVendorId &&
      (opts.parsed.fields.vendorGstin || opts.parsed.fields.vendorName)
    ) {
      warnings.push("Vendor not matched automatically — select vendor manually.");
    }
  }

  const rawText =
    opts.rawText.trim() ||
    opts.parsed.rawText.trim() ||
    opts.pages.map((p) => p.text).filter(Boolean).join("\n\n");

  return {
    ok: true,
    rawText: rawText.slice(0, 50_000),
    pages: opts.pages,
    fields: opts.parsed.fields,
    confidence: opts.parsed.confidence,
    warnings: dedupeWarnings(warnings),
    preview: {
      rawText: rawText.slice(0, 50_000),
      pages: opts.pages,
      title: opts.fileName.slice(0, 120) || "Document",
    },
    model: opts.model,
    provider: opts.provider,
    textSource: opts.textSource,
  };
}

async function buildPages(opts: {
  pdfText: string;
  pagePngs: Buffer[];
  imageBuffer?: Buffer;
  imageMime?: string;
  includeThumbnails: boolean;
}): Promise<NovaReaderPage[]> {
  const pages: NovaReaderPage[] = [];
  if (opts.pagePngs.length) {
    const limit = Math.min(opts.pagePngs.length, NOVA_READER_MAX_PREVIEW_PAGES);
    for (let i = 0; i < limit; i++) {
      const png = opts.pagePngs[i]!;
      const thumb =
        opts.includeThumbnails
          ? await bufferToThumbnailDataUrl(png, "image/png")
          : null;
      pages.push({
        pageIndex: i,
        text: i === 0 ? opts.pdfText : "",
        thumbnailDataUrl: thumb,
      });
    }
  } else if (opts.imageBuffer) {
    const thumb = opts.includeThumbnails
      ? await bufferToThumbnailDataUrl(opts.imageBuffer, opts.imageMime)
      : null;
    pages.push({ pageIndex: 0, text: opts.pdfText, thumbnailDataUrl: thumb });
  } else {
    pages.push({ pageIndex: 0, text: opts.pdfText, thumbnailDataUrl: null });
  }
  return pages;
}

/**
 * Read a vendor invoice / PO / receipt PDF or image into structured fields + preview.
 * Does not persist anything.
 */
export async function readDocument(
  opts: ReadDocumentOptions
): Promise<NovaReaderResult> {
  if (!isNovaReaderEnvEnabled()) {
    return {
      ok: false,
      code: "disabled",
      message:
        "NOVA Reader is turned off (NOVA_READER_ENABLED=false or INVOICE_OCR_ENABLED=false).",
    };
  }
  if (!isNovaLlmConfigured()) {
    return {
      ok: false,
      code: "llm_off",
      message: "NOVA Reader is unavailable — LLM keys are not configured.",
    };
  }

  if (opts.buffer.length > NOVA_READER_MAX_BYTES) {
    return {
      ok: false,
      code: "invalid_file",
      message: novaReaderTooLargeMessage(opts.buffer.length),
    };
  }

  // Format-only check (do not apply the 10 MB general upload cap — Reader allows 25 MB).
  const validated = validateNovaReaderFormat(opts.fileName);
  if (!validated.ok) {
    return {
      ok: false,
      code: "invalid_file",
      message: "Upload a PDF or image (JPG/PNG/WebP/HEIC).",
    };
  }

  const mime = mimeForExt(validated.ext);
  const isPdf = mime === "application/pdf";
  const includeThumbnails = opts.includeThumbnails !== false;
  const vendors = opts.vendors || [];
  const started = Date.now();
  const budgetLeft = () =>
    Math.max(0, NOVA_READER_OVERALL_TIMEOUT_MS - (Date.now() - started));

  let userText =
    "Read this document with NOVA Reader. Transcribe visible text into rawText and fill fields. File name: " +
    opts.fileName.slice(0, 120);

  let pdfText = "";
  let pagePngs: Buffer[] = [];

  // Kick raster in parallel with text extract, but only first page @ low DPI.
  // We may ignore the raster if the text-layer fast path succeeds.
  let rasterPromise: Promise<Buffer[]> | null = null;
  if (isPdf) {
    rasterPromise = rasterizePdfPagesPng(opts.buffer, {
      dpi: NOVA_READER_VISION_DPI,
      maxPages: NOVA_READER_MAX_PREVIEW_PAGES,
    });
    pdfText = await extractPdfPlainText(opts.buffer);
    if (pdfText.length >= 40) {
      userText +=
        "\n\nExtracted PDF text layer (may be incomplete):\n" +
        pdfText.slice(0, 12_000);
    }
  }

  // Photos always need vision — preprocess once for accuracy + smaller payload.
  let visionImage: { buffer: Buffer; mime: string } | null = null;
  if (!isPdf && isNovaReaderImageExtension(validated.ext)) {
    userText +=
      "\n\nThis is a photo/screenshot (not a PDF text layer). Read digital UI text, chat bubbles, and handwriting carefully. Prefer rawText transcription even if the image is informal (WhatsApp notes, payment memos).";
    try {
      const pre = await preprocessImageForNovaReader(opts.buffer);
      visionImage = { buffer: pre.buffer, mime: pre.mime };
      if (pre.darkEnhanced) {
        userText +=
          "\n\n(Dark UI / low-light image was auto-inverted for OCR — read the light-background version of the same text.)";
      } else if (pre.transformed) {
        userText +=
          "\n\n(Image was auto-oriented / resized for OCR — prefer printed amounts you can see.)";
      }
    } catch {
      visionImage = {
        buffer: opts.buffer,
        mime: mime === "image/heic" ? "image/jpeg" : mime,
      };
    }
  }

  type TextSource = "pdf_text" | "vision_llm" | "pdf_text+vision" | "image";

  const tryAccept = async (
    out: LlmExtractOut,
    source: TextSource,
    pagesOverride?: NovaReaderPage[]
  ): Promise<NovaReaderResult | null> => {
    const parsed = parseNovaReaderLlmJson(out.content);
    if (!parsed) return null;
    if (!readerPayloadIsUsable(parsed)) return null;

    let pages = pagesOverride;
    if (!pages) {
      if (rasterPromise) {
        const remaining = budgetLeft();
        pagePngs =
          remaining > 2_000
            ? await Promise.race([
                rasterPromise,
                new Promise<Buffer[]>((resolve) =>
                  setTimeout(() => resolve([]), Math.min(4_000, remaining))
                ),
              ])
            : [];
      }
      pages = await buildPages({
        pdfText,
        pagePngs,
        imageBuffer: isPdf ? undefined : visionImage?.buffer ?? opts.buffer,
        imageMime: visionImage?.mime ?? mime,
        includeThumbnails,
      });
    }

    const withNotes =
      !fieldsHaveUsablePrefill(parsed.fields) && parsed.rawText.trim()
        ? {
            ...parsed,
            warnings: dedupeWarnings([
              ...parsed.warnings,
              "Little structure extracted — use the read text preview and fill fields manually.",
            ]),
          }
        : parsed;

    return buildSuccess({
      rawText: pdfText || withNotes.rawText,
      pages: pages.map((p, idx) =>
        idx === 0 && withNotes.rawText && !p.text
          ? { ...p, text: withNotes.rawText.slice(0, 20_000) }
          : p
      ),
      parsed: withNotes,
      vendors,
      model: out.model,
      provider: out.provider,
      textSource: source,
      fileName: opts.fileName,
    });
  };

  const extractState: {
    last: LlmExtractOut | null;
    parseFail: boolean;
    visionFail: VisionExtractFailureReason | null;
    textFail: VisionExtractFailureReason | null;
  } = {
    last: null,
    parseFail: false,
    visionFail: null,
    textFail: null,
  };
  let textSource: TextSource = isPdf
    ? pdfTextLooksRich(pdfText)
      ? "pdf_text"
      : "vision_llm"
    : "image";

  const wrapTry = async (
    out: LlmExtractOut | null,
    source: TextSource,
    pagesOverride?: NovaReaderPage[]
  ): Promise<NovaReaderResult | null> => {
    if (!out) return null;
    extractState.last = out;
    const parsed = parseNovaReaderLlmJson(out.content);
    if (!parsed) {
      extractState.parseFail = true;
      return null;
    }
    if (!readerPayloadIsUsable(parsed)) return null;
    return tryAccept(out, source, pagesOverride);
  };

  // ——— Fast path: rich PDF text → single text-only LLM call ———
  if (isPdf && pdfTextLooksRich(pdfText) && budgetLeft() > 3_000) {
    textSource = "pdf_text";
    try {
      const textOut = await textOnlyExtract({
        userText:
          userText +
          "\n\n(Use the extracted PDF text above; the binary file is not attached.)",
      });
      const ok = await wrapTry(textOut, "pdf_text");
      if (ok) return ok;
    } catch (err) {
      const kind = classifyNovaLlmError(err);
      if (kind === "rate_limited") extractState.textFail = "quota";
      else if (kind === "unavailable" || kind === "deadline") {
        extractState.textFail = "unavailable";
      }
      /* fall through to vision */
    }
  }

  // Ensure we have page rasters for vision / thumbs when text path failed or was thin.
  if (isPdf && rasterPromise && budgetLeft() > 2_000) {
    pagePngs = await rasterPromise.catch(() => []);
  }

  // ——— Vision path: first-page PNG or preprocessed photo (never full multi-page PDF) ———
  if (budgetLeft() > 3_000) {
    if (isPdf && pagePngs[0]) {
      textSource = pdfText.length >= 40 ? "pdf_text+vision" : "vision_llm";
      const pages = await buildPages({
        pdfText,
        pagePngs,
        includeThumbnails,
      });
      const native = await geminiNativeDocumentExtract({
        buffer: pagePngs[0],
        mime: "image/png",
        userText,
      });
      let visionOut: LlmExtractOut | null = native.ok ? native.result : null;
      if (!native.ok) extractState.visionFail = native.reason;
      if (!visionOut) {
        const compat = await openAiCompatVisionExtract({
          buffer: pagePngs[0],
          mime: "image/png",
          userText,
        });
        if (compat.ok) visionOut = compat.result;
        else extractState.visionFail = compat.reason;
      }
      const ok = await wrapTry(visionOut, textSource, pages);
      if (ok) return ok;
    } else if (!isPdf && visionImage) {
      textSource = "image";
      const pages = await buildPages({
        pdfText: "",
        pagePngs: [],
        imageBuffer: visionImage.buffer,
        imageMime: visionImage.mime,
        includeThumbnails,
      });
      // Gemini native first (true multimodal), then OpenAI-compat vision hosts only.
      const native = await geminiNativeDocumentExtract({
        buffer: visionImage.buffer,
        mime: visionImage.mime,
        userText,
      });
      let visionOut: LlmExtractOut | null = native.ok ? native.result : null;
      if (!native.ok) extractState.visionFail = native.reason;
      if (!visionOut) {
        const compat = await openAiCompatVisionExtract({
          buffer: visionImage.buffer,
          mime: visionImage.mime,
          userText,
        });
        if (compat.ok) visionOut = compat.result;
        else extractState.visionFail = compat.reason;
      }
      const ok = await wrapTry(visionOut, "image", pages);
      if (ok) return ok;
    }
  }

  // ——— Last resort: text-only if we skipped it earlier (thin text still better than nothing) ———
  if (pdfText.length >= 40 && budgetLeft() > 3_000) {
    textSource = "pdf_text";
    try {
      const textOut = await textOnlyExtract({
        userText:
          userText +
          "\n\n(Use the extracted PDF text above; the binary file is not attached.)",
      });
      const ok = await wrapTry(textOut, "pdf_text");
      if (ok) return ok;
    } catch (err) {
      const kind = classifyNovaLlmError(err);
      if (kind === "rate_limited") extractState.textFail = "quota";
      else if (kind === "unavailable" || kind === "deadline") {
        extractState.textFail = "unavailable";
      }
    }
  }

  const lastLlmOut = extractState.last;
  if (!lastLlmOut) {
    if (extractState.visionFail) {
      return {
        ok: false,
        code: "extract_failed",
        message: visionFailureUserMessage(extractState.visionFail),
      };
    }
    if (extractState.textFail) {
      return {
        ok: false,
        code: "extract_failed",
        message: novaLlmErrorUserMessage(
          new Error(
            extractState.textFail === "quota" ? "NOVA_LLM_HTTP_429" : "NOVA_LLM_HTTP_503"
          ),
          { surface: "reader" }
        ),
      };
    }
    return {
      ok: false,
      code: "extract_failed",
      message: isPdf
        ? "Could not read this PDF. Try a clear JPG/PNG of the page, or ensure Gemini is configured."
        : "Could not extract text from this image. Try a clearer, well-lit photo — or check that Gemini vision is configured.",
    };
  }

  const parsed = parseNovaReaderLlmJson(lastLlmOut.content);
  if (!parsed) {
    return {
      ok: false,
      code: "parse_failed",
      message: extractState.parseFail
        ? "AI response was not valid document JSON (parse failed). Try again, or enter fields manually."
        : "NOVA Reader returned unusable data. Enter fields manually.",
    };
  }

  const pages = await buildPages({
    pdfText,
    pagePngs,
    imageBuffer: isPdf ? undefined : visionImage?.buffer ?? opts.buffer,
    imageMime: visionImage?.mime ?? mime,
    includeThumbnails,
  });

  if (!readerPayloadIsUsable(parsed)) {
    return {
      ok: false,
      code: "empty",
      message:
        "Nothing readable to prefill on this document (no text, number, date, vendor, amounts, or lines). Enter fields manually.",
    };
  }

  if (!fieldsHaveUsablePrefill(parsed.fields)) {
    return buildSuccess({
      rawText: pdfText || parsed.rawText,
      pages,
      parsed: {
        ...parsed,
        warnings: dedupeWarnings([
          ...parsed.warnings,
          "Little structure extracted — use the read text preview and fill fields manually.",
        ]),
      },
      vendors,
      model: lastLlmOut.model,
      provider: lastLlmOut.provider,
      textSource,
      fileName: opts.fileName,
    });
  }

  return buildSuccess({
    rawText: pdfText || parsed.rawText,
    pages,
    parsed,
    vendors,
    model: lastLlmOut.model,
    provider: lastLlmOut.provider,
    textSource,
    fileName: opts.fileName,
  });
}
