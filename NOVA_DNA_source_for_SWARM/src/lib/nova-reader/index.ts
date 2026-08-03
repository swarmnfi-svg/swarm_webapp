/**
 * NOVA Reader public barrel — leaf modules only (no server-only PDF/LLM ingest).
 * Call `readDocument` via `@/lib/nova-reader/read-document` from server actions.
 */

export {
  NOVA_READER_MAX_BYTES,
  NOVA_READER_MAX_MB,
  NOVA_READER_MAX_PREVIEW_PAGES,
  NOVA_READER_VISION_DPI,
  NOVA_READER_RICH_TEXT_CHARS,
  NOVA_READER_OVERALL_TIMEOUT_MS,
  NOVA_READER_IMAGE_LONG_EDGE,
  NOVA_READER_IMAGE_MIN_SHORT_EDGE,
  NOVA_READER_IMAGE_JPEG_QUALITY,
  NOVA_READER_IMAGE_MAX_VISION_BYTES,
  EXTRACT_MAX_BYTES,
  EXTRACT_MAX_MB,
  invoiceExtractTooLargeMessage,
  novaReaderTooLargeMessage,
} from "@/lib/nova-reader/limits";

export {
  NOVA_READER_ACCEPT,
  NOVA_READER_EXTENSIONS,
  NOVA_READER_IMAGE_EXTENSIONS,
  isNovaReaderExtension,
  validateNovaReaderFormat,
} from "@/lib/nova-reader/formats";

export {
  isNovaReaderEnvEnabled,
  isNovaReaderFeatureAvailable,
} from "@/lib/nova-reader/gates";

export {
  assertNovaReaderIntentAccess,
  canNovaReaderAssistMoneyDoc,
} from "@/lib/nova-reader/intent-acl";
export type { NovaReaderIntent } from "@/lib/nova-reader/intent-acl";

export {
  parseNovaReaderLlmJson,
  fieldsHaveUsablePrefill,
  readerPayloadIsUsable,
  matchVendorFromHints,
  matchCustomerFromHints,
} from "@/lib/nova-reader/parse-fields";

export {
  normalizeGstin,
  normalizeInvoiceDate,
} from "@/lib/nova-reader/coerce";

export { mapNovaReaderToPurchaseBillDraft } from "@/lib/nova-reader/mappers/purchase-bill";
export type { PurchaseBillReaderDraft } from "@/lib/nova-reader/mappers/purchase-bill";

export { mapNovaReaderToBillingDraft } from "@/lib/nova-reader/mappers/billing";
export type { BillingReaderDraft } from "@/lib/nova-reader/mappers/billing";

export { mapNovaReaderToReceiptDraft } from "@/lib/nova-reader/mappers/receipt";
export type { ReceiptReaderDraft } from "@/lib/nova-reader/mappers/receipt";

export { mapNovaReaderToPaymentRequestDraft } from "@/lib/nova-reader/mappers/payment-request";
export type { PaymentRequestReaderDraft } from "@/lib/nova-reader/mappers/payment-request";

export { mapNovaReaderToManualExpenseDraft } from "@/lib/nova-reader/mappers/manual-expense";
export type {
  ManualExpenseReaderDraft,
  ManualExpenseEntryType,
} from "@/lib/nova-reader/mappers/manual-expense";

export type { NovaReaderPreviewPayload, NovaReaderFieldsPayload } from "@/lib/nova-reader/preview-payload";
export { previewFromReaderSuccess } from "@/lib/nova-reader/preview-payload";

export {
  resolveFillableForm,
  resolveOpenModuleByHref,
  matchPostNavigateFillTarget,
  selectChatReaderIntent,
  suggestOpenModulesForKind,
} from "@/lib/nova-reader/fillable-form-registry";
export type { FillableFormContext, FillableFormIntent } from "@/lib/nova-reader/fillable-form-registry";

export {
  NOVA_READER_FILL_REQUEST_EVENT,
  NOVA_READER_FILL_RESULT_EVENT,
  dispatchFillRequest,
  subscribeFillTarget,
  hasFillSubscriber,
} from "@/lib/nova-reader/form-fill-bridge";
export type {
  NovaReaderFillDraft,
  NovaReaderFillRequestDetail,
  NovaReaderFillResultDetail,
} from "@/lib/nova-reader/form-fill-bridge";

export type {
  NovaReaderConfidence,
  NovaReaderDocumentKind,
  NovaReaderFields,
  NovaReaderLineItem,
  NovaReaderPage,
  NovaReaderPreview,
  NovaReaderResult,
  NovaReaderSuccess,
  NovaReaderFailure,
  NovaReaderVendorHint,
  NovaReaderCustomerHint,
  ReadDocumentOptions,
} from "@/lib/nova-reader/types";

export {
  parseReaderCaptionOpenContext,
  captionPartyNameForSide,
  emptyReaderOpenContext,
} from "@/lib/nova-reader/caption-open-context";
export type { NovaReaderOpenContext } from "@/lib/nova-reader/caption-open-context";
