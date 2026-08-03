/**
 * Receipts report pack — skill-level.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    salesReceipt: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runReceiptsSummary } from "@/lib/nova/skills/finance/receipts";

function director(): SessionUser {
  return {
    id: "u1",
    role: "DIRECTOR",
    email: "d@test.com",
    name: "Director",
    grantedPermissions: ["ai.assistant.read", "receipt.read", "accounts.reports.read"],
  } as SessionUser;
}

describe("receipts_summary report pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.salesReceipt.count).mockResolvedValue(2);
    vi.mocked(prisma.salesReceipt.aggregate).mockResolvedValue({
      _sum: { amount: 150000 },
      _count: 2,
    } as never);
    vi.mocked(prisma.salesReceipt.findMany).mockResolvedValue([
      {
        id: "r1",
        receiptNumber: "RCP-1",
        receiptDate: new Date("2026-07-10"),
        amount: 90000,
        paymentMode: "NEFT",
        bankReferenceId: "UTR1",
        reconciliationStatus: "MATCHED",
        customer: { customerName: "Acme Corp" },
        project: { projectId: "P1", projectName: "Plant" },
      },
    ] as never);
  });

  it("chat-only without report intent", async () => {
    const res = await runReceiptsSummary({
      user: director(),
      query: "today receipts",
      tz: "Asia/Kolkata",
      range: null,
      sampleLimit: 8,
    } as never);
    expect(res.fact.ok).toBe(true);
    expect((res.fact.data as { pack?: unknown })?.pack).toBeUndefined();
  });

  it("builds receipts_report pack for report intent", async () => {
    const res = await runReceiptsSummary({
      user: director(),
      query: "receipts summary report with charts",
      tz: "Asia/Kolkata",
      range: null,
      sampleLimit: 8,
    } as never);
    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as {
      reportIntent?: boolean;
      pack?: { packId?: string; charts?: unknown[]; tables?: { title: string }[] };
    };
    expect(data.reportIntent).toBe(true);
    expect(data.pack?.packId).toBe("receipts_report");
    expect(data.pack?.charts?.length).toBeGreaterThan(0);
    expect(data.pack?.tables?.[0]?.title).toMatch(/receipt/i);
  });

  it("amount-token lookups stay POSTED-only", async () => {
    vi.mocked(prisma.salesReceipt.findMany).mockClear();
    await runReceiptsSummary({
      user: director(),
      query: "receipt for 90000",
      tz: "Asia/Kolkata",
      range: null,
      sampleLimit: 8,
    } as never);
    const amountHitCall = vi
      .mocked(prisma.salesReceipt.findMany)
      .mock.calls.find((call) => {
        const where = call[0]?.where as { amount?: { in?: unknown } } | undefined;
        return Array.isArray(where?.amount?.in);
      });
    expect(amountHitCall?.[0]?.where).toMatchObject({
      postingStatus: "POSTED",
      amount: { in: [90000] },
    });
  });
});
