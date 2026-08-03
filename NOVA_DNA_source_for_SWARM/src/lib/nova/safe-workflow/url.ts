/**
 * Canonical prefill URL builder for NOVA safe workflow open.
 * Query params hydrate form defaults only — never auto-submit.
 */

import {
  formIdFromSafeWorkflowHrefPath,
  safeWorkflowFormPath,
  type NovaSafeWorkflowFormId,
} from "@/lib/nova/safe-workflow/map";

function normalizePrefillPathname(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed || "/";
}

export type NovaWorkflowPrefillParams = {
  formId?: NovaSafeWorkflowFormId;
  type?: string;
  /** Internal vendor cuid or vendorId code */
  vendor?: string;
  amount?: number | null;
  purpose?: string;
  project?: string;
  projectId?: string;
  bill?: string;
  item?: string;
  title?: string;
  assignee?: string;
  leaveTypeId?: string;
  fromDate?: string;
  toDate?: string;
  halfDayType?: string;
  reason?: string;
  date?: string;
  requestType?: string;
};

export type ParsedNovaSafeWorkflowHref = {
  formId: NovaSafeWorkflowFormId;
  href: string;
  fields: Record<string, string>;
};

/** Parse / validate amount from URL or utterance; invalid → undefined (omit). */
export function parseNovaWorkflowPrefillAmount(
  raw: string | null | undefined
): number | undefined {
  if (raw == null) return undefined;
  const cleaned = String(raw).replace(/,/g, "").trim();
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  if (n > 1e12) return undefined;
  return Math.round(n * 100) / 100;
}

export function formatNovaWorkflowAmountInr(amount: number): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `₹${amount}`;
  }
}

function paymentFormIdFromType(type?: string | null): NovaSafeWorkflowFormId {
  const t = (type ?? "").trim().toUpperCase();
  if (t === "STAFF_ADVANCE") return "staff_advance";
  if (t === "STAFF_EXPENSE_REIMBURSEMENT") return "staff_reimbursement";
  return "payment_request_new";
}

/**
 * Build safe-workflow prefill URL for the target create form.
 * Drops invalid amount; never invents vendor id.
 */
export function buildNovaWorkflowPrefillUrl(
  params: NovaWorkflowPrefillParams
): string {
  const formId =
    params.formId ??
    (params.type ? paymentFormIdFromType(params.type) : "payment_request_new");
  const base = safeWorkflowFormPath(formId);
  const qs = new URLSearchParams();
  qs.set("nova_prefill", "1");

  if (params.type?.trim()) qs.set("type", params.type.trim());
  if (params.vendor?.trim()) qs.set("vendor", params.vendor.trim());

  const amount = parseNovaWorkflowPrefillAmount(
    params.amount != null ? String(params.amount) : undefined
  );
  if (amount != null) {
    qs.set("amount", String(amount));
  }

  if (params.purpose?.trim()) {
    qs.set("purpose", params.purpose.trim().slice(0, 200));
  }
  if (params.project?.trim()) qs.set("project", params.project.trim());
  if (params.projectId?.trim()) qs.set("projectId", params.projectId.trim());
  if (params.bill?.trim()) qs.set("bill", params.bill.trim());
  if (params.item?.trim()) qs.set("item", params.item.trim().slice(0, 200));
  if (params.title?.trim()) qs.set("title", params.title.trim().slice(0, 200));
  if (params.assignee?.trim()) qs.set("assignee", params.assignee.trim());
  if (params.leaveTypeId?.trim()) qs.set("leaveTypeId", params.leaveTypeId.trim());
  if (params.fromDate?.trim()) qs.set("fromDate", params.fromDate.trim());
  if (params.toDate?.trim()) qs.set("toDate", params.toDate.trim());
  if (params.halfDayType?.trim()) qs.set("halfDayType", params.halfDayType.trim());
  if (params.reason?.trim()) qs.set("reason", params.reason.trim().slice(0, 200));
  if (params.date?.trim()) qs.set("date", params.date.trim());
  if (params.requestType?.trim()) qs.set("requestType", params.requestType.trim());

  return `${base}?${qs.toString()}`;
}

export function isNovaSafeWorkflowPrefillHref(href: string): boolean {
  return parseNovaSafeWorkflowHref(href) != null;
}

export function parseNovaSafeWorkflowHref(
  href: string
): ParsedNovaSafeWorkflowHref | null {
  try {
    const url = new URL(href, "http://local");
    const path = normalizePrefillPathname(url.pathname);
    const baseFormId = formIdFromSafeWorkflowHrefPath(path);
    if (!baseFormId) return null;

    const novaPrefill = url.searchParams.get("nova_prefill");
    if (novaPrefill !== "1" && novaPrefill !== "true") return null;

    const type = url.searchParams.get("type")?.trim();
    let formId = baseFormId;
    if (path === "/payment-requests/new") {
      formId = paymentFormIdFromType(type);
    }

    const fields: Record<string, string> = {};
    if (type) fields.type = type;
    for (const key of [
      "vendor",
      "amount",
      "purpose",
      "project",
      "projectId",
      "bill",
      "item",
      "title",
      "assignee",
      "leaveTypeId",
      "fromDate",
      "toDate",
      "halfDayType",
      "reason",
      "date",
      "requestType",
    ] as const) {
      const value = url.searchParams.get(key)?.trim();
      if (value) fields[key] = value;
    }

    return {
      formId,
      href: `${path}?${url.searchParams.toString()}`,
      fields,
    };
  } catch {
    return null;
  }
}
