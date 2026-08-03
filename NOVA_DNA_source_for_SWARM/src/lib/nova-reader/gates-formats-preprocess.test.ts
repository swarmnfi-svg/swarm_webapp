import { describe, expect, it } from "vitest";
import {
  isNovaReaderEnvEnabled,
  isNovaReaderFeatureAvailable,
} from "@/lib/nova-reader/gates";
import {
  isNovaReaderExtension,
  validateNovaReaderFormat,
  NOVA_READER_IMAGE_EXTENSIONS,
} from "@/lib/nova-reader/formats";
import {
  NOVA_READER_IMAGE_LONG_EDGE,
  NOVA_READER_MAX_BYTES,
} from "@/lib/nova-reader/limits";
import { preprocessImageForNovaReader } from "@/lib/nova-reader/preprocess-image";
import { mapNovaReaderToReceiptDraft } from "@/lib/nova-reader/mappers/receipt";
import { mapNovaReaderToPaymentRequestDraft } from "@/lib/nova-reader/mappers/payment-request";
import { mapNovaReaderToPurchaseBillDraft } from "@/lib/nova-reader/mappers/purchase-bill";
import { mapNovaReaderToBillingDraft } from "@/lib/nova-reader/mappers/billing";
import { mapNovaReaderToManualExpenseDraft } from "@/lib/nova-reader/mappers/manual-expense";
import sharp from "sharp";

describe("nova-reader gates", () => {
  it("is enabled by default when kill-switches unset", () => {
    const prevR = process.env.NOVA_READER_ENABLED;
    const prevO = process.env.INVOICE_OCR_ENABLED;
    delete process.env.NOVA_READER_ENABLED;
    delete process.env.INVOICE_OCR_ENABLED;
    expect(isNovaReaderEnvEnabled()).toBe(true);
    process.env.NOVA_READER_ENABLED = "false";
    expect(isNovaReaderEnvEnabled()).toBe(false);
    delete process.env.NOVA_READER_ENABLED;
    process.env.INVOICE_OCR_ENABLED = "false";
    expect(isNovaReaderEnvEnabled()).toBe(false);
    if (prevR === undefined) delete process.env.NOVA_READER_ENABLED;
    else process.env.NOVA_READER_ENABLED = prevR;
    if (prevO === undefined) delete process.env.INVOICE_OCR_ENABLED;
    else process.env.INVOICE_OCR_ENABLED = prevO;
  });

  it("feature gate requires AI flag + env (LLM checked separately at runtime)", () => {
    // Without LLM keys this may be false — assert AI flag is required.
    expect(
      isNovaReaderFeatureAvailable({ aiAssistantEnabled: false })
    ).toBe(false);
  });
});

describe("nova-reader MIME allowlist", () => {
  it("accepts PDF and common photos including HEIC", () => {
    expect(validateNovaReaderFormat("bill.pdf").ok).toBe(true);
    expect(validateNovaReaderFormat("scan.JPG").ok).toBe(true);
    expect(validateNovaReaderFormat("shot.webp").ok).toBe(true);
    expect(validateNovaReaderFormat("phone.heic").ok).toBe(true);
    expect(validateNovaReaderFormat("phone.heif").ok).toBe(true);
    expect(validateNovaReaderFormat("notes.csv").ok).toBe(false);
    expect(isNovaReaderExtension(".heic")).toBe(true);
    expect(NOVA_READER_IMAGE_EXTENSIONS).toContain(".heic");
  });

  it("reader size budget is 25 MB (not the 10 MB general upload cap)", () => {
    expect(NOVA_READER_MAX_BYTES).toBe(25 * 1024 * 1024);
  });
});

describe("nova-reader image preprocess", () => {
  it("downscales large photos to ~long edge and outputs JPEG", async () => {
    const input = await sharp({
      create: {
        width: 4000,
        height: 3000,
        channels: 3,
        background: { r: 240, g: 240, b: 245 },
      },
    })
      .jpeg()
      .toBuffer();

    const out = await preprocessImageForNovaReader(input);
    expect(out.mime).toBe("image/jpeg");
    expect(out.transformed).toBe(true);
    expect(out.darkEnhanced).toBe(false);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(
      NOVA_READER_IMAGE_LONG_EDGE
    );
    expect(out.buffer.length).toBeGreaterThan(500);
    expect(out.buffer.length).toBeLessThan(input.length);
  });

  it("upsizes tiny dark screenshots and marks darkEnhanced", async () => {
    const input = await sharp({
      create: {
        width: 480,
        height: 72,
        channels: 3,
        background: { r: 30, g: 32, b: 36 },
      },
    })
      .png()
      .toBuffer();

    const out = await preprocessImageForNovaReader(input);
    expect(out.mime).toBe("image/jpeg");
    expect(out.darkEnhanced).toBe(true);
    expect(Math.min(out.width, out.height)).toBeGreaterThanOrEqual(360);
    expect(out.buffer.length).toBeGreaterThan(400);
  });
});

