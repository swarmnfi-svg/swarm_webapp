/**
 * Client-safe preview shape shared by purchase-bill + generic Reader UI.
 * Keep free of server-only imports.
 */

export type NovaReaderPreviewPayload = {
  title: string;
  rawText: string;
  pages: Array<{
    pageIndex: number;
    text: string;
    thumbnailDataUrl: string | null;
  }>;
  confidence: "high" | "medium" | "low";
  warnings: string[];
  textSource: string;
  documentKind: string | null;
  gstAmount: number | null;
  totalAmount: number | null;
};

export type NovaReaderFieldsPayload = {
  documentKind: string | null;
  vendorName: string | null;
  vendorGstin: string | null;
  buyerName: string | null;
  buyerGstin: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  gstAmount: number | null;
  totalAmount: number | null;
  currency: string | null;
  tdsApplicable: boolean | null;
  tdsAmount: number | null;
  rcmApplicable: boolean | null;
  lineItems: Array<{
    description: string;
    hsnSac: string;
    quantity: number;
    rate: number;
    gstRate: number;
    amount?: number | null;
  }>;
};

export function previewFromReaderSuccess(result: {
  preview: {
    title: string;
    rawText: string;
    pages: Array<{
      pageIndex: number;
      text: string;
      thumbnailDataUrl: string | null;
    }>;
  };
  confidence: "high" | "medium" | "low";
  warnings: string[];
  textSource: string;
  fields: {
    documentKind: string | null;
    gstAmount: number | null;
    totalAmount: number | null;
  };
}): NovaReaderPreviewPayload {
  return {
    title: result.preview.title,
    rawText: result.preview.rawText,
    pages: result.preview.pages.map((p) => ({
      pageIndex: p.pageIndex,
      text: p.text,
      thumbnailDataUrl: p.thumbnailDataUrl,
    })),
    confidence: result.confidence,
    warnings: result.warnings,
    textSource: result.textSource,
    documentKind: result.fields.documentKind,
    gstAmount: result.fields.gstAmount,
    totalAmount: result.fields.totalAmount,
  };
}
