import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    deliveryRecord: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runDeliverySummary } from "@/lib/nova/skills/ops/delivery";

function user(): SessionUser {
  return {
    id: "u1",
    name: "Ops Manager",
    email: "ops@example.com",
    role: "MANAGER",
    canApprove: false,
    canSeeVendorBank: false,
    canSeeSalaryInfo: false,
    canSeeProjectValue: false,
    canEditProjectValue: false,
    canSeeProjectBudget: false,
    canEditProjectBudget: false,
    canSeeProjectInvoiced: false,
    canEditProjectInvoiced: false,
    canSeeCustomerCredit: false,
    canEditCustomerCredit: false,
    canSeePurchaseBills: false,
    canEditPurchaseBills: false,
    canSeePayments: false,
    canEditPayments: false,
    canViewBackupHistory: false,
    canViewTeamKpi: false,
    canEditTeamKpi: false,
    canViewTeamIncentives: false,
    mustChangePassword: false,
    grantedPermissions: ["ai.assistant.read", "delivery.read", "project.read", "customer.read"],
  };
}

function ctx(partial: Partial<NovaSkillHandlerContext>): NovaSkillHandlerContext {
  return {
    user: user(),
    query: "delivery",
    tz: "Asia/Kolkata",
    range: null,
    entityHint: null,
    entityFilterName: undefined,
    resolvedEntityType: null,
    resolvedEntityDbId: null,
    personHint: null,
    sampleLimit: 8,
    ...partial,
  };
}

describe("runDeliverySummary delivery/install semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.deliveryRecord.count).mockResolvedValue(1);
    vi.mocked(prisma.deliveryRecord.groupBy).mockResolvedValue([
      { stage: "INSTALLATION_PENDING", _count: 1 },
    ] as never);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
      {
        id: "del-1",
        salesOrderId: "C0001-P001-SO001",
        stage: "INSTALLATION_PENDING",
        transportVendor: null,
        lrNumber: null,
        vehicleNumber: null,
        driverContact: null,
        engineerInCharge: "Rafiq",
        dispatchDate: new Date("2026-07-10T00:00:00.000Z"),
        deliveredDate: new Date("2026-07-11T00:00:00.000Z"),
        installationStartDate: new Date("2026-07-12T00:00:00.000Z"),
        installationEndDate: null,
        updatedAt: new Date("2026-07-12T00:00:00.000Z"),
        project: {
          projectName: "James School Solar",
          projectId: "C0001-P001",
          expectedCompletionDate: new Date("2026-07-10T00:00:00.000Z"),
          customer: {
            customerName: "James School",
            companyName: null,
            customerId: "C0001",
          },
        },
      },
    ] as never);
  });

  it("filters installation pending by resolved customer scope", async () => {
    const res = await runDeliverySummary(
      ctx({
        query: "installation pending for James School",
        entityFilterName: "James School",
        resolvedEntityType: "customer",
        resolvedEntityDbId: "cust-db",
      })
    );

    expect(res.fact.ok).toBe(true);
    expect(res.fact.data).toMatchObject({
      focus: "installation_pending",
      scopeKind: "customer",
      sourceOfTruth: "DeliveryRecord",
      installationPendingCount: 1,
    });
    expect(prisma.deliveryRecord.count).toHaveBeenCalledWith({
      where: {
        AND: expect.arrayContaining([
          { stage: { in: ["INSTALLATION_PENDING", "INSTALLATION_STARTED"] } },
          { project: { customerId: "cust-db" } },
        ]),
      },
    });
  });

  it("returns supported responsibility fields and limitation note", async () => {
    const res = await runDeliverySummary(
      ctx({
        query: "who handled installation for project C0001-P001",
        entityFilterName: "C0001-P001",
        resolvedEntityType: "project",
        resolvedEntityDbId: "project-db",
      })
    );

    expect(res.fact.data).toMatchObject({
      focus: "responsibility",
      responsibilityNote: expect.stringMatching(/engineerInCharge/),
    });
    expect(JSON.stringify(res.fact.data)).toMatch(/Rafiq/);
    expect(JSON.stringify(res.fact.data)).toMatch(/DeliveryRecord/);
  });
});
