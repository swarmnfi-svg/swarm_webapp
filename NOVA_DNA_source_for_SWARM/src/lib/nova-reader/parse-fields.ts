import { z } from "zod";
import {
  asNullableString,
  coerceConfidence,
  coerceLooseNumber,
  normalizeGstin,
  normalizeInvoiceDate,
  stripJsonFence,
} from "@/lib/nova-reader/coerce";
import type {
  NovaReaderCustomerHint,
  NovaReaderDocumentKind,
  NovaReaderFields,
  NovaReaderLineItem,
  NovaReaderVendorHint,
} from "@/lib/nova-reader/types";

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  hsnSac: z.string().trim().max(20).optional().default(""),
  quantity: z.coerce.number().positive().max(1_000_000),
  rate: z.coerce.number().min(0).max(100_000_000),
  gstRate: z.coerce.number().min(0).max(100).default(18),
  amount: z.coerce.number().min(0).max(100_000_000).optional().nullable(),
});

function softParseLineItems(raw: unknown): {
  lines: NovaReaderLineItem[];
  dropped: number;
} {
  if (!Array.isArray(raw)) return { lines: [], dropped: 0 };
  const lines: NovaReaderLineItem[] = [];
  let dropped = 0;
  for (const item of raw.slice(0, 40)) {
    if (!item || typeof item !== "object") {
      dropped += 1;
      continue;
    }
    const row = item as Record<string, unknown>;
    const description = asNullableString(row.description, 500) || "";
    const hsnRaw = row.hsnSac ?? row.hsn ?? row.sac;
    const hsnSac =
      hsnRaw == null || hsnRaw === ""
        ? ""
        : asNullableString(hsnRaw, 20) || "";
    const quantity = coerceLooseNumber(row.quantity);
    const rate = coerceLooseNumber(row.rate);
    const gstRate = coerceLooseNumber(row.gstRate ?? row.gstPercent) ?? 18;
    const amount = coerceLooseNumber(row.amount);
    const candidate = {
      description,
      hsnSac,
      quantity: quantity ?? NaN,
      rate: rate ?? NaN,
      gstRate,
      amount,
    };
    const parsed = lineSchema.safeParse(candidate);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    lines.push({
      description: parsed.data.description,
      hsnSac: parsed.data.hsnSac || "",
      quantity: parsed.data.quantity,
      rate: parsed.data.rate,
      gstRate: parsed.data.gstRate,
      amount: parsed.data.amount ?? null,
    });
  }
  return { lines, dropped };
}

function softParseWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((w) => (typeof w === "string" ? w.trim() : String(w ?? "").trim()))
    .filter(Boolean)
    .map((w) => w.slice(0, 240))
    .slice(0, 12);
}

function parseDocumentKind(raw: unknown): NovaReaderDocumentKind | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (
    s === "tax_invoice" ||
    s === "purchase_order" ||
    s === "receipt" ||
    s === "expense" ||
    s === "other"
  ) {
    return s;
  }
  if (s.includes("invoice")) return "tax_invoice";
  if (s.includes("purchase") || s === "po") return "purchase_order";
  if (s.includes("receipt")) return "receipt";
  if (s.includes("expense")) return "expense";
  return null;
}

export function matchVendorFromHints(
  draft: Pick<NovaReaderFields, "vendorGstin" | "vendorName">,
  vendors: NovaReaderVendorHint[]
): { matchedVendorId: string | null; matchedVendorLabel: string | null } {
  const gstin = normalizeGstin(draft.vendorGstin ?? undefined);
  if (gstin) {
    const byGstin = vendors.find((v) => normalizeGstin(v.gstin) === gstin);
    if (byGstin) {
      return {
        matchedVendorId: byGstin.id,
        matchedVendorLabel: byGstin.vendorName,
      };
    }
  }
  const name = (draft.vendorName || "").trim().toLowerCase();
  if (name.length >= 3) {
    const exact = vendors.find((v) => v.vendorName.trim().toLowerCase() === name);
    if (exact) {
      return { matchedVendorId: exact.id, matchedVendorLabel: exact.vendorName };
    }
    const partial = vendors.filter((v) => {
      const n = v.vendorName.trim().toLowerCase();
      return n.includes(name) || name.includes(n);
    });
    if (partial.length === 1) {
      return {
        matchedVendorId: partial[0].id,
        matchedVendorLabel: partial[0].vendorName,
      };
    }
  }
  return { matchedVendorId: null, matchedVendorLabel: null };
}

export function matchCustomerFromHints(
  draft: { buyerGstin?: string | null; buyerName?: string | null },
  customers: NovaReaderCustomerHint[]
): { matchedCustomerId: string | null; matchedCustomerLabel: string | null } {
  const gstin = normalizeGstin(draft.buyerGstin ?? undefined);
  if (gstin) {
    const byGstin = customers.find((c) => normalizeGstin(c.gstin) === gstin);
    if (byGstin) {
      return {
        matchedCustomerId: byGstin.id,
        matchedCustomerLabel: byGstin.customerName,
      };
    }
  }
  const name = (draft.buyerName || "").trim().toLowerCase();
  if (name.length >= 3) {
    const exact = customers.find(
      (c) => c.customerName.trim().toLowerCase() === name
    );
    if (exact) {
      return {
        matchedCustomerId: exact.id,
        matchedCustomerLabel: exact.customerName,
      };
    }
    const partial = customers.filter((c) => {
      const n = c.customerName.trim().toLowerCase();
      return n.includes(name) || name.includes(n);
    });
    if (partial.length === 1) {
      return {
        matchedCustomerId: partial[0].id,
        matchedCustomerLabel: partial[0].customerName,
      };
    }
  }
  return { matchedCustomerId: null, matchedCustomerLabel: null };
}

