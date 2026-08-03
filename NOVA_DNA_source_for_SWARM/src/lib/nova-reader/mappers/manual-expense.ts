/**
 * Map NOVA Reader fields → Manual Expense form draft (editable; never ledger write).
 * Prefer EXPENSE; use VENDOR_PAYMENT only when a vendor is matched. Never auto-posts.
 */

import { normalizeInvoiceDate } from "@/lib/nova-reader/coerce";
import { matchVendorFromHints } from "@/lib/nova-reader/parse-fields";
import type {
  NovaReaderSuccess,
  NovaReaderVendorHint,
} from "@/lib/nova-reader/types";

export type ManualExpenseEntryType = "EXPENSE" | "VENDOR_PAYMENT" | "STAFF_ADVANCE";

export type ManualExpenseReaderDraft = {
  entryType: ManualExpenseEntryType;
  amount: number | null;
  gstAmount: number | null;
  transactionDate: string | null;
  partyLabel: string | null;
  purpose: string | null;
  notes: string | null;
  matchedVendorId: string | null;
  matchedVendorLabel: string | null;
  vendorName: string | null;
  vendorGstin: string | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  totalAmount: number | null;
};

export function mapNovaReaderToManualExpenseDraft(
  reader: Pick<NovaReaderSuccess, "fields" | "confidence" | "warnings">,
  vendors: NovaReaderVendorHint[] = []
): ManualExpenseReaderDraft {
  const f = reader.fields;
  const match = matchVendorFromHints(
    { vendorGstin: f.vendorGstin, vendorName: f.vendorName },
    vendors
  );
  const warnings = [...new Set(reader.warnings)].slice(0, 12);

  const amount =
    f.totalAmount != null && Number.isFinite(f.totalAmount) && f.totalAmount > 0
      ? f.totalAmount
      : f.subtotal != null && Number.isFinite(f.subtotal) && f.subtotal > 0
        ? f.subtotal
        : null;

  let gstAmount: number | null = null;
  if (f.gstAmount != null && Number.isFinite(f.gstAmount) && f.gstAmount >= 0) {
    gstAmount = f.gstAmount;
  } else {
    const parts = [f.cgst, f.sgst, f.igst].filter(
      (n): n is number => n != null && Number.isFinite(n) && n >= 0
    );
    if (parts.length) gstAmount = parts.reduce((a, b) => a + b, 0);
  }

  const entryType: ManualExpenseEntryType = match.matchedVendorId
    ? "VENDOR_PAYMENT"
    : "EXPENSE";

  if (entryType === "EXPENSE" && !match.matchedVendorId && (f.vendorName || f.vendorGstin)) {
    warnings.push("Vendor not matched — enter as expense with party label, or pick a vendor.");
  }

  const purposeBits = [
    f.documentKind ? f.documentKind.replace(/_/g, " ") : null,
    f.vendorName,
    f.documentNumber ? `Doc ${f.documentNumber}` : null,
  ].filter(Boolean);

  const noteBits = [
    f.documentNumber ? `Document #${f.documentNumber}` : null,
    f.documentDate ? `Date ${f.documentDate}` : null,
  ].filter(Boolean);

  return {
    entryType,
    amount,
    gstAmount: entryType === "EXPENSE" ? gstAmount : null,
    transactionDate: normalizeInvoiceDate(f.documentDate),
    partyLabel: entryType === "EXPENSE" ? f.vendorName : null,
    purpose: purposeBits.length ? purposeBits.join(" — ").slice(0, 200) : null,
    notes: noteBits.length ? noteBits.join(" · ").slice(0, 500) : null,
    matchedVendorId: match.matchedVendorId,
    matchedVendorLabel: match.matchedVendorLabel,
    vendorName: f.vendorName,
    vendorGstin: f.vendorGstin,
    confidence: reader.confidence,
    warnings,
    totalAmount: f.totalAmount,
  };
}
