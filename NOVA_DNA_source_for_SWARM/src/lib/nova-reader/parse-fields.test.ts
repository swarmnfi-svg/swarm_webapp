import { describe, expect, it } from "vitest";
import {
  fieldsHaveUsablePrefill,
  parseNovaReaderLlmJson,
  readerPayloadIsUsable,
} from "@/lib/nova-reader/parse-fields";
import { mapNovaReaderToPurchaseBillDraft } from "@/lib/nova-reader/mappers/purchase-bill";
import {
  EXTRACT_MAX_BYTES,
  EXTRACT_MAX_MB,
  invoiceExtractTooLargeMessage,
} from "@/lib/nova-reader/limits";
import {
  matchVendorFromHints,
  normalizeGstin,
  normalizeInvoiceDate,
  parseInvoiceOcrResponse,
  draftHasUsablePrefill,
} from "@/lib/ai/invoice-ocr";

describe("nova-reader limits", () => {
  it("allows reads up to 25 MB", () => {
    expect(EXTRACT_MAX_MB).toBe(25);
    expect(EXTRACT_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(invoiceExtractTooLargeMessage(26 * 1024 * 1024)).toMatch(
      /26\.0 MB.*Maximum is 25 MB/
    );
  });
});

describe("nova-reader parse-fields", () => {
  it("accepts null hsnSac and nested fields (Gemini PO response)", () => {
    const raw = JSON.stringify({
      rawText: "PO C0028-P001-PO001\nMULTIPLE BIOGAS VIA BIOFLAME\n187575",
      confidence: "medium",
      warnings: ["Purchase Order, not a tax invoice."],
      fields: {
        documentKind: "purchase_order",
        vendorName: "Miura Biopower",
        vendorGstin: "36ACCFM5724B1ZK",
        documentNumber: null,
        documentDate: null,
        lineItems: [
          {
            description: "MULTIPLE BIOGAS VIA BIOFLAME",
            hsnSac: null,
            quantity: 1,
            rate: 187575.0,
            gstRate: 5,
          },
        ],
        gstAmount: 9378.75,
        totalAmount: 196953.75,
      },
    });
    const parsed = parseNovaReaderLlmJson(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.rawText).toMatch(/BIOFLAME/);
    expect(parsed!.fields.lineItems).toHaveLength(1);
    expect(parsed!.fields.lineItems[0].hsnSac).toBe("");
    expect(parsed!.fields.totalAmount).toBe(196953.75);
    expect(fieldsHaveUsablePrefill(parsed!.fields)).toBe(true);

    const draft = mapNovaReaderToPurchaseBillDraft(parsed!);
    expect(draft.lineItems[0].rate).toBe(187575);
    expect(draft.documentKind).toBe("purchase_order");
    expect(draft.totalAmount).toBe(196953.75);
  });

  it("treats rawText-only chat notes as usable reader payloads", () => {
    const parsed = parseNovaReaderLlmJson(
      JSON.stringify({
        rawText:
          "Madhu Engineer Synod 2021\nWork : design co ordinate\nName : megha\nPayment balance : 3500 rs",
        confidence: "medium",
        warnings: [],
        fields: {
          documentKind: "other",
          vendorName: null,
          totalAmount: null,
          lineItems: [],
        },
      })
    );
    expect(parsed).not.toBeNull();
    expect(fieldsHaveUsablePrefill(parsed!.fields)).toBe(false);
    expect(readerPayloadIsUsable(parsed!)).toBe(true);
  });

  it("accepts flat legacy invoice JSON", () => {
    const draft = parseInvoiceOcrResponse(
      JSON.stringify({
        vendorInvoiceNumber: "SF/24-25/0091",
        vendorInvoiceDate: "13/07/2026",
        lineItems: [
          {
            description: "MS Plate",
            hsnSac: "7208",
            quantity: 2,
            rate: 500,
            gstRate: 18,
          },
        ],
      })
    );
    expect(draft).not.toBeNull();
    expect(draft!.vendorInvoiceNumber).toBe("SF/24-25/0091");
    expect(draft!.vendorInvoiceDate).toBe("2026-07-13");
    expect(draftHasUsablePrefill(draft!)).toBe(true);
  });

  it("drops bad lines but keeps usable invoice number", () => {
    const draft = parseInvoiceOcrResponse(
      JSON.stringify({
        vendorInvoiceNumber: "INV-1",
        lineItems: [{ description: "", quantity: 1, rate: 1 }],
      })
    );
    expect(draft).not.toBeNull();
    expect(draft!.vendorInvoiceNumber).toBe("INV-1");
    expect(draft!.lineItems).toHaveLength(0);
  });

  it("rejects non-JSON garbage", () => {
    expect(parseNovaReaderLlmJson("not json")).toBeNull();
    expect(parseInvoiceOcrResponse("not json")).toBeNull();
  });
  it("dedupes repeated review warnings", () => {
    const raw = JSON.stringify({
      rawText: "Invoice INV-9 total 100",
      confidence: "high",
      warnings: [
        "Review all amounts, GST%, and totals before saving.",
        "Review all amounts, GST%, and totals before saving.",
      ],
      fields: {
        documentKind: "tax_invoice",
        documentNumber: "INV-9",
        totalAmount: 100,
        lineItems: [],
      },
    });
    const parsed = parseNovaReaderLlmJson(raw);
    expect(parsed).not.toBeNull();
    const review = parsed!.warnings.filter((w) =>
      /Review all amounts/i.test(w)
    );
    expect(review).toHaveLength(1);
  });
});

describe("nova-reader / invoice-ocr helpers", () => {
  it("normalizes GSTIN and dates", () => {
    expect(normalizeGstin("33 aabcs1429b1z1")).toBe("33AABCS1429B1Z1");
    expect(normalizeInvoiceDate("13/07/2026")).toBe("2026-07-13");
    expect(normalizeInvoiceDate("19 Jul 2026")).toBe("2026-07-19");
    expect(normalizeInvoiceDate("July 19, 2026")).toBe("2026-07-19");
    expect(normalizeInvoiceDate("19th July 2026")).toBe("2026-07-19");
  });

  it("parses Indian-grouped money strings", async () => {
    const { coerceLooseNumber } = await import("@/lib/nova-reader/coerce");
    expect(coerceLooseNumber("₹1,87,575.00")).toBe(187575);
    expect(coerceLooseNumber("1,87,575")).toBe(187575);
  });

  it("matches vendor by GSTIN", () => {
    const vendors = [
      { id: "v1", vendorName: "Steel Fab Pvt Ltd", gstin: "33AABCS1429B1Z1" },
    ];
    expect(
      matchVendorFromHints(
        { vendorGstin: "33AABCS1429B1Z1", vendorName: "ignored" },
        vendors
      ).matchedVendorId
    ).toBe("v1");
  });
});