export type ParsedNovaReaderPayload = {
  rawText: string;
  fields: NovaReaderFields;
  confidence: "high" | "medium" | "low";
  warnings: string[];
};

/** Soft-parse LLM JSON; null optional strings and bad lines do not kill the draft. */
export function parseNovaReaderLlmJson(raw: string): ParsedNovaReaderPayload | null {
  let json: unknown;
  try {
    json = JSON.parse(stripJsonFence(raw));
  } catch {
    return null;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const fieldsObj =
    o.fields && typeof o.fields === "object" && !Array.isArray(o.fields)
      ? (o.fields as Record<string, unknown>)
      : o;

  const { lines, dropped } = softParseLineItems(
    fieldsObj.lineItems ?? o.lineItems
  );
  const warnings = softParseWarnings(o.warnings ?? fieldsObj.warnings);
  if (dropped > 0) {
    warnings.push(
      `${dropped} line item(s) looked incomplete and were skipped — add lines manually.`
    );
  }
  if (!lines.length) {
    warnings.push("No line items extracted — add lines manually.");
  }

  const vendorName = asNullableString(
    fieldsObj.vendorName ?? o.vendorName,
    200
  );
  const gstin = normalizeGstin(
    asNullableString(fieldsObj.vendorGstin ?? o.vendorGstin, 20)
  );
  const buyerName = asNullableString(
    fieldsObj.buyerName ?? o.buyerName ?? fieldsObj.customerName ?? o.customerName,
    200
  );
  const buyerGstin = normalizeGstin(
    asNullableString(
      fieldsObj.buyerGstin ??
        o.buyerGstin ??
        fieldsObj.customerGstin ??
        o.customerGstin,
      20
    )
  );
  const documentNumber = asNullableString(
    fieldsObj.documentNumber ??
      fieldsObj.vendorInvoiceNumber ??
      o.documentNumber ??
      o.vendorInvoiceNumber,
    80
  );
  const documentDate = normalizeInvoiceDate(
    asNullableString(
      fieldsObj.documentDate ??
        fieldsObj.vendorInvoiceDate ??
        o.documentDate ??
        o.vendorInvoiceDate,
      32
    )
  );
  const dueDate = normalizeInvoiceDate(
    asNullableString(fieldsObj.dueDate ?? o.dueDate, 32)
  );

  const fields: NovaReaderFields = {
    documentKind: parseDocumentKind(fieldsObj.documentKind ?? o.documentKind),
    vendorName,
    vendorGstin: gstin,
    buyerName,
    buyerGstin,
    documentNumber,
    documentDate,
    dueDate,
    subtotal: coerceLooseNumber(fieldsObj.subtotal ?? o.subtotal),
    cgst: coerceLooseNumber(fieldsObj.cgst ?? o.cgst),
    sgst: coerceLooseNumber(fieldsObj.sgst ?? o.sgst),
    igst: coerceLooseNumber(fieldsObj.igst ?? o.igst),
    gstAmount: coerceLooseNumber(
      fieldsObj.gstAmount ?? o.gstAmount ?? fieldsObj.taxAmount
    ),
    totalAmount: coerceLooseNumber(
      fieldsObj.totalAmount ?? o.totalAmount ?? fieldsObj.grandTotal
    ),
    currency: asNullableString(fieldsObj.currency ?? o.currency, 8) || "INR",
    tdsApplicable:
      typeof (fieldsObj.tdsApplicable ?? o.tdsApplicable) === "boolean"
        ? Boolean(fieldsObj.tdsApplicable ?? o.tdsApplicable)
        : null,
    tdsAmount: (() => {
      const n = coerceLooseNumber(fieldsObj.tdsAmount ?? o.tdsAmount);
      return n != null && n >= 0 && n <= 100_000_000 ? n : null;
    })(),
    rcmApplicable:
      typeof (fieldsObj.rcmApplicable ?? o.rcmApplicable) === "boolean"
        ? Boolean(fieldsObj.rcmApplicable ?? o.rcmApplicable)
        : null,
    lineItems: lines,
  };

  const rawText =
    asNullableString(o.rawText ?? o.ocrText ?? o.text, 50_000) || "";

  if (fields.documentKind === "purchase_order") {
    warnings.push(
      "Document looks like a purchase order — verify party and amounts before saving."
    );
  }
  warnings.push("Review all amounts, GST%, and totals before saving.");

  return {
    rawText,
    fields,
    confidence: coerceConfidence(o.confidence ?? fieldsObj.confidence),
    // Dedupe — LLM + soft-parse often repeat the same review note.
    warnings: [...new Set(warnings)].slice(0, 12),
  };
}

export function fieldsHaveUsablePrefill(fields: NovaReaderFields): boolean {
  return Boolean(
    fields.documentNumber ||
      fields.documentDate ||
      fields.dueDate ||
      fields.vendorName ||
      fields.vendorGstin ||
      fields.buyerName ||
      fields.buyerGstin ||
      fields.lineItems.length ||
      (fields.totalAmount != null && fields.totalAmount > 0) ||
      (fields.gstAmount != null && fields.gstAmount > 0) ||
      (fields.tdsAmount != null && fields.tdsAmount > 0) ||
      fields.tdsApplicable === true ||
      fields.rcmApplicable === true
  );
}

/** Chat notes / handwriting may only yield rawText — still a successful read. */
export function readerPayloadIsUsable(
  parsed: Pick<ParsedNovaReaderPayload, "rawText" | "fields">
): boolean {
  return (
    fieldsHaveUsablePrefill(parsed.fields) ||
    parsed.rawText.replace(/\s+/g, " ").trim().length >= 12
  );
}
