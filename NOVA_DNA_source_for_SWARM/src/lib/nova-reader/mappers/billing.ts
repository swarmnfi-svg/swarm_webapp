/**
 * Map NOVA Reader fields → billing (sales invoice) form draft (editable; never ledger write).
 */

import { matchCustomerFromHints } from "@/lib/nova-reader/parse-fields";
import type {
  NovaReaderCustomerHint,
  NovaReaderFields,
  NovaReaderSuccess,
} from "@/lib/nova-reader/types";

export type BillingReaderDraft = {
  customerName: string | null;
  customerGstin: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  placeOfSupply: string | null;
  lineItems: Array<{
    description: string;
    hsnSac: string;
    quantity: number;
    unit: string;
    rate: number;
    discount: number;
    gstRate: number;
  }>;
  gstAmount: number | null;
  totalAmount: number | null;
  documentKind: NovaReaderFields["documentKind"];
  confidence: "high" | "medium" | "low";
  warnings: string[];
  matchedCustomerId: string | null;
  matchedCustomerLabel: string | null;
};

function placeOfSupplyFromGstin(gstin: string | null): string | null {
  if (!gstin || gstin.length < 2) return null;
  const code = gstin.slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

export function mapNovaReaderToBillingDraft(
  reader: Pick<NovaReaderSuccess, "fields" | "confidence" | "warnings">,
  customers: NovaReaderCustomerHint[] = []
): BillingReaderDraft {
  const f = reader.fields;
  const customerName = f.buyerName || f.vendorName;
  const customerGstin = f.buyerGstin || f.vendorGstin;
  const match = matchCustomerFromHints(
    { buyerGstin: customerGstin, buyerName: customerName },
    customers
  );
  // Drop purchase-side vendor warnings if present (sales path passes no vendors).
  const warnings = [
    ...new Set(
      reader.warnings.filter(
        (w) => !/vendor not matched/i.test(w) && !/saving as a bill/i.test(w)
      )
    ),
  ].slice(0, 12);
  if (!f.buyerName && !f.buyerGstin && (f.vendorName || f.vendorGstin)) {
    warnings.push(
      "Buyer/Bill To was empty — used supplier/party fields to match a customer. Verify the customer."
    );
  }
  if (!match.matchedCustomerId && (customerName || customerGstin)) {
    warnings.push(
      "Customer not matched automatically — select customer manually."
    );
  }

  return {
    customerName,
    customerGstin,
    invoiceDate: f.documentDate,
    dueDate: f.dueDate,
    placeOfSupply: placeOfSupplyFromGstin(customerGstin),
    lineItems: f.lineItems.map((l) => ({
      description: l.description,
      hsnSac: l.hsnSac || "",
      quantity: l.quantity,
      unit: "Nos",
      rate: l.rate,
      discount: 0,
      gstRate: l.gstRate,
    })),
    gstAmount: f.gstAmount,
    totalAmount: f.totalAmount,
    documentKind: f.documentKind,
    confidence: reader.confidence,
    warnings,
    matchedCustomerId: match.matchedCustomerId,
    matchedCustomerLabel: match.matchedCustomerLabel,
  };
}