describe("nova-reader mappers (assistive only — no ledger writes)", () => {
  const base = {
    confidence: "medium" as const,
    warnings: ["Review all amounts."],
    fields: {
      documentKind: "tax_invoice" as const,
      vendorName: "Steel Fab",
      vendorGstin: "33AABCS1429B1Z1",
      buyerName: null,
      buyerGstin: null,
      documentNumber: "SF/1",
      documentDate: "2026-07-13",
      dueDate: null,
      subtotal: 1000,
      cgst: null,
      sgst: null,
      igst: null,
      gstAmount: 180,
      totalAmount: 1180,
      currency: "INR",
      tdsApplicable: null,
      tdsAmount: null,
      rcmApplicable: null,
      lineItems: [
        {
          description: "Plate",
          hsnSac: "7208",
          quantity: 1,
          rate: 1000,
          gstRate: 18,
        },
      ],
    },
  };

  it("maps purchase bill draft without mutating vendors", () => {
    const draft = mapNovaReaderToPurchaseBillDraft(base, [
      { id: "v1", vendorName: "Steel Fab", gstin: "33AABCS1429B1Z1" },
    ]);
    expect(draft.matchedVendorId).toBe("v1");
    expect(draft.vendorInvoiceNumber).toBe("SF/1");
    expect(draft.lineItems).toHaveLength(1);
  });

  it("maps billing draft to matched customer from buyer GSTIN", () => {
    const draft = mapNovaReaderToBillingDraft(
      {
        ...base,
        fields: {
          ...base.fields,
          buyerName: "Acme Foods",
          buyerGstin: "29ABCDE1234F1Z5",
          vendorName: "Our Company",
          vendorGstin: "33AABCS1429B1Z1",
        },
      },
      [{ id: "c1", customerName: "Acme Foods", gstin: "29ABCDE1234F1Z5" }]
    );
    expect(draft.matchedCustomerId).toBe("c1");
    expect(draft.customerGstin).toBe("29ABCDE1234F1Z5");
    expect(draft.placeOfSupply).toBe("29");
    expect(draft.lineItems[0].unit).toBe("Nos");
  });

  it("warns when billing customer is not matched", () => {
    const draft = mapNovaReaderToBillingDraft(
      {
        ...base,
        warnings: ["Vendor not matched automatically — select vendor manually."],
        fields: {
          ...base.fields,
          buyerName: "Unknown Co",
          buyerGstin: "27AAAAA0000A1Z5",
        },
      },
      []
    );
    expect(draft.matchedCustomerId).toBeNull();
    expect(draft.warnings.some((w) => /customer not matched/i.test(w))).toBe(true);
    expect(draft.warnings.some((w) => /vendor not matched/i.test(w))).toBe(false);
  });

  it("maps receipt amount / date / UTR from fields or raw text", () => {
    const draft = mapNovaReaderToReceiptDraft({
      ...base,
      rawText: "UTR: HDFCN12345678901 credited",
    });
    expect(draft.amount).toBe(1180);
    expect(draft.receiptDate).toBe("2026-07-13");
    expect(draft.utr).toBe("SF/1");
  });

  it("maps payment request amount and purpose hint", () => {
    const draft = mapNovaReaderToPaymentRequestDraft(base, []);
    expect(draft.amount).toBe(1180);
    expect(draft.purpose).toMatch(/Steel Fab/);
  });

  it("maps manual expense as EXPENSE when vendor unmatched", () => {
    const draft = mapNovaReaderToManualExpenseDraft(base, []);
    expect(draft.entryType).toBe("EXPENSE");
    expect(draft.amount).toBe(1180);
    expect(draft.gstAmount).toBe(180);
    expect(draft.partyLabel).toBe("Steel Fab");
    expect(draft.transactionDate).toBe("2026-07-13");
    expect(draft.matchedVendorId).toBeNull();
    expect(draft.purpose).toMatch(/Steel Fab/);
  });

  it("maps manual expense as VENDOR_PAYMENT when vendor matched", () => {
    const draft = mapNovaReaderToManualExpenseDraft(base, [
      { id: "v1", vendorName: "Steel Fab", gstin: "33AABCS1429B1Z1" },
    ]);
    expect(draft.entryType).toBe("VENDOR_PAYMENT");
    expect(draft.matchedVendorId).toBe("v1");
    expect(draft.gstAmount).toBeNull();
    expect(draft.amount).toBe(1180);
  });
});
