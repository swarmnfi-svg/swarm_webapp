/**
 * Soft-fail settle locks — tally / documents / proactive never invent 0 on lookup fail.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    tallyConnection: { count: vi.fn(), findMany: vi.fn() },
    tallySyncJob: { findMany: vi.fn() },
    document: { count: vi.fn(), groupBy: vi.fn() },
    salesInvoice: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { grandTotal: 0 } }),
    },
    approvalRequest: { count: vi.fn().mockResolvedValue(0) },
    hrPayrollRun: { count: vi.fn() },
    hrOvertimeRecord: { count: vi.fn() },
    hrRegularisationRequest: { count: vi.fn() },
    itemMaster: { findMany: vi.fn().mockResolvedValue([]) },
    project: { count: vi.fn().mockResolvedValue(0) },
    eInvoiceRecord: { count: vi.fn() },
    backupRecord: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runTallyStatus } from "@/lib/nova/skills/finance/tally-status";
import { runDocumentsOpen } from "@/lib/nova/skills/system/documents-open";
import { runProactiveInsights } from "@/lib/nova/skills/ops/proactive-insights";
import { settlePromise } from "@/lib/nova/skills/settle";

function user(partial: Partial<SessionUser> & { role: SessionUser["role"] }): SessionUser {
  return {
    id: partial.id ?? "u1",
    name: partial.name ?? "Test",
    email: partial.email ?? "t@example.com",
    role: partial.role,
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
    canViewBackupHistory: partial.canViewBackupHistory ?? false,
    canViewTeamKpi: true,
    canViewTeamIncentives: true,
    canEditTeamKpi: false,
    mustChangePassword: false,
    grantedPermissions: (partial.grantedPermissions ?? []) as Permission[],
  };
}

describe("settlePromise", () => {
  it("returns ok:false on rejection", async () => {
    const r = await settlePromise(Promise.reject(new Error("db")));
    expect(r.ok).toBe(false);
  });
  it("returns value on resolve", async () => {
    const r = await settlePromise(Promise.resolve(7));
    expect(r).toEqual({ ok: true, value: 7 });
  });
});

describe("tally_status soft-fail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft-fails when both connection counts throw (not 0 connections)", async () => {
    vi.mocked(prisma.tallyConnection.count).mockRejectedValue(new Error("db down"));
    vi.mocked(prisma.tallyConnection.findMany).mockRejectedValue(new Error("db down"));
    vi.mocked(prisma.tallySyncJob.findMany).mockRejectedValue(new Error("db down"));
    const res = await runTallyStatus({
      user: user({
        role: "ADMIN",
        grantedPermissions: ["tally.dashboard.view"] as Permission[],
      }),
      query: "tally status",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(false);
    expect(String(res.fact.error ?? "")).toMatch(/do not treat as zero/i);
  });

  it("succeeds with counts when lookups work", async () => {
    vi.mocked(prisma.tallyConnection.count)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    vi.mocked(prisma.tallyConnection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.tallySyncJob.findMany).mockResolvedValue([]);
    const res = await runTallyStatus({
      user: user({
        role: "ADMIN",
        grantedPermissions: ["tally.dashboard.view"] as Permission[],
      }),
      query: "tally status",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    expect((res.fact.data as { connectionCount: number }).connectionCount).toBe(2);
  });
});

describe("documents_open soft-fail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("soft-fails when primary total count throws (not 0 documents)", async () => {
    vi.mocked(prisma.document.count).mockRejectedValue(new Error("db down"));
    const res = await runDocumentsOpen({
      user: user({
        role: "ADMIN",
        grantedPermissions: ["documents.read"] as Permission[],
      }),
      query: "documents",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(false);
    expect(String(res.fact.error ?? "")).toMatch(/do not treat as zero/i);
  });
});

describe("proactive_insights soft-fail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Force every runner path that has access to throw
    vi.mocked(prisma.salesInvoice.count).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.salesInvoice.aggregate).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.approvalRequest.count).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.hrPayrollRun.count).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.itemMaster.findMany).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.project.count).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.eInvoiceRecord.count).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.backupRecord.count).mockRejectedValue(new Error("db"));
    vi.mocked(prisma.tallyConnection.count).mockRejectedValue(new Error("db"));
  });

  it("soft-fails when all insight runners throw", async () => {
    const res = await runProactiveInsights({
      user: user({
        role: "ADMIN",
        grantedPermissions: [] as Permission[],
        canViewBackupHistory: true,
      }),
      query: "insights",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(false);
    expect(String(res.fact.error ?? "")).toMatch(/do not treat as zero/i);
  });
});
