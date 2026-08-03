/**
 * NOVA Reader intent ACL — shared by page Assist and chat/paperclip.
 * Preview OCR returns money fields; gate must match Assist create (not bare *.read).
 * Staff money-hide / POL-1: invoice.read alone must not unlock chat OCR amounts.
 */

import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";

export type NovaReaderIntent =
  | "preview"
  | "purchase_bill"
  | "receipt"
  | "payment_request"
  | "sales_invoice"
  | "sales_order"
  | "purchase_order"
  | "manual_expense";

function canManualExpenseAssist(user: SessionUser): boolean {
  // Mirrors createManualExpense / page Assist intent "manual_expense".
  const roleOk =
    user.role === "ADMIN" ||
    user.role === "ACCOUNTANT" ||
    user.role === "SUPER_ADMIN";
  return can(user, "accounts.dashboard.read") && roleOk;
}

/**
 * True when the user may run any Assist money-doc intent (create/write gates).
 * Used for chat `preview` — OCR returns amounts; *.read alone is insufficient.
 */
export function canNovaReaderAssistMoneyDoc(user: SessionUser): boolean {
  return (
    can(user, "purchasebill.create") ||
    can(user, "receipt.create") ||
    can(user, "paymentrequest.create") ||
    can(user, "invoice.create") ||
    can(user, "salesorder.write") ||
    can(user, "purchaseorder.create") ||
    canManualExpenseAssist(user)
  );
}

/**
 * Intent ACL mirrors upload surfaces (PB / receipt / PR / billing create) and, for
 * chat preview, the same Assist create/write OR-set — not module *.read alone.
 */
export function assertNovaReaderIntentAccess(
  user: SessionUser,
  intent: NovaReaderIntent
): { ok: true } | { ok: false; message: string } {
  if (intent === "purchase_bill") {
    if (!can(user, "purchasebill.create")) {
      return { ok: false, message: "You do not have permission to create purchase bills." };
    }
    return { ok: true };
  }
  if (intent === "receipt") {
    if (!can(user, "receipt.create")) {
      return { ok: false, message: "You do not have permission to create receipts." };
    }
    return { ok: true };
  }
  if (intent === "payment_request") {
    if (!can(user, "paymentrequest.create")) {
      return { ok: false, message: "You do not have permission to create payment requests." };
    }
    return { ok: true };
  }
  if (intent === "sales_invoice") {
    if (!can(user, "invoice.create")) {
      return { ok: false, message: "You do not have permission to create billing documents." };
    }
    return { ok: true };
  }
  if (intent === "sales_order") {
    if (!can(user, "salesorder.write")) {
      return { ok: false, message: "You do not have permission to create sales orders." };
    }
    return { ok: true };
  }
  if (intent === "purchase_order") {
    if (!can(user, "purchaseorder.create")) {
      return { ok: false, message: "You do not have permission to create purchase orders." };
    }
    return { ok: true };
  }
  if (intent === "manual_expense") {
    if (!canManualExpenseAssist(user)) {
      return {
        ok: false,
        message: "You do not have permission to create manual expenses.",
      };
    }
    return { ok: true };
  }

  // intent === "preview" (chat / paperclip when not on a fillable Assist page)
  if (!canNovaReaderAssistMoneyDoc(user)) {
    return {
      ok: false,
      message:
        "You do not have permission to read documents with NOVA Reader.",
    };
  }
  return { ok: true };
}
