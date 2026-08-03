/**
 * Map NOVA Reader fields → customer receipt form draft (editable; never ledger write).
 */

import type { NovaReaderSuccess } from "@/lib/nova-reader/types";

export type ReceiptReaderDraft = {
  amount: number | null;
  receiptDate: string | null;
  /** UTR / txn ref when present in read text or document number. */
  utr: string | null;
  documentNumber: string | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  totalAmount: number | null;
};

/** Prefer totalAmount; fall back to subtotal + GST. */
function pickAmount(f: NovaReaderSuccess["fields"]): number | null {
  if (f.totalAmount != null && Number.isFinite(f.totalAmount) && f.totalAmount > 0) {
    return f.totalAmount;
  }
  if (f.subtotal != null && f.gstAmount != null) {
    const sum = f.subtotal + f.gstAmount;
    if (Number.isFinite(sum) && sum > 0) return sum;
  }
  if (f.subtotal != null && Number.isFinite(f.subtotal) && f.subtotal > 0) {
    return f.subtotal;
  }
  return null;
}

export function mapNovaReaderToReceiptDraft(
  reader: Pick<NovaReaderSuccess, "fields" | "confidence" | "warnings" | "rawText">
): ReceiptReaderDraft {
  const f = reader.fields;
  const warnings = [...new Set(reader.warnings)].slice(0, 12);
  const amount = pickAmount(f);

  // Bank screenshots often put UTR in documentNumber or raw text.
  let utr = f.documentNumber;
  if (!utr) {
    const m = reader.rawText.match(
      /\b(?:UTR|Ref(?:erence)?|Txn(?:\s*ID)?|IMPS|NEFT)[:\s#-]*([A-Z0-9]{8,22})\b/i
    );
    if (m?.[1]) utr = m[1];
  }

  return {
    amount,
    receiptDate: f.documentDate,
    utr,
    documentNumber: f.documentNumber,
    confidence: reader.confidence,
    warnings,
    totalAmount: f.totalAmount,
  };
}
