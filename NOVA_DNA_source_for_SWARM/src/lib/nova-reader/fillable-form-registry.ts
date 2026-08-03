/**
 * Client-only registry: App Router path → fillable form metadata for NOVA chat bubble.
 * Server ACL in read-action remains the source of truth; permissionHint is UX only.
 */

import type { NovaReaderIntent } from "@/lib/nova-reader/intent-acl";
// Type-only import — keep this module client-safe (no server action runtime).

export type FillableFormIntent = Exclude<NovaReaderIntent, "preview">;

export type FillableFormContext = {
  id: string;
  intent: FillableFormIntent;
  title: string;
  href: string;
  /** Client hint only — server intent-acl assertNovaReaderIntentAccess is authoritative. */
  permissionHint?: string;
  documentKindsPreferred?: string[];
};

type FillableFormDef = {
  id: string;
  match: (pathname: string) => boolean;
  intent: FillableFormIntent;
  title: (pathname: string) => string;
  href: string;
  permissionHint?: string;
  documentKindsPreferred?: string[];
};

const BILLING_EDIT_RE = /^\/billing\/[^/]+\/edit\/?$/;

const FILLABLE_FORM_DEFS: FillableFormDef[] = [
  {
    id: "billing_new",
    match: (p) => p === "/billing/new" || p === "/billing/new/",
    intent: "sales_invoice",
    title: () => "New Billing Document",
    href: "/billing/new",
    permissionHint: "invoice.create",
    documentKindsPreferred: ["tax_invoice", "purchase_order", "other"],
  },
  {
    id: "billing_edit",
    match: (p) => BILLING_EDIT_RE.test(p),
    intent: "sales_invoice",
    title: () => "Edit Billing Document",
    href: "/billing/new",
    permissionHint: "invoice.create",
    documentKindsPreferred: ["tax_invoice", "purchase_order", "other"],
  },
  {
    id: "sales_order_new",
    match: (p) => p === "/sales-orders/new" || p === "/sales-orders/new/",
    intent: "sales_order",
    title: () => "New Sales Order",
    href: "/sales-orders/new",
    permissionHint: "salesorder.write",
    documentKindsPreferred: ["purchase_order", "tax_invoice", "other"],
  },
  {
    id: "purchase_order_new",
    match: (p) => p === "/purchase-orders/new" || p === "/purchase-orders/new/",
    intent: "purchase_order",
    title: () => "New Purchase Order",
    href: "/purchase-orders/new",
    permissionHint: "purchaseorder.create",
    documentKindsPreferred: ["purchase_order", "tax_invoice", "other"],
  },
  {
    id: "purchase_bill_new",
    match: (p) => p === "/purchase-bills/new" || p === "/purchase-bills/new/",
    intent: "purchase_bill",
    title: () => "New Purchase Bill",
    href: "/purchase-bills/new",
    permissionHint: "purchasebill.create",
    documentKindsPreferred: ["tax_invoice", "other"],
  },
  {
    id: "receipt_new",
    match: (p) => p === "/receipts/new" || p === "/receipts/new/",
    intent: "receipt",
    title: () => "New Receipt",
    href: "/receipts/new",
    permissionHint: "receipt.create",
    documentKindsPreferred: ["receipt", "other"],
  },
  {
    id: "payment_request_new",
    match: (p) =>
      p === "/payment-requests/new" || p.startsWith("/payment-requests/new/"),
    intent: "payment_request",
    title: () => "New Payment Request",
    href: "/payment-requests/new",
    permissionHint: "paymentrequest.create",
    documentKindsPreferred: ["tax_invoice", "expense", "receipt", "other"],
  },
  {
    id: "manual_expense_new",
    match: (p) =>
      p === "/accounts/expenses/new" || p === "/accounts/expenses/new/",
    intent: "manual_expense",
    title: () => "New Manual Expense",
    href: "/accounts/expenses/new",
    permissionHint: "accounts.dashboard.read",
    documentKindsPreferred: ["expense", "receipt", "tax_invoice", "other"],
  },
];

/** Canonical create URLs for “Open module” chips (one per intent). */
const OPEN_MODULE_BY_INTENT: FillableFormContext[] = [
  {
    id: "billing_new",
    intent: "sales_invoice",
    title: "New Billing Document",
    href: "/billing/new",
    permissionHint: "invoice.create",
    documentKindsPreferred: ["tax_invoice", "purchase_order", "other"],
  },
  {
    id: "sales_order_new",
    intent: "sales_order",
    title: "New Sales Order",
    href: "/sales-orders/new",
    permissionHint: "salesorder.write",
    documentKindsPreferred: ["purchase_order", "tax_invoice", "other"],
  },
  {
    id: "purchase_order_new",
    intent: "purchase_order",
    title: "New Purchase Order",
    href: "/purchase-orders/new",
    permissionHint: "purchaseorder.create",
    documentKindsPreferred: ["purchase_order", "tax_invoice", "other"],
  },
  {
    id: "purchase_bill_new",
    intent: "purchase_bill",
    title: "New Purchase Bill",
    href: "/purchase-bills/new",
    permissionHint: "purchasebill.create",
    documentKindsPreferred: ["tax_invoice", "other"],
  },
  {
    id: "receipt_new",
    intent: "receipt",
    title: "New Receipt",
    href: "/receipts/new",
    permissionHint: "receipt.create",
    documentKindsPreferred: ["receipt", "other"],
  },
  {
    id: "payment_request_new",
    intent: "payment_request",
    title: "New Payment Request",
    href: "/payment-requests/new",
    permissionHint: "paymentrequest.create",
    documentKindsPreferred: ["tax_invoice", "expense", "receipt", "other"],
  },
  {
    id: "manual_expense_new",
    intent: "manual_expense",
    title: "New Manual Expense",
    href: "/accounts/expenses/new",
    permissionHint: "accounts.dashboard.read",
    documentKindsPreferred: ["expense", "receipt", "tax_invoice", "other"],
  },
];

