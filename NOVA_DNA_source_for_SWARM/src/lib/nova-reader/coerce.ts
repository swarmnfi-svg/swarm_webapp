/** Coercion helpers for soft-parsing LLM / OCR JSON. */

export function asNullableString(raw: unknown, max: number): string | null {
  if (raw == null) return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "null") return null;
  return s.slice(0, max);
}

export function coerceLooseNumber(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "boolean") return null;
  if (typeof raw !== "string") return null;
  // Strip currency labels without eating decimal points (avoid /[₹Rs.]/ class).
  let cleaned = raw
    .replace(/₹/g, "")
    .replace(/\bRs\.?/gi, "")
    .replace(/\s+/g, "")
    .replace(/%$/, "")
    .trim();
  if (!cleaned) return null;
  cleaned = cleaned.replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function coerceConfidence(raw: unknown): "high" | "medium" | "low" {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "high" || s === "medium" || s === "low") return s;
  return "medium";
}

/** Prefer YYYY-MM-DD; accept DD/MM/YYYY, DD-MM-YYYY, and common English month forms. */
export function normalizeInvoiceDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : s;
  }
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) {
    const dd = m[1].padStart(2, "0");
    const mm = m[2].padStart(2, "0");
    const yyyy = m[3];
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : iso;
  }
  const months: Record<string, string> = {
    jan: "01",
    january: "01",
    feb: "02",
    february: "02",
    mar: "03",
    march: "03",
    apr: "04",
    april: "04",
    may: "05",
    jun: "06",
    june: "06",
    jul: "07",
    july: "07",
    aug: "08",
    august: "08",
    sep: "09",
    sept: "09",
    september: "09",
    oct: "10",
    october: "10",
    nov: "11",
    november: "11",
    dec: "12",
    december: "12",
  };
  const eng =
    /^(\d{1,2})(?:st|nd|rd|th)?[\s,]+([A-Za-z]{3,9})[\s,]+(\d{4})$/.exec(s) ||
    /^([A-Za-z]{3,9})[\s,]+(\d{1,2})(?:st|nd|rd|th)?[\s,]+(\d{4})$/.exec(s);
  if (eng) {
    let dd: string;
    let monKey: string;
    let yyyy: string;
    if (/^\d/.test(eng[1])) {
      dd = eng[1].padStart(2, "0");
      monKey = eng[2].toLowerCase();
      yyyy = eng[3];
    } else {
      monKey = eng[1].toLowerCase();
      dd = eng[2].padStart(2, "0");
      yyyy = eng[3];
    }
    const mm = months[monKey];
    if (!mm) return null;
    const iso = `${yyyy}-${mm}-${dd}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : iso;
  }
  return null;
}

/** Normalize Indian GSTIN for matching (uppercase, strip spaces). */
export function normalizeGstin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.replace(/\s+/g, "").toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(v)) return null;
  return v;
}

export function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  if (fenced) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
