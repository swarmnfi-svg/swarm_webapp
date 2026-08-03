/**
 * MIME / extension allowlists for NOVA Reader ingest.
 * Kept free of Node-only deps so client components can import safely.
 */

/** Photos + HEIC/HEIF (converted to JPEG in preprocess). */
export const NOVA_READER_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
] as const;

export const NOVA_READER_EXTENSIONS = [
  ...NOVA_READER_IMAGE_EXTENSIONS,
  ".pdf",
] as const;

export const NOVA_READER_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,application/pdf,image/*";

export function isNovaReaderExtension(ext: string): boolean {
  return (NOVA_READER_EXTENSIONS as readonly string[]).includes(
    ext.toLowerCase()
  );
}

export function fileExtensionOf(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const i = base.lastIndexOf(".");
  return i >= 0 ? base.slice(i).toLowerCase() : "";
}

export function validateNovaReaderFormat(
  fileName: string
): { ok: true; ext: string } | { ok: false; reason: "format" } {
  const ext = fileExtensionOf(fileName);
  if (!isNovaReaderExtension(ext)) return { ok: false, reason: "format" };
  return { ok: true, ext };
}
