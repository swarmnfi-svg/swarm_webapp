/**
 * Same-tab fill bridge for NOVA safe workflow open.
 * In-memory subscribers only — no sessionStorage (same invariant as Reader bridge).
 * Prefill ≠ commit: listeners update draft UI fields only.
 */

import type { NovaSafeWorkflowFormId } from "@/lib/nova/safe-workflow/map";
import { safeWorkflowFormPath } from "@/lib/nova/safe-workflow/map";
import {
  parseNovaSafeWorkflowHref,
  type ParsedNovaSafeWorkflowHref,
} from "@/lib/nova/safe-workflow/url";

export const NOVA_SAFE_WORKFLOW_FILL_EVENT = "nova-safe-workflow-fill";

export type NovaSafeWorkflowFillFields = Record<string, string>;

export type NovaSafeWorkflowFillDetail = {
  requestId: string;
  formId: NovaSafeWorkflowFormId;
  fields: NovaSafeWorkflowFillFields;
  href: string;
  source: "chat_link" | "programmatic";
};

export type NovaSafeWorkflowFillResult = {
  requestId: string;
  ok: boolean;
  reason?: "no_subscriber" | "form_mismatch" | "applied" | "error" | "not_on_form";
};

type FillTarget = {
  formId: NovaSafeWorkflowFormId;
  acceptFormIds?: NovaSafeWorkflowFormId[];
  apply: (detail: NovaSafeWorkflowFillDetail) => void;
};

const targets = new Map<string, FillTarget>();

function targetKey(formId: NovaSafeWorkflowFormId): string {
  if (
    formId === "payment_request_new" ||
    formId === "staff_advance" ||
    formId === "staff_reimbursement"
  ) {
    return "payment_requests_new";
  }
  return formId;
}

function newRequestId(): string {
  return `nsw-fill-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function hasSafeWorkflowFillSubscriber(
  formId: NovaSafeWorkflowFormId
): boolean {
  return targets.has(targetKey(formId));
}

export function subscribeSafeWorkflowFill(opts: {
  formId: NovaSafeWorkflowFormId;
  acceptFormIds?: NovaSafeWorkflowFormId[];
  apply: (detail: NovaSafeWorkflowFillDetail) => void;
}): () => void {
  const key = targetKey(opts.formId);
  const entry: FillTarget = {
    formId: opts.formId,
    acceptFormIds: opts.acceptFormIds,
    apply: opts.apply,
  };
  targets.set(key, entry);
  return () => {
    if (targets.get(key) === entry) targets.delete(key);
  };
}

function applyFromMap(detail: NovaSafeWorkflowFillDetail): NovaSafeWorkflowFillResult {
  const target = targets.get(targetKey(detail.formId));
  if (!target) {
    return { requestId: detail.requestId, ok: false, reason: "no_subscriber" };
  }
  const accepted = new Set<NovaSafeWorkflowFormId>([
    target.formId,
    ...(target.acceptFormIds ?? []),
  ]);
  if (targetKey(detail.formId) === "payment_requests_new") {
    accepted.add("payment_request_new");
    accepted.add("staff_advance");
    accepted.add("staff_reimbursement");
  }
  if (!accepted.has(detail.formId)) {
    return { requestId: detail.requestId, ok: false, reason: "form_mismatch" };
  }
  try {
    target.apply(detail);
    return { requestId: detail.requestId, ok: true, reason: "applied" };
  } catch {
    return { requestId: detail.requestId, ok: false, reason: "error" };
  }
}

export function dispatchSafeWorkflowFill(
  detail: Omit<NovaSafeWorkflowFillDetail, "requestId"> & { requestId?: string }
): NovaSafeWorkflowFillResult {
  const requestId = detail.requestId ?? newRequestId();
  const full: NovaSafeWorkflowFillDetail = { ...detail, requestId };

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NOVA_SAFE_WORKFLOW_FILL_EVENT, { detail: full })
    );
  }

  return applyFromMap(full);
}

export function normalizeSafeWorkflowPathname(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed || "/";
}

export function isOnSafeWorkflowForm(
  pathname: string,
  formId: NovaSafeWorkflowFormId
): boolean {
  return normalizeSafeWorkflowPathname(pathname) === safeWorkflowFormPath(formId);
}

/**
 * If the user is already on the matching create form and a subscriber is live,
 * apply prefill in-place (same tab) instead of navigating.
 */
export function trySameTabSafeWorkflowFill(opts: {
  href: string;
  pathname: string;
  source?: NovaSafeWorkflowFillDetail["source"];
}): NovaSafeWorkflowFillResult & { parsed?: ParsedNovaSafeWorkflowHref } {
  const parsed = parseNovaSafeWorkflowHref(opts.href);
  if (!parsed) {
    return { requestId: newRequestId(), ok: false, reason: "form_mismatch" };
  }
  if (!isOnSafeWorkflowForm(opts.pathname, parsed.formId)) {
    return {
      requestId: newRequestId(),
      ok: false,
      reason: "not_on_form",
      parsed,
    };
  }
  if (!hasSafeWorkflowFillSubscriber(parsed.formId)) {
    return {
      requestId: newRequestId(),
      ok: false,
      reason: "no_subscriber",
      parsed,
    };
  }
  const result = dispatchSafeWorkflowFill({
    formId: parsed.formId,
    fields: parsed.fields,
    href: parsed.href,
    source: opts.source ?? "chat_link",
  });
  return { ...result, parsed };
}

/** Test helper — clear subscribers between unit tests. */
export function __resetSafeWorkflowFillTargetsForTests() {
  targets.clear();
}
