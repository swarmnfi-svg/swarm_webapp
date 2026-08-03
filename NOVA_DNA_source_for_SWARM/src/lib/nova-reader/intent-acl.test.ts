/**
 * N10 / NOVA-R1: chat paperclip preview must not OCR money via *.read alone.
 * Same Assist create/write gates as page embeds (invoice.create etc.).
 */
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import {
  assertNovaReaderIntentAccess,
  canNovaReaderAssistMoneyDoc,
} from "@/lib/nova-reader/intent-acl";

function user(partial: Partial<SessionUser> & Pick<SessionUser, "role">): SessionUser {
  return {
    id: "u1",
    email: "a@b.c",
    name: "Test",
    role: partial.role,
    permissions: partial.permissions ?? [],
    grantedPermissions: partial.grantedPermissions ?? [],
    canSeeProjectValue: false,
    canSeeVendorBank: false,
    ...partial,
  } as SessionUser;
}

describe("NOVA Reader intent ACL (N10 chat preview)", () => {
  it("denies Director with invoice.read (no Assist create) on preview — chat OCR money-hide", () => {
    const director = user({ role: "DIRECTOR", grantedPermissions: [] });
    expect(can(director, "invoice.read")).toBe(true);
    expect(can(director, "invoice.create")).toBe(false);
    expect(canNovaReaderAssistMoneyDoc(director)).toBe(false);
    const res = assertNovaReaderIntentAccess(director, "preview");
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.message).toMatch(/permission/i);
    }
  });

  it("Staff with invoice.read grant still cannot use sales_invoice Assist; preview only via PB/PR create floor", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: ["invoice.read"],
    });
    expect(can(staff, "invoice.read")).toBe(true);
    expect(can(staff, "invoice.create")).toBe(false);
    expect(assertNovaReaderIntentAccess(staff, "sales_invoice").ok).toBe(false);
    // Role Assist creates (purchasebill / paymentrequest) — not invoice.read
    expect(can(staff, "purchasebill.create")).toBe(true);
    expect(assertNovaReaderIntentAccess(staff, "preview").ok).toBe(true);
  });

  it("allows Accountant on preview via manual_expense Assist gate (not invoice.read)", () => {
    const acct = user({ role: "ACCOUNTANT", grantedPermissions: [] });
    expect(can(acct, "invoice.read")).toBe(true);
    expect(can(acct, "invoice.create")).toBe(false);
    expect(assertNovaReaderIntentAccess(acct, "preview").ok).toBe(true);
    expect(assertNovaReaderIntentAccess(acct, "sales_invoice").ok).toBe(false);
  });

  it("sales_invoice intent requires invoice.create, not invoice.read", () => {
    const director = user({ role: "DIRECTOR", grantedPermissions: [] });
    expect(assertNovaReaderIntentAccess(director, "sales_invoice").ok).toBe(false);

    const creator = user({
      role: "MANAGER",
      grantedPermissions: [],
    });
    expect(can(creator, "invoice.create")).toBe(true);
    expect(assertNovaReaderIntentAccess(creator, "sales_invoice").ok).toBe(true);
    expect(assertNovaReaderIntentAccess(creator, "preview").ok).toBe(true);
  });

  it("Accountant with invoice.create grant may use sales_invoice Assist", () => {
    const acct = user({
      role: "ACCOUNTANT",
      grantedPermissions: ["invoice.create"],
    });
    expect(assertNovaReaderIntentAccess(acct, "sales_invoice").ok).toBe(true);
  });

  it("Staff with only accounts.dashboard.read grant cannot preview via manual_expense role gate", () => {
    // STAFF matrix still has PB/PR create — deny path is covered by Director above.
    // Isolate manual_expense role: Director has dashboard.read but not ACCOUNTANT.
    const director = user({
      role: "DIRECTOR",
      grantedPermissions: [],
    });
    expect(can(director, "accounts.dashboard.read")).toBe(true);
    expect(assertNovaReaderIntentAccess(director, "manual_expense").ok).toBe(false);
    expect(assertNovaReaderIntentAccess(director, "preview").ok).toBe(false);
  });

  it("Director read-only: purchase_bill / receipt / payment_request require create", () => {
    const director = user({ role: "DIRECTOR", grantedPermissions: [] });
    expect(can(director, "purchasebill.read")).toBe(true);
    expect(assertNovaReaderIntentAccess(director, "purchase_bill").ok).toBe(false);
    expect(assertNovaReaderIntentAccess(director, "receipt").ok).toBe(false);
    expect(assertNovaReaderIntentAccess(director, "payment_request").ok).toBe(false);
  });
});
