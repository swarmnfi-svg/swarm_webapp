/**
 * staff_expense_summary — paid manual vouchers + workflow expense PRs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    manualExpensePayment: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    paymentRequest: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
    staffAdvanceSettlementLine: {
      aggregate: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    staffAdvanceSettlement: {
      findMany: vi.fn(),
    },
    staffProfile: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({
  can: vi.fn(() => true),
  canViewOrgFinanceAggregates: vi.fn(() => true),
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runStaffExpenseSummary } from "@/lib/nova/skills/finance/expenses";
import type { SessionUser } from "@/auth";

const user = { id: "u1", role: "SUPER_ADMIN" } as SessionUser;

describe("runStaffExpenseSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.staffAdvanceSettlementLine.aggregate).mockResolvedValue({
      _sum: { totalAmount: 0 },
      _count: 0,
    } as never);
    vi.mocked(prisma.staffAdvanceSettlementLine.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.staffAdvanceSettlementLine.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.staffAdvanceSettlement.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([] as never);
  });

  it("sums PAID manual vouchers + expense payment requests (no double-count)", async () => {
    vi.mocked(prisma.manualExpensePayment.groupBy).mockResolvedValue([
      { entryType: "EXPENSE", _sum: { amount: 1000 }, _count: 1 },
    ] as never);
    vi.mocked(prisma.manualExpensePayment.findMany).mockResolvedValue([
      {
        voucherNo: "ME-1",
        entryType: "EXPENSE",
        amount: 1000,
        purpose: "Petty",
        paidAt: new Date("2026-07-05T10:00:00Z"),
        partyLabel: "Cash",
      },
    ] as never);
    vi.mocked(prisma.manualExpensePayment.count).mockResolvedValue(0);
    vi.mocked(prisma.paymentRequest.groupBy).mockResolvedValue([
      { requestType: "STAFF_EXPENSE_REIMBURSEMENT", _sum: { amount: 2500 }, _count: 2 },
    ] as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([
      {
        paymentRequestId: "REIM-1",
        requestType: "STAFF_EXPENSE_REIMBURSEMENT",
        amount: 2500,
        purpose: "Travel",
        paidAt: new Date("2026-07-08T10:00:00Z"),
        partyLabel: "Zeeshan",
      },
    ] as never);

    const range = {
      from: new Date("2026-06-30T18:30:00.000Z"),
      to: new Date("2026-07-31T18:29:59.999Z"),
      label: "July 2026",
    };
    const res = await runStaffExpenseSummary({
      user,
      query: "expense report july",
      tz: "Asia/Kolkata",
      range,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 6,
    });

    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as Record<string, unknown>;
    expect(data.totalPaid).toBe(3500);
    expect(data.manualPaid).toBe(1000);
    expect(data.paymentRequestPaid).toBe(2500);
    expect(String(data.totalPaidInr)).toMatch(/3,500|3500/);

    const prWhere = vi.mocked(prisma.paymentRequest.groupBy).mock.calls[0]![0]!
      .where as Record<string, unknown>;
    expect(prWhere.manualExpensePayment).toBeNull();
    expect(prWhere.status).toBe("PAID");
  });

  it("adds posted staff advance settlement lines to staff spend totals", async () => {
    vi.mocked(prisma.manualExpensePayment.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.manualExpensePayment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.manualExpensePayment.count).mockResolvedValue(0);
    vi.mocked(prisma.paymentRequest.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.staffAdvanceSettlementLine.aggregate).mockResolvedValue({
      _sum: { totalAmount: 4200 },
      _count: 2,
    } as never);
    vi.mocked(prisma.staffAdvanceSettlementLine.findMany).mockResolvedValue([
      {
        id: "line-1",
        date: new Date("2026-07-10T00:00:00Z"),
        description: "Site travel",
        totalAmount: 4200,
        projectRef: "P1",
        settlement: {
          settlementNo: "SET-1",
          staffId: "staff-1",
          staff: { fullName: "Arif", staffCode: "EMP1" },
        },
      },
    ] as never);

    const res = await runStaffExpenseSummary({
      user,
      query: "staff-wise expense report",
      tz: "Asia/Kolkata",
      range: {
        from: new Date("2026-06-30T18:30:00.000Z"),
        to: new Date("2026-07-31T18:29:59.999Z"),
        label: "July 2026",
      },
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 6,
    });

    const data = res.fact.data as Record<string, unknown>;
    expect(data.totalPaid).toBe(4200);
    expect(data.settlementExpense).toBe(4200);
    expect(JSON.stringify(data.byType)).toMatch(/STAFF_ADVANCE_SETTLEMENT_EXPENSE/);
  });

  it("ranks reimbursement claimants from staff-linked payment requests", async () => {
    vi.mocked(prisma.manualExpensePayment.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.manualExpensePayment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.manualExpensePayment.count).mockResolvedValue(0);
    vi.mocked(prisma.paymentRequest.groupBy).mockResolvedValue([
      { requestType: "STAFF_EXPENSE_REIMBURSEMENT", _sum: { amount: 7000 }, _count: 2 },
    ] as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.paymentRequest.groupBy).mockResolvedValueOnce([
      { requestType: "STAFF_EXPENSE_REIMBURSEMENT", _sum: { amount: 7000 }, _count: 2 },
    ] as never);
    vi.mocked(prisma.paymentRequest.groupBy).mockResolvedValueOnce([
      { staffId: "staff-2", _sum: { amount: 7000 }, _count: 2 },
    ] as never);
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      { id: "staff-2", fullName: "Zeeshan", staffCode: "EMP2" },
    ] as never);

    const res = await runStaffExpenseSummary({
      user,
      query: "who claimed most reimbursement all time",
      tz: "Asia/Kolkata",
      range: null,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 6,
    });

    const data = res.fact.data as Record<string, unknown>;
    const ranking = data.ranking as { topStaff: Array<Record<string, unknown>> };
    expect(data.mode).toBe("reimbursement_requests");
    expect(ranking.topStaff[0]?.staff).toBe("Zeeshan");
    expect(ranking.topStaff[0]?.totalSpend).toBe(7000);
    const prWhere = vi.mocked(prisma.paymentRequest.groupBy).mock.calls[0]![0]!
      .where as Record<string, unknown>;
    expect(JSON.stringify(prWhere)).toMatch(/STAFF_EXPENSE_REIMBURSEMENT/);
    expect(JSON.stringify(prWhere)).not.toMatch(/GENERAL_EXPENSE/);
  });

  it("notes pending manual vouchers when paid total is zero", async () => {
    vi.mocked(prisma.manualExpensePayment.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.manualExpensePayment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.manualExpensePayment.count).mockResolvedValue(3);
    vi.mocked(prisma.paymentRequest.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([] as never);

    const range = {
      from: new Date("2026-06-30T18:30:00.000Z"),
      to: new Date("2026-07-31T18:29:59.999Z"),
      label: "July 2026",
    };
    const res = await runStaffExpenseSummary({
      user,
      query: "july expenses",
      tz: "Asia/Kolkata",
      range,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 6,
    });
    const data = res.fact.data as Record<string, unknown>;
    expect(data.totalPaid).toBe(0);
    expect(String(data.emptyNote)).toMatch(/PENDING/i);
  });
});
