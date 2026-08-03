/**
 * Phase G — collection_delay_estimate goldens (labeled prediction; never money fact).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";
import {
  buildNovaFinding,
  buildNovaPredictionFinding,
  novaFindingsForbidPredictionAsMoney,
} from "@/lib/nova/recipes/finding";
import { estimateCollectionDelayBand } from "@/lib/nova/skills/finance/collection-delay-estimate";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    vendor: { findMany: vi.fn().mockResolvedValue([]) },
    project: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    novaEntityAlias: { findMany: vi.fn().mockResolvedValue([]) },
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

describe("Phase G prediction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("buildNovaFinding still rejects prediction; prediction builder labels features", () => {
    expect(() =>
      buildNovaFinding({
        observation: "x",
        evidence: [{ toolId: "t", summary: "s" }],
        contributors: [{ toolId: "t", role: "r" }],
        // @ts-expect-error
        confidence: "prediction",
      })
    ).toThrow();
    const p = buildNovaPredictionFinding({
      observation: "delay band",
      evidence: [{ toolId: "overdue_invoices", summary: "n=3" }],
      contributors: [{ toolId: "overdue_invoices", role: "feature_source" }],
      features: ["mean_days_past_due=12"],
      estimateLabel: "likely ~2–6 weeks (medium)",
    });
    expect(p.confidence).toBe("prediction");
    expect(novaFindingsForbidPredictionAsMoney([p])).toBe(true);
  });

  it("registers skill and routes", () => {
    expect(hasNovaSkill("collection_delay_estimate")).toBe(true);
    expect(selectNovaTools("collection delay estimate")).toContain("collection_delay_estimate");
  });

  it("honest empty without overdue facts", async () => {
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([]);
    const res = await answerNovaQuery(
      user({
        role: "DIRECTOR",
        grantedPermissions: ["ai.assistant.read", "invoice.read", "accounts.reports.read"],
      }),
      "collection_delay_estimate"
    );
    expect(res.toolsUsed ?? []).toContain("collection_delay_estimate");
    expect(res.answer).toMatch(/no overdue|withheld|insufficient|empty|prediction/i);
    expect(res.answer).not.toMatch(/guaranteed|will pay ₹/i);
  });

  it("normalize protects collection delay before receipts expand", async () => {
    const { normalizeNovaQuery } = await import("@/lib/ai/nova-normalize");
    expect(normalizeNovaQuery("collection delay estimate")).toBe("collection_delay_estimate");
    expect(selectNovaTools(normalizeNovaQuery("collection delay estimate"))).toEqual([
      "collection_delay_estimate",
    ]);
  });

  it("labels prediction when overdue sample exists", async () => {
    const due = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([
      {
        id: "inv1",
        invoiceNumber: "INV-1",
        dueDate: due,
        customer: { id: "c1", customerName: "Avaada" },
      },
    ] as never);
    const res = await answerNovaQuery(
      user({
        role: "DIRECTOR",
        grantedPermissions: ["ai.assistant.read", "invoice.read", "accounts.reports.read"],
      }),
      "payment delay prediction"
    );
    expect(res.toolsUsed ?? []).toContain("collection_delay_estimate");
    expect(res.answer).toMatch(/prediction|not ledger/i);
    expect(res.answer).toMatch(/Features:|mean_days|estimate/i);
    expect(estimateCollectionDelayBand(20).band).toMatch(/2–6 weeks|weeks/);
  });
});
