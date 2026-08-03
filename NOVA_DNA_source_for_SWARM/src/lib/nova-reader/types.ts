/**
 * NOVA Reader — shared document read engine (OCR/PDF text + LLM structure).
 * Never writes ERP/ledger rows; callers map fields into editable form drafts.
 */

export type NovaReaderConfidence = "high" | "medium" | "low";

export type NovaReaderDocumentKind =
  | "tax_invoice"
  | "purchase_order"
  | "receipt"
  | "expense"
  | "other";

export type NovaReaderLineItem = {
  description: string;
  hsnSac: string;
  quantity: number;
  rate: number;
  gstRate: number;
  amount?: number | null;
};

/** Generic structured fields — mappers project these into module forms. */
export type NovaReaderFields = {
  documentKind: NovaReaderDocumentKind | null;
  vendorName: string | null;
  vendorGstin: string | null;
  /** Customer / Bill To (sales invoices, customer POs). */
  buyerName: string | null;
  buyerGstin: string | null;
  /** Invoice / bill / receipt number when present. */
  documentNumber: string | null;
  documentDate: string | null;
  dueDate: string | null;
  subtotal: number | null;
  cgst: number | null;
  sgst: number | null;
  igst: number | null;
  /** Total GST when CGST/SGST/IGST not broken out. */
  gstAmount: number | null;
  totalAmount: number | null;
  currency: string | null;
  tdsApplicable: boolean | null;
  tdsAmount: number | null;
  rcmApplicable: boolean | null;
  lineItems: NovaReaderLineItem[];
};

export type NovaReaderPage = {
  pageIndex: number;
  /** Plain text from PDF layer or OCR for this page (may be empty). */
  text: string;
  /** JPEG/PNG data URL for CamScanner-style preview (optional). */
  thumbnailDataUrl: string | null;
};

export type NovaReaderPreview = {
  rawText: string;
  pages: NovaReaderPage[];
  /** Short label for UI chrome. */
  title: string;
};

export type NovaReaderVendorHint = {
  id: string;
  vendorName: string;
  gstin: string | null;
};

export type NovaReaderCustomerHint = {
  id: string;
  customerName: string;
  gstin: string | null;
};

export type NovaReaderSuccess = {
  ok: true;
  rawText: string;
  pages: NovaReaderPage[];
  fields: NovaReaderFields;
  confidence: NovaReaderConfidence;
  warnings: string[];
  preview: NovaReaderPreview;
  model: string;
  provider: string;
  /** How text was obtained. */
  textSource: "pdf_text" | "vision_llm" | "pdf_text+vision" | "image";
};

export type NovaReaderFailure = {
  ok: false;
  code:
    | "disabled"
    | "llm_off"
    | "invalid_file"
    | "extract_failed"
    | "parse_failed"
    | "empty";
  message: string;
};

export type NovaReaderResult = NovaReaderSuccess | NovaReaderFailure;

export type ReadDocumentOptions = {
  buffer: Buffer;
  fileName: string;
  /** Optional vendor list for GSTIN/name matching hints in warnings only. */
  vendors?: NovaReaderVendorHint[];
  /** Include page thumbnails in result (default true). */
  includeThumbnails?: boolean;
};
