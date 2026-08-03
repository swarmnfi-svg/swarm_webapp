/**
 * CustomEvent bridge: NOVA chat → fillable form applyDraft.
 * Same window pattern as NOVA_AI_BUBBLE_STATE_EVENT. No sessionStorage of drafts.
 *
 * Apply path uses an in-memory subscriber Map (reliable under SSR/tests).
 * CustomEvents are still dispatched for observability / future listeners.
 */

import type { NovaReaderIntent } from "@/app/(app)/nova-reader/read-action";
import type { BillingReaderDraft } from "@/lib/nova-reader/mappers/billing";
import type { PurchaseBillReaderDraft } from "@/lib/nova-reader/mappers/purchase-bill";
import type { ReceiptReaderDraft } from "@/lib/nova-reader/mappers/receipt";
import type { PaymentRequestReaderDraft } from "@/lib/nova-reader/mappers/payment-request";
import type { ManualExpenseReaderDraft } from "@/lib/nova-reader/mappers/manual-expense";
import type {
  NovaReaderFieldsPayload,
  NovaReaderPreviewPayload,
} from "@/lib/nova-reader/preview-payload";

export const NOVA_READER_FILL_REQUEST_EVENT = "nova-reader-fill-request";
export const NOVA_READER_FILL_RESULT_EVENT = "nova-reader-fill-result";

export type NovaReaderFillDraft =
  | BillingReaderDraft
  | PurchaseBillReaderDraft
  | ReceiptReaderDraft
  | PaymentRequestReaderDraft
  | ManualExpenseReaderDraft;

export type NovaReaderFillRequestDetail = {
  requestId: string;
  formId: string;
  intent: NovaReaderIntent;
  draft: NovaReaderFillDraft;
  fields: NovaReaderFieldsPayload;
  preview?: NovaReaderPreviewPayload;
  source: "chat_bubble" | "ai_assistant_page";
};

export type NovaReaderFillResultDetail = {
  requestId: string;
  ok: boolean;
  reason?: "no_subscriber" | "intent_mismatch" | "user_cancelled" | "applied" | "error";
};

type FillTarget = {
  formId: string;
  intent: NovaReaderIntent;
  apply: (draft: NovaReaderFillDraft, detail: NovaReaderFillRequestDetail) => void;
};

/** Live form subscribers (module-level; per-tab only). */
const targets = new Map<string, FillTarget>();

export function hasFillSubscriber(formId: string, intent?: NovaReaderIntent): boolean {
  const t = targets.get(formId);
  if (!t) return false;
  if (intent != null && t.intent !== intent) return false;
  return true;
}

export function subscribeFillTarget(opts: {
  formId: string;
  intent: NovaReaderIntent;
  apply: (draft: NovaReaderFillDraft, detail: NovaReaderFillRequestDetail) => void;
}): () => void {
  const entry: FillTarget = {
    formId: opts.formId,
    intent: opts.intent,
    apply: opts.apply,
  };
  targets.set(opts.formId, entry);
  return () => {
    if (targets.get(opts.formId) === entry) {
      targets.delete(opts.formId);
    }
  };
}

function dispatchFillResult(detail: NovaReaderFillResultDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(NOVA_READER_FILL_RESULT_EVENT, { detail })
  );
}

function applyFromMap(detail: NovaReaderFillRequestDetail): NovaReaderFillResultDetail {
  const target = targets.get(detail.formId);
  if (!target) {
    return { requestId: detail.requestId, ok: false, reason: "no_subscriber" };
  }
  if (target.intent !== detail.intent) {
    return { requestId: detail.requestId, ok: false, reason: "intent_mismatch" };
  }
  try {
    target.apply(detail.draft, detail);
    return { requestId: detail.requestId, ok: true, reason: "applied" };
  } catch {
    return { requestId: detail.requestId, ok: false, reason: "error" };
  }
}

function newRequestId(): string {
  return `nr-fill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ask the live form subscriber to apply a draft.
 * Retries briefly for hydration races (form mounts after chat result).
 */
export async function dispatchFillRequest(
  detail: Omit<NovaReaderFillRequestDetail, "requestId"> & { requestId?: string },
  opts?: { timeoutMs?: number; retryMs?: number }
): Promise<NovaReaderFillResultDetail> {
  const requestId = detail.requestId ?? newRequestId();
  const retryMs = opts?.retryMs ?? 400;
  const full: NovaReaderFillRequestDetail = { ...detail, requestId };

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NOVA_READER_FILL_REQUEST_EVENT, { detail: full })
    );
  }

  let result = applyFromMap(full);
  if (result.reason === "no_subscriber" && retryMs > 0) {
    await sleep(retryMs);
    result = applyFromMap(full);
  }

  dispatchFillResult(result);
  return result;
}

/** Test helper — clear all subscribers between unit tests. */
export function __resetFillTargetsForTests() {
  targets.clear();
}
