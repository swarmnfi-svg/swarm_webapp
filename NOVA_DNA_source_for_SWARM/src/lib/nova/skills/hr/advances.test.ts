/**
 * staff_advances_summary — status/ranking semantics.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    staffAdvance: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    staffProfile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/rbac", () => ({
  can: vi.fn(() => true),
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runStaffAdvancesSummary } from "@/lib/nova/skills/hr/advances";
import type { SessionUser } from "@/auth";

const user = { id: "u1", role: "SUPER_ADMIN" } as SessionUser;

describe("runStaffAdvancesSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.staffAdvance.count).mockResolvedValue(0);
    vi.mocked(prisma.staffAdvance.aggregate).mockResolvedValue({
      _sum: { balancePending: 0 },
    } as never);
    vi.mocked(prisma.staffAdvance.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.staffAdvance.groupBy).mockResolvedValue([] as never);
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([] as never);
  });

  it("ranks staff by requested advance amount for an explicit period", async () => {
    vi.mocked(prisma.staffAdvance.count).mockResolvedValue(2);
    vi.mocked(prisma.staffAdvance.aggregate).mockResolvedValue({
      _sum: { balancePending: 3000 },
    } as never);
    vi.mocked(prisma.staffAdvance.groupBy).mockResolvedValue([
      { staffId: "s1", _sum: { amountIssued: 10000, balancePending: 1000 }, _count: 1 },
      { staffId: "s2", _sum: { amountIssued: 15000, balancePending: 2000 }, _count: 1 },
    ] as never);
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      { id: "s1", fullName: "Arif", staffCode: "EMP1" },
      { id: "s2", fullName: "Zeeshan", staffCode: "EMP2" },
    ] as never);

    const res = await runStaffAdvancesSummary({
      user,
      query: "which staff requested most advance this month",
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
    const ranking = data.ranking as { topStaff: Array<Record<string, unknown>> };
    expect(data.amountBasis).toBe("amountIssued");
    expect(data.period).toBe("July 2026");
    expect(ranking.topStaff[0]?.staff).toBe("Zeeshan");
    expect(ranking.topStaff[0]?.amount).toBe(15000);
    const where = vi.mocked(prisma.staffAdvance.groupBy).mock.calls[0]![0]!
      .where as Record<string, unknown>;
    expect(where.createdAt).toBeTruthy();
  });

  it("uses balance pending for pending-settlement advance asks", async () => {
    vi.mocked(prisma.staffAdvance.count).mockResolvedValue(1);
    vi.mocked(prisma.staffAdvance.aggregate).mockResolvedValue({
      _sum: { balancePending: 5000 },
    } as never);

    const res = await runStaffAdvancesSummary({
      user,
      query: "staff advance pending settlement",
      tz: "Asia/Kolkata",
      range: null,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 6,
    });

    const data = res.fact.data as Record<string, unknown>;
    expect(data.statusFilter).toBe("pending_settlement");
    expect(data.amountBasis).toBe("balancePending");
    const where = vi.mocked(prisma.staffAdvance.count).mock.calls[0]![0]!
      .where as Record<string, unknown>;
    expect(JSON.stringify(where)).toMatch(/PARTIALLY_SETTLED/);
    expect(JSON.stringify(where)).toMatch(/balancePending/);
  });
});
