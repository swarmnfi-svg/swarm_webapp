/**
 * Map NOVA Reader fields → payment-request form draft (editable; never ledger write).
 */

import {
  matchVendorFromHints,
} from "@/lib/nova-reader/parse-fields";
import type {
  NovaReaderSuccess,
  NovaReaderVendorHint,
} from "@/lib/nova-reader/types";

export type PaymentRequestReaderDraft = {
  amount: number | null;
  purpose: string | null;
  vendorName: string | null;
  vendorGstin: string | null;
  matchedVendorId: string | null;
  matchedVendorLabel: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  totalAmount: number | null;
};

export function mapNovaReaderToPaymentRequestDraft(
  reader: Pick<NovaReaderSuccess, "fields" | "confidence" | "warnings">,
  vendors: NovaReaderVendorHint[] = []
): PaymentRequestReaderDraft {
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

  const purposeBits = [
    f.documentKind ? f.documentKind.replace(/_/g, " ") : null,
    f.vendorName,
    f.documentNumber ? `Inv ${f.documentNumber}` : null,
  ].filter(Boolean);

  return {
    amount,
    purpose: purposeBits.length ? purposeBits.join(" — ").slice(0, 200) : null,
    vendorName: f.vendorName,
    vendorGstin: f.vendorGstin,
    matchedVendorId: match.matchedVendorId,
    matchedVendorLabel: match.matchedVendorLabel,
    documentNumber: f.documentNumber,
    documentDate: f.documentDate,
    confidence: reader.confidence,
    warnings,
    totalAmount: f.totalAmount,
  };
}
