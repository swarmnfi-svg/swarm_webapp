/**
 * Phase F — proactive_insights goldens (RBAC + money-hide + no writes).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    salesInvoice: {
      count: vi.fn().mockResolvedValue(0),
      aggregate: vi.fn().mockResolvedValue({ _sum: { grandTotal: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    approvalRequest: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    hrPayrollRun: { count: vi.fn().mockResolvedValue(0) },
    hrOvertimeRecord: { count: vi.fn().mockResolvedValue(0) },
    hrRegularisationRequest: { count: vi.fn().mockResolvedValue(0) },
    itemMaster: { findMany: vi.fn().mockResolvedValue([]) },
    project: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    eInvoiceRecord: { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
    backupRecord: { count: vi.fn().mockResolvedValue(0) },
    tallyConnection: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
    customer: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    vendor: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    novaEntityAlias: { findMany: vi.fn().mockResolvedValue([]) },
    document: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    deliveryRecord: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/ai/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/llm")>("@/lib/ai/llm");
  return { ...actual, novaChatCompletion: vi.fn() };
});

import { prisma } from "@/lib/nova/prisma-readonly";
import { answerNovaQuery } from "@/lib/ai/nova";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { hasNovaSkill } from "@/lib/nova/skills/registry";
import { runProactiveInsights } from "@/lib/nova/skills/ops/proactive-insights";
import { DEFAULT_TIMEZONE } from "@/lib/datetime-pure";

function user(partial: Partial<SessionUser> & { role: SessionUser["role"] }): SessionUser {
  return {
    id: partial.id ?? "u1",
    name: partial.name ?? "Test User",
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
    canViewBackupHistory: false,
    canViewTeamKpi: true,
    canViewTeamIncentives: true,
    canEditTeamKpi: false,
    mustChangePassword: false,
    grantedPermissions: (partial.grantedPermissions ?? []) as Permission[],
  };
}

const skillCtx = (u: SessionUser) => ({
  user: u,
  query: "proactive insights",
  range: null,
  tz: DEFAULT_TIMEZONE,
  entityHint: null,
  entityFilterName: undefined,
  personHint: null,
  sampleLimit: 8,
});

describe("Phase F proactive_insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers and routes", () => {
    expect(hasNovaSkill("proactive_insights")).toBe(true);
    expect(selectNovaTools("what needs attention")).toContain("proactive_insights");
    expect(selectNovaTools("proactive insights")).toContain("proactive_insights");
  });

  it("Staff money-hide: overdue rule omitted without finance aggregates", async () => {
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(5);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 125000 },
    } as never);
    vi.mocked(prisma.itemMaster.findMany).mockResolvedValue([
      { currentStock: 1, minimumStock: 5, name: "Bolt", itemCode: "B1" },
    ] as never);

    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "stock.read"],
    });
    const result = await runProactiveInsights(skillCtx(staff));
    expect(result.fact.ok).toBe(true);
    const data = result.fact.data as { insights?: { id: string; observation: string }[] };
    const ids = (data.insights ?? []).map((i) => i.id);
    expect(ids).toContain("low_stock");
    expect(ids).not.toContain("overdue_collections");
    expect(JSON.stringify(data)).not.toMatch(/125000|₹/);
  });

  it("Director sees overdue Finding with provenance; no write tools", async () => {
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(3);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 50000 },
    } as never);

    const director = user({
      role: "DIRECTOR",
      grantedPermissions: ["ai.assistant.read", "invoice.read", "accounts.reports.read"],
    });
    const result = await runProactiveInsights(skillCtx(director));
    expect(result.fact.ok).toBe(true);
    const data = result.fact.data as {
      insights?: { id: string; observation: string; confidence: string }[];
      findingsFormatted?: string;
    };
    expect((data.insights ?? []).some((i) => i.id === "overdue_collections")).toBe(true);
    expect(data.findingsFormatted ?? "").toMatch(/fact|Findings|overdue/i);

    const res = await answerNovaQuery(director, "proactive insights");
    expect(res.toolsUsed ?? []).toContain("proactive_insights");
    expect(res.answer).not.toMatch(/I (created|approved|posted)/i);
  });
});
