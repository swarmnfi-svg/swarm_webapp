/**
 * Map NOVA Reader fields → purchase-bill form draft (editable; never ledger write).
 */

import {
  matchVendorFromHints,
} from "@/lib/nova-reader/parse-fields";
import type {
  NovaReaderFields,
  NovaReaderSuccess,
  NovaReaderVendorHint,
} from "@/lib/nova-reader/types";

export type PurchaseBillReaderDraft = {
  vendorName: string | null;
  vendorGstin: string | null;
  vendorInvoiceNumber: string | null;
  vendorInvoiceDate: string | null;
  dueDate: string | null;
  tdsApplicable: boolean | null;
  tdsAmount: number | null;
  rcmApplicable: boolean | null;
  lineItems: Array<{
    description: string;
    hsnSac: string;
    quantity: number;
    rate: number;
    gstRate: number;
  }>;
  /** Optional totals for UI hints (not always form fields). */
  gstAmount: number | null;
  totalAmount: number | null;
  documentKind: NovaReaderFields["documentKind"];
  confidence: "high" | "medium" | "low";
  warnings: string[];
  matchedVendorId: string | null;
  matchedVendorLabel: string | null;
};

export function mapNovaReaderToPurchaseBillDraft(
  reader: Pick<NovaReaderSuccess, "fields" | "confidence" | "warnings">,
  vendors: NovaReaderVendorHint[] = []
): PurchaseBillReaderDraft {
  const f = reader.fields;
  const match = matchVendorFromHints(
    { vendorGstin: f.vendorGstin, vendorName: f.vendorName },
    vendors
  );
  const warnings = [...new Set(reader.warnings)].slice(0, 12);

  return {
    vendorName: f.vendorName,
    vendorGstin: f.vendorGstin,
    vendorInvoiceNumber: f.documentNumber,
    vendorInvoiceDate: f.documentDate,
    dueDate: f.dueDate,
    tdsApplicable: f.tdsApplicable,
    tdsAmount: f.tdsAmount,
    rcmApplicable: f.rcmApplicable,
    lineItems: f.lineItems.map((l) => ({
      description: l.description,
      hsnSac: l.hsnSac || "",
      quantity: l.quantity,
      rate: l.rate,
      gstRate: l.gstRate,
    })),
    gstAmount: f.gstAmount,
    totalAmount: f.totalAmount,
    documentKind: f.documentKind,
    confidence: reader.confidence,
    warnings,
    matchedVendorId: match.matchedVendorId,
    matchedVendorLabel: match.matchedVendorLabel,
  };
}
