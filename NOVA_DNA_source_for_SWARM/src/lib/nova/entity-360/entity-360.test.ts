/**
 * Entity 360 — identifier recognition, cross-module aggregation, RBAC scoping
 * (authorized vs unauthorized vendor bank/UPI), and money-guard/redaction.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let bankVisible = true;

vi.mock("@/lib/rbac", () => ({
  can: vi.fn(() => true),
}));

vi.mock("@/lib/payment-request-access", () => ({
  paymentRequestListWhereForUser: vi.fn(async () => ({})),
  canViewPaymentPostingDetails: vi.fn(() => true),
}));

vi.mock("@/lib/vendor-bank", () => ({
  canSeeVendorBankDetails: vi.fn(() => bankVisible),
}));

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    paymentRequest: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    bankAccount: { findUnique: vi.fn() },
    vendor: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import {
  recognizeEntity360Id,
  recognizeAllEntity360Ids,
  queryNamesEntity360,
} from "@/lib/nova/entity-360/recognize";
import { buildPaymentRequest360Fact } from "@/lib/nova/entity-360/payment-request-360";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { sanitizeNovaFactsForLlm } from "@/lib/ai/nova-llm-sanitize";
import { formatEntity360Fact } from "@/lib/ai/nova-format";
import type { SessionUser } from "@/auth";

const user = { id: "u1", role: "SUPER_ADMIN" } as SessionUser;

function mockPr(overrides: Record<string, unknown> = {}) {
  return {
    id: "pr_db_1",
    paymentRequestId: "C0028-P001-E002",
    status: "SUBMITTED",
    requestType: "VENDOR_PAYMENT",
    partyType: "VENDOR",
    amount: 184246,
    purpose: "Site material",
    expenseCategory: "Materials",
    urgency: "HIGH",
    gstApplicable: true,
    tdsApplicable: false,
    createdAt: new Date("2026-07-01T06:00:00Z"),
    paidAt: null,
    updatedAt: new Date("2026-07-10T06:00:00Z"),
    managerApprovalStatus: "PENDING",
    adminApprovalStatus: "PENDING",
    paymentStatus: "UNPAID",
    reconciliationStatus: "UNMATCHED",
    adminOverride: false,
    requestedBy: "u2",
    requestedForUserId: "u3",
    paidBy: null,
    bankAccountId: null,
    projectRef: "C0028-P001",
    paymentNarration: null,
    vendor: { id: "v1", vendorId: "V0007", vendorName: "Acme Supplies" },
    staff: null,
    project: { id: "p1", projectId: "C0028-P001", projectName: "Solar Plant" },
    purchaseBill: null,
    approvals: [
      { action: "SUBMITTED", createdAt: new Date("2026-07-01T06:05:00Z"), note: null },
    ],
    ...overrides,
  };
}

describe("recognizeEntity360Id", () => {
  it("recognises project-scoped payment request codes", () => {
    expect(recognizeEntity360Id("C0028-P001-E002")).toMatchObject({
      kind: "payment_request",
      id: "C0028-P001-E002",
    });
    expect(recognizeEntity360Id("who posted C0028-P001-VP001")).toMatchObject({
      kind: "payment_request",
      id: "C0028-P001-VP001",
    });
  });

  it("recognises non-project series payment request codes", () => {
    expect(recognizeEntity360Id("details of OTH/26-27/0011")).toMatchObject({
      kind: "payment_request",
      id: "OTH/26-27/0011",
    });
    expect(recognizeEntity360Id("ADV/26-27/0007")).toMatchObject({
      kind: "payment_request",
      id: "ADV/26-27/0007",
    });
  });

  it("does not treat project/customer codes or prose as a payment request", () => {
    expect(recognizeEntity360Id("C0028-P001")).toBeNull(); // project id
    expect(recognizeEntity360Id("C0028")).toBeNull(); // customer id
    expect(recognizeEntity360Id("show me july sales")).toBeNull();
    expect(queryNamesEntity360("pending payment requests")).toBe(false);
  });

  it("is case-insensitive and canonicalises to upper-case", () => {
    expect(recognizeEntity360Id("c0028-p001-e002")).toMatchObject({
      kind: "payment_request",
      id: "C0028-P001-E002",
      raw: "c0028-p001-e002",
    });
    expect(recognizeEntity360Id("oth/26-27/0011")).toMatchObject({
      id: "OTH/26-27/0011",
    });
  });

  it("tolerates surrounding text, punctuation, quotes, and whitespace", () => {
    expect(recognizeEntity360Id("who posted OTH/26-27/0011?")).toMatchObject({
      id: "OTH/26-27/0011",
    });
    expect(recognizeEntity360Id("details of C0028-P001-E002.")).toMatchObject({
      id: "C0028-P001-E002",
    });
    expect(recognizeEntity360Id("'C0028-P001-E002'")).toMatchObject({
      id: "C0028-P001-E002",
    });
    expect(recognizeEntity360Id("(OTH/26-27/0011),")).toMatchObject({
      id: "OTH/26-27/0011",
    });
    expect(recognizeEntity360Id("   C0028-P001-E002   ")).toMatchObject({
      id: "C0028-P001-E002",
    });
  });

  it("recognises every non-project series prefix", () => {
    for (const raw of [
      "ADV/26-27/0007",
      "ADVRET/26-27/0002",
      "EXP/26-27/0011",
      "REIM/26-27/0003",
      "SAL/26-27/0004",
      "SALPAY/26-27/0005",
      "TRF/26-27/0006",
      "DIR/26-27/0008",
      "OTH/26-27/0009",
      "MEXP/26-27/0010",
      "SET/26-27/0012",
    ]) {
      expect(recognizeEntity360Id(raw)).toMatchObject({
        kind: "payment_request",
        id: raw,
      });
    }
  });

  it("does not hijack look-alike codes (SO / PB / PR / MR / invoice / receipt / bank sms)", () => {
    expect(recognizeEntity360Id("C0028-P001-SO001")).toBeNull(); // sales order
    expect(recognizeEntity360Id("C0028-P001-PB003")).toBeNull(); // purchase bill
    expect(recognizeEntity360Id("C0028-P001-PR001")).toBeNull(); // purchase request
    expect(recognizeEntity360Id("C0028-P001-MR001")).toBeNull(); // material receipt
    expect(recognizeEntity360Id("BPG/26-27/SI/0001")).toBeNull(); // invoice number
    expect(recognizeEntity360Id("BPG/26-27/RCPT/0001")).toBeNull(); // receipt number
    expect(recognizeEntity360Id("BSMS/26-27/0001")).toBeNull(); // bank sms entry
    // Prefix embedded inside a bigger word is not a boundary match
    expect(recognizeEntity360Id("MYADV/26-27/0011")).toBeNull();
    // Trailing junk glued to the code must not produce a partial match
    expect(recognizeEntity360Id("C0028-P001-E002XYZ")).toBeNull();
  });

  it("returns the leftmost id deterministically regardless of pattern order", () => {
    // Series id appears first in the string → it wins even though the project
    // pattern is listed first in the recognition table.
    expect(recognizeEntity360Id("compare OTH/26-27/0011 vs C0028-P001-E002")).toMatchObject({
      id: "OTH/26-27/0011",
    });
    expect(recognizeEntity360Id("C0028-P001-E002 and then OTH/26-27/0011")).toMatchObject({
      id: "C0028-P001-E002",
    });
  });

  it("recognises multiple distinct ids in appearance order and de-dupes", () => {
    const ids = recognizeAllEntity360Ids(
      "reconcile OTH/26-27/0011 with C0028-P001-E002 and again oth/26-27/0011"
    );
    expect(ids.map((r) => r.id)).toEqual(["OTH/26-27/0011", "C0028-P001-E002"]);
  });

  it("is ReDoS-safe on long adversarial input", () => {
    const evil = `${"C0028-P001-".repeat(4000)}E`; // never completes a valid tail
    const start = Date.now();
    expect(recognizeEntity360Id(evil)).toBeNull();
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("selectNovaTools routing", () => {
  it("routes a specific payment request code to entity_360", () => {
    expect(selectNovaTools("C0028-P001-E002")).toEqual(["entity_360"]);
    expect(selectNovaTools("who posted OTH/26-27/0011")).toEqual(["entity_360"]);
    expect(selectNovaTools("c0028-p001-e002 details please")).toEqual(["entity_360"]);
  });

  it("does not route look-alike codes (project / sales order / invoice) to entity_360", () => {
    expect(selectNovaTools("C0028-P001-SO001")).not.toEqual(["entity_360"]);
    expect(selectNovaTools("BPG/26-27/SI/0001")).not.toEqual(["entity_360"]);
    expect(selectNovaTools("pending payment requests")).not.toEqual(["entity_360"]);
  });
});

describe("buildPaymentRequest360Fact", () => {
  beforeEach(() => {
    bankVisible = true;
    vi.clearAllMocks();
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      { id: "u2", name: "Ravi Kumar", staffProfile: { fullName: "Ravi Kumar", staffCode: "STF0002" } },
      { id: "u3", name: "Sana Ali", staffProfile: { fullName: "Sana Ali", staffCode: "STF0003" } },
    ] as never);
    vi.mocked(prisma.bankAccount.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.vendor.findUnique).mockResolvedValue({
      bankAccountName: "Acme Supplies",
      bankAccountNumber: "1234567890",
      ifsc: "HDFC0001234",
      upiId: "acme@upi",
    } as never);
  });

  it("aggregates cross-module facts with actionable next steps", async () => {
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(mockPr() as never);

    const res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    const d = res.fact.data as Record<string, unknown>;

    expect(res.fact.ok).toBe(true);
    expect(d.identifier).toBe("C0028-P001-E002");
    expect(d.amountInr).toMatch(/1,84,246/);
    expect((d.party as Record<string, unknown>).name).toBe("Acme Supplies");
    expect((d.project as Record<string, unknown>).name).toBe("Solar Plant");
    expect(d.createdByName).toContain("Ravi Kumar");
    expect(d.createdForName).toContain("Sana Ali");
    expect((d.approvals as Record<string, unknown>).manager).toBe("PENDING");
    expect((d.nextActions as string[]).join(" ")).toMatch(/manager verification/i);
    // Authorized role: full beneficiary details present
    expect(d.bankDetailsVisible).toBe(true);
    const bank = d.vendorPaymentDetails as Record<string, unknown>;
    expect(bank.visible).toBe(true);
    expect(bank.vendorUpiId).toBe("acme@upi");
    expect(bank.vendorBankAccountNumber).toBe("1234567890");
  });

  it("hides vendor bank/UPI details for unauthorized roles", async () => {
    bankVisible = false;
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(mockPr() as never);

    const res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    const d = res.fact.data as Record<string, unknown>;

    expect(d.bankDetailsVisible).toBe(false);
    const bank = d.vendorPaymentDetails as Record<string, unknown>;
    expect(bank.visible).toBe(false);
    expect(bank.vendorUpiId).toBeUndefined();
    expect(bank.vendorBankAccountNumber).toBeUndefined();
    // Never even query vendor bank columns when unauthorized
    expect(vi.mocked(prisma.vendor.findUnique)).not.toHaveBeenCalled();
  });

  it("does not disclose records outside the caller's scope", async () => {
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(null as never);
    const res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    const d = res.fact.data as Record<string, unknown>;
    expect(res.fact.ok).toBe(true);
    expect(d.notFound).toBe(true);
    expect(String(d.message)).toMatch(/visible to you/i);
  });

  it("denies when the user lacks payment request permissions", async () => {
    const { can } = await import("@/lib/rbac");
    vi.mocked(can).mockReturnValueOnce(false).mockReturnValueOnce(false);
    const res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    expect(res.fact.ok).toBe(false);
    expect(res.fact.denied).toBe(true);
  });

  it("not-found message does not leak whether the record exists", async () => {
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(null as never);
    const res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    const d = res.fact.data as Record<string, unknown>;
    const msg = String(d.message);
    // Same wording whether it truly doesn't exist or is simply out of scope.
    expect(msg).toMatch(/visible to you/i);
    expect(msg).not.toMatch(/exists|deleted|another user|forbidden/i);
  });

  it("payer bank is only loaded + shown with payment-posting permission", async () => {
    const { canViewPaymentPostingDetails } = await import("@/lib/payment-request-access");
    vi.mocked(prisma.bankAccount.findUnique).mockResolvedValue({
      bankAccountId: "BANK-01",
      bankName: "HDFC",
      accountNickname: "Ops",
    } as never);
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(
      mockPr({ status: "PAID", paymentStatus: "PAID", bankAccountId: "bank_db_1", paidBy: "u2" }) as never
    );

    // Not authorised for posting details → payer bank never queried.
    vi.mocked(canViewPaymentPostingDetails).mockReturnValue(false);
    let res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    let d = res.fact.data as Record<string, unknown>;
    expect(d.paidFromBankLabel).toBeNull();
    expect(vi.mocked(prisma.bankAccount.findUnique)).not.toHaveBeenCalled();

    // Authorised → payer bank label surfaces.
    vi.mocked(canViewPaymentPostingDetails).mockReturnValue(true);
    res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    d = res.fact.data as Record<string, unknown>;
    expect(d.paidFromBankLabel).toContain("BANK-01");
  });

  it("survives deleted creator / vendor / missing amount without crashing", async () => {
    // Creator id resolves to nobody; vendor row deleted; amount missing.
    vi.mocked(prisma.user.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.vendor.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(
      mockPr({ requestedBy: "ghost", requestedForUserId: null, amount: null }) as never
    );

    const res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    const d = res.fact.data as Record<string, unknown>;
    expect(res.fact.ok).toBe(true);
    expect(d.createdByName).toBeNull();
    expect(d.amount).toBeNull();
    expect(d.amountInr).toBeNull();
    // Vendor present on the PR but bank row gone → visible shell, null fields.
    const bank = d.vendorPaymentDetails as Record<string, unknown>;
    expect(bank.visible).toBe(true);
    expect(bank.vendorBankAccountNumber).toBeNull();
  });

  it("handles a party with neither vendor nor staff (partyLabel only)", async () => {
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(
      mockPr({ vendor: null, staff: null, partyLabel: "Petty cash", partyType: "OTHER" }) as never
    );
    const res = await buildPaymentRequest360Fact(user, "OTH/26-27/0011");
    const d = res.fact.data as Record<string, unknown>;
    const party = d.party as Record<string, unknown>;
    expect(party.type).toBe("other");
    expect(party.name).toBe("Petty cash");
    // No vendor → beneficiary block omitted entirely.
    expect(d.vendorPaymentDetails).toBeNull();
  });

  it("computes 'pending since N days' from epoch diff (timezone-independent)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-19T02:00:00Z"));
    vi.mocked(prisma.paymentRequest.findFirst).mockResolvedValue(
      mockPr({ status: "SUBMITTED", updatedAt: new Date("2026-07-10T23:30:00Z") }) as never
    );
    const res = await buildPaymentRequest360Fact(user, "C0028-P001-E002");
    const d = res.fact.data as Record<string, unknown>;
    expect(d.ageDays).toBe(8);
    expect((d.nextActions as string[]).join(" ")).toMatch(/8 days/);
    vi.useRealTimers();
  });
});

describe("money-guard / redaction", () => {
  it("strips vendor beneficiary details + narration before the LLM", () => {
    const fact = {
      tool: "entity_360",
      ok: true,
      data: {
        kind: "payment_request",
        identifier: "C0028-P001-E002",
        amountInr: "₹1,84,246.00",
        vendorPaymentDetails: {
          visible: true,
          vendorUpiId: "acme@upi",
          vendorBankAccountNumber: "1234567890",
          vendorIfsc: "HDFC0001234",
        },
        paymentNarration: "UTR 998877 to Acme",
      },
    };
    const [sanitized] = sanitizeNovaFactsForLlm([fact]);
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("acme@upi");
    expect(json).not.toContain("1234567890");
    expect(json).not.toContain("HDFC0001234");
    expect(json).not.toContain("998877");
    // Safe display fields still survive
    expect(json).toContain("C0028-P001-E002");
  });
});

describe("formatEntity360Fact", () => {
  it("shows UPI / account for authorized viewers", () => {
    const text = formatEntity360Fact({
      kind: "payment_request",
      identifier: "C0028-P001-E002",
      statusLabel: "Submitted — awaiting manager verification",
      status: "SUBMITTED",
      amountInr: "₹1,84,246.00",
      party: { type: "vendor", code: "V0007", name: "Acme Supplies" },
      approvals: { manager: "PENDING", admin: "PENDING", payment: "UNPAID", reconciliation: "UNMATCHED" },
      vendorPaymentDetails: {
        visible: true,
        vendorUpiId: "acme@upi",
        vendorBankAccountNumber: "1234567890",
        vendorIfsc: "HDFC0001234",
      },
      nextActions: ["Pending manager verification for 9 days."],
    });
    expect(text).toContain("acme@upi");
    expect(text).toContain("1234567890");
    expect(text).toMatch(/manager verification/i);
  });

  it("shows a masked note for unauthorized viewers", () => {
    const text = formatEntity360Fact({
      kind: "payment_request",
      identifier: "C0028-P001-E002",
      statusLabel: "Paid",
      status: "PAID",
      amountInr: "₹1,84,246.00",
      party: { type: "vendor", code: "V0007", name: "Acme Supplies" },
      approvals: { manager: "APPROVED", admin: "APPROVED", payment: "PAID", reconciliation: "MATCHED" },
      vendorPaymentDetails: { visible: false, note: "Vendor bank / UPI details are hidden for your role." },
      nextActions: [],
    });
    expect(text).toContain("hidden for your role");
    expect(text).not.toContain("acme@upi");
  });

  it("omits the amount line when amount is missing", () => {
    const text = formatEntity360Fact({
      kind: "payment_request",
      identifier: "OTH/26-27/0011",
      statusLabel: "Draft",
      status: "DRAFT",
      amountInr: null,
      party: { type: "other", name: "Petty cash" },
      approvals: { manager: "PENDING", admin: "PENDING", payment: "UNPAID", reconciliation: "UNMATCHED" },
      nextActions: [],
    });
    expect(text).not.toMatch(/\*\*Amount:\*\*/);
    expect(text).toContain("Petty cash");
  });

  it("renders the paid-from bank when authorised", () => {
    const text = formatEntity360Fact({
      kind: "payment_request",
      identifier: "C0028-P001-E002",
      statusLabel: "Paid",
      status: "PAID",
      amountInr: "₹1,84,246.00",
      paidAt: "2026-07-15T06:00:00.000Z",
      paidByName: "Ravi Kumar",
      paidFromBankLabel: "Ops (BANK-01)",
      party: { type: "vendor", code: "V0007", name: "Acme Supplies" },
      approvals: { manager: "APPROVED", admin: "APPROVED", payment: "PAID", reconciliation: "MATCHED" },
      nextActions: [],
    });
    expect(text).toMatch(/Paid:/);
    expect(text).toContain("Ops (BANK-01)");
  });
});
