/**
 * PDF helpers for NOVA Reader — server-only.
 * Uses poppler (`pdftotext` / `pdftoppm`) from the host/Docker image.
 * No native Node canvas / pdf.js bundling (avoids Webpack .node parse failures).
 */

import { execFile } from "child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { NOVA_READER_MAX_PREVIEW_PAGES, NOVA_READER_VISION_DPI } from "@/lib/nova-reader/limits";

const execFileAsync = promisify(execFile);
const POPPLER_TIMEOUT_MS = 12_000;

async function withTempPdf<T>(
  buffer: Buffer,
  fn: (dir: string, pdfPath: string) => Promise<T>
): Promise<T | null> {
  const dir = await mkdtemp(join(tmpdir(), "nova-reader-"));
  const pdfPath = join(dir, "in.pdf");
  try {
    await writeFile(pdfPath, buffer);
    return await fn(dir, pdfPath);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Extract plain text via poppler (empty when poppler missing or image-only PDF). */
export async function extractPdfPlainText(buffer: Buffer): Promise<string> {
  const text = await withTempPdf(buffer, async (_dir, pdfPath) => {
    const { stdout } = await execFileAsync(
      "pdftotext",
      ["-layout", "-enc", "UTF-8", pdfPath, "-"],
      { timeout: POPPLER_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" }
    );
    return String(stdout || "");
  });
  return (text || "").replace(/\u0000/g, "").trim();
}

/** Rasterize first N PDF pages via poppler `pdftoppm`. */
export async function rasterizePdfPagesPng(
  buffer: Buffer,
  opts?: { dpi?: number; maxPages?: number }
): Promise<Buffer[]> {
  const dpi = opts?.dpi ?? NOVA_READER_VISION_DPI;
  const maxPages = opts?.maxPages ?? NOVA_READER_MAX_PREVIEW_PAGES;
  const pages = await withTempPdf(buffer, async (dir, pdfPath) => {
    const prefix = join(dir, "page");
    await execFileAsync(
      "pdftoppm",
      [
        "-png",
        "-f",
        "1",
        "-l",
        String(maxPages),
        "-r",
        String(dpi),
        pdfPath,
        prefix,
      ],
      { timeout: POPPLER_TIMEOUT_MS }
    );
    const names = (await readdir(dir))
      .filter((n) => /^page(-?\d+)?\.png$/i.test(n) || /^page-\d+\.png$/i.test(n))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const out: Buffer[] = [];
    for (const name of names) {
      try {
        const png = await readFile(join(dir, name));
        if (png.length > 0) out.push(png);
      } catch {
        /* skip */
      }
    }
    return out;
  });
  return pages || [];
}

export async function rasterizePdfFirstPagePng(
  buffer: Buffer,
  opts?: { dpi?: number }
): Promise<Buffer | null> {
  const pages = await rasterizePdfPagesPng(buffer, {
    dpi: opts?.dpi,
    maxPages: 1,
  });
  return pages[0] ?? null;
}
