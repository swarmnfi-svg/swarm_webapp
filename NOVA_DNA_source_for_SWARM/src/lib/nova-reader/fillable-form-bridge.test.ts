import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  fillPromptCopy,
  matchPostNavigateFillTarget,
  resolveFillableForm,
  resolveOpenModuleByHref,
  selectChatReaderIntent,
  suggestOpenModulesForKind,
} from "@/lib/nova-reader/fillable-form-registry";
import {
  __resetFillTargetsForTests,
  dispatchFillRequest,
  hasFillSubscriber,
  subscribeFillTarget,
  type NovaReaderFillDraft,
} from "@/lib/nova-reader/form-fill-bridge";

describe("fillable-form-registry", () => {
  it("resolves create routes to intents", () => {
    expect(resolveFillableForm("/billing/new")?.intent).toBe("sales_invoice");
    expect(resolveFillableForm("/billing/new/")?.id).toBe("billing_new");
    expect(resolveFillableForm("/sales-orders/new")?.intent).toBe("sales_order");
    expect(resolveFillableForm("/purchase-orders/new")?.intent).toBe("purchase_order");
    expect(resolveFillableForm("/purchase-bills/new")?.intent).toBe("purchase_bill");
    expect(resolveFillableForm("/receipts/new")?.intent).toBe("receipt");
    expect(resolveFillableForm("/payment-requests/new")?.intent).toBe("payment_request");
    expect(resolveFillableForm("/accounts/expenses/new")?.intent).toBe("manual_expense");
    expect(resolveFillableForm("/accounts/expenses/new/")?.id).toBe("manual_expense_new");
  });

  it("resolves billing edit drafts", () => {
    const edit = resolveFillableForm("/billing/abc123/edit");
    expect(edit?.id).toBe("billing_edit");
    expect(edit?.intent).toBe("sales_invoice");
    expect(edit?.title).toMatch(/Edit/i);
  });

  it("returns null for non-fillable pages", () => {
    expect(resolveFillableForm("/")).toBeNull();
    expect(resolveFillableForm("/billing")).toBeNull();
    expect(resolveFillableForm("/billing/abc123")).toBeNull();
    expect(resolveFillableForm("/ai-assistant")).toBeNull();
    expect(resolveFillableForm("/purchase-bills")).toBeNull();
    expect(resolveFillableForm("/customers/new")).toBeNull();
  });

  it("selectChatReaderIntent uses page intent or preview", () => {
    expect(selectChatReaderIntent("/billing/new")).toBe("sales_invoice");
    expect(selectChatReaderIntent("/dashboard")).toBe("preview");
    expect(selectChatReaderIntent("/receipts/new")).toBe("receipt");
    expect(selectChatReaderIntent("/accounts/expenses/new")).toBe("manual_expense");
  });

  it("suggestOpenModulesForKind ranks by document kind", () => {
    const receipt = suggestOpenModulesForKind("receipt");
    expect(receipt.some((m) => m.intent === "receipt")).toBe(true);
    const tax = suggestOpenModulesForKind("tax_invoice");
    expect(tax[0]?.intent).toBe("purchase_bill");
    const expense = suggestOpenModulesForKind("expense");
    expect(expense[0]?.intent).toBe("manual_expense");
    expect(expense.some((m) => m.intent === "payment_request")).toBe(true);
  });

  it("resolveOpenModuleByHref maps create URLs", () => {
    expect(resolveOpenModuleByHref("/accounts/expenses/new")?.intent).toBe(
      "manual_expense"
    );
    expect(resolveOpenModuleByHref("/billing/new/")?.id).toBe("billing_new");
    expect(resolveOpenModuleByHref("/dashboard")).toBeNull();
  });

  it("matchPostNavigateFillTarget requires matching form id", () => {
    expect(
      matchPostNavigateFillTarget({
        pathname: "/accounts/expenses/new",
        targetFormId: "manual_expense_new",
      })?.intent
    ).toBe("manual_expense");
    expect(
      matchPostNavigateFillTarget({
        pathname: "/accounts/expenses/new",
        targetFormId: "billing_new",
      })
    ).toBeNull();
    expect(
      matchPostNavigateFillTarget({
        pathname: "/dashboard",
        targetFormId: "manual_expense_new",
      })
    ).toBeNull();
  });

  it("fillPromptCopy soft-warns PO on billing", () => {
    const copy = fillPromptCopy({
      formTitle: "New Billing Document",
      documentKind: "purchase_order",
      intent: "sales_invoice",
    });
    expect(copy).toMatch(/purchase order/i);
    expect(copy).toMatch(/New Billing Document/);
  });
});

describe("form-fill-bridge", () => {
  beforeEach(() => {
    __resetFillTargetsForTests();
  });

  afterEach(() => {
    __resetFillTargetsForTests();
  });

  const sampleDraft = {
    matchedCustomerId: "c1",
    customerGstin: null,
    invoiceDate: "2026-07-01",
    dueDate: null,
    placeOfSupply: null,
    lineItems: [],
  } as unknown as NovaReaderFillDraft;

  const emptyFields = {
    documentKind: null,
    vendorName: null,
    vendorGstin: null,
    buyerName: null,
    buyerGstin: null,
    documentNumber: null,
    documentDate: null,
    dueDate: null,
    subtotal: null,
    cgst: null,
    sgst: null,
    igst: null,
    gstAmount: null,
    totalAmount: null,
    currency: null,
    tdsApplicable: null,
    tdsAmount: null,
    rcmApplicable: null,
    lineItems: [],
  };

  it("returns no_subscriber when nothing is registered", async () => {
    const result = await dispatchFillRequest(
      {
        formId: "billing_new",
        intent: "sales_invoice",
        draft: sampleDraft,
        fields: emptyFields,
        source: "chat_bubble",
      },
      { timeoutMs: 80, retryMs: 20 }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("no_subscriber");
  });

  it("applies once on happy path", async () => {
    const apply = vi.fn();
    const unsub = subscribeFillTarget({
      formId: "billing_new",
      intent: "sales_invoice",
      apply,
    });
    expect(hasFillSubscriber("billing_new", "sales_invoice")).toBe(true);

    const result = await dispatchFillRequest({
      formId: "billing_new",
      intent: "sales_invoice",
      draft: sampleDraft,
      fields: emptyFields,
      source: "chat_bubble",
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBe("applied");
    expect(apply).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("rejects intent mismatch", async () => {
    const apply = vi.fn();
    const unsub = subscribeFillTarget({
      formId: "billing_new",
      intent: "sales_invoice",
      apply,
    });
    const result = await dispatchFillRequest({
      formId: "billing_new",
      intent: "purchase_bill",
      draft: sampleDraft,
      fields: emptyFields,
      source: "chat_bubble",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("intent_mismatch");
    expect(apply).not.toHaveBeenCalled();
    unsub();
  });
});