function normalizePathname(pathname: string): string {
  if (!pathname) return "/";
  const trimmed = pathname.split("?")[0]?.split("#")[0] ?? pathname;
  if (trimmed.length > 1 && trimmed.endsWith("/")) return trimmed.slice(0, -1);
  return trimmed || "/";
}

/** Resolve fillable form for current pathname, if any. */
export function resolveFillableForm(pathname: string): FillableFormContext | null {
  const path = normalizePathname(pathname);
  for (const def of FILLABLE_FORM_DEFS) {
    if (!def.match(path)) continue;
    return {
      id: def.id,
      intent: def.intent,
      title: def.title(path),
      href: def.href,
      permissionHint: def.permissionHint,
      documentKindsPreferred: def.documentKindsPreferred,
    };
  }
  return null;
}

/**
 * Resolve an “Open module” chip href to fill metadata (for post-navigate fill).
 * Prefers live route match, then canonical open-module list.
 */
export function resolveOpenModuleByHref(href: string): FillableFormContext | null {
  const path = normalizePathname(href);
  const fromRoute = resolveFillableForm(path);
  if (fromRoute) return fromRoute;
  return OPEN_MODULE_BY_INTENT.find((m) => normalizePathname(m.href) === path) ?? null;
}

/**
 * After an Open-module navigation, return the live form when it matches the
 * armed target (subscriber handshake gate — chat still waits for apply).
 */
export function matchPostNavigateFillTarget(opts: {
  pathname: string;
  targetFormId: string | null | undefined;
}): FillableFormContext | null {
  if (!opts.targetFormId) return null;
  const live = resolveFillableForm(opts.pathname);
  if (!live || live.id !== opts.targetFormId) return null;
  return live;
}

/**
 * Intent for chat/bubble paperclip reads.
 * On a fillable page → page intent (so server returns a mapped draft).
 * Otherwise → preview (structured fields only).
 */
export function selectChatReaderIntent(pathname: string): NovaReaderIntent {
  return resolveFillableForm(pathname)?.intent ?? "preview";
}

/**
 * Kind-aware “Open module” suggestions when not on a fillable form.
 * Falls back to common money-doc creates when kind is unknown.
 */
export function suggestOpenModulesForKind(
  documentKind: string | null | undefined
): FillableFormContext[] {
  const kind = (documentKind ?? "").trim().toLowerCase() || null;
  if (!kind || kind === "other") {
    return [
      OPEN_MODULE_BY_INTENT.find((m) => m.intent === "purchase_bill")!,
      OPEN_MODULE_BY_INTENT.find((m) => m.intent === "sales_invoice")!,
      OPEN_MODULE_BY_INTENT.find((m) => m.intent === "payment_request")!,
      OPEN_MODULE_BY_INTENT.find((m) => m.intent === "manual_expense")!,
    ];
  }

  /** Prefer typical create path for each kind (order matters). */
  const preferredIntentOrder: FillableFormIntent[] =
    kind === "tax_invoice"
      ? ["purchase_bill", "sales_invoice", "payment_request", "purchase_order"]
      : kind === "purchase_order"
        ? ["purchase_order", "sales_order", "sales_invoice", "purchase_bill"]
        : kind === "receipt"
          ? ["receipt", "manual_expense", "payment_request"]
          : kind === "expense"
            ? ["manual_expense", "payment_request", "purchase_bill"]
            : ["purchase_bill", "sales_invoice", "payment_request", "manual_expense"];

  const byIntent = new Map(OPEN_MODULE_BY_INTENT.map((m) => [m.intent, m]));
  const out: FillableFormContext[] = [];
  for (const intent of preferredIntentOrder) {
    const m = byIntent.get(intent);
    if (m) out.push(m);
  }
  return out.slice(0, 4);
}

/** Soft UX copy when page intent and detected kind look mismatched. */
export function fillPromptCopy(opts: {
  formTitle: string;
  documentKind: string | null | undefined;
  intent: FillableFormIntent;
}): string {
  const kind = (opts.documentKind ?? "").replace(/_/g, " ").trim();
  const kindBit = kind ? `Looks like a ${kind}. ` : "";
  if (
    opts.intent === "sales_invoice" &&
    (opts.documentKind === "purchase_order" || kind.includes("purchase order"))
  ) {
    return `${kindBit}You’re on **${opts.formTitle}**. Fill this form from these lines?`;
  }
  return `${kindBit}You’re on **${opts.formTitle}**. Fill this form from the read?`;
}
