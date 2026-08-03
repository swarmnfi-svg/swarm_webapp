/**
 * NovANALYSER P0 — intent, RBAC plan filtering, ranking, routing goldens.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
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
    project: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    deliveryRecord: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    itemMaster: { findMany: vi.fn().mockResolvedValue([]) },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), findUnique: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({ name: "Test", timezone: "Asia/Kolkata" }),
    },
    kpiReview: { findMany: vi.fn().mockResolvedValue([]) },
    kpiPeriod: { findFirst: vi.fn().mockResolvedValue(null) },
    task: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    hrAttendanceDaily: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    hrLeaveRequest: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { selectNovaTools } from "@/lib/ai/nova-tools";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { buildNovaPlan } from "@/lib/ai/nova-plan";
import { selectToolsFromLexicon } from "@/lib/ai/nova-lexicon";
import {
  filterNovaToolsForUser,
  novaCanRunTool,
  novaSuggestedPrompts,
} from "@/lib/ai/nova-suggest";
import { hasNovaSkill } from "@/lib/nova/skills/registry";
import {
  classifyNovAnalyserIntent,
  isNovAnalyserCue,
  isNovAnalyserEnabled,
} from "@/lib/novanalyser/intent";
import { buildNovAnalyserPlan, listNovAnalyserPlanToolIds } from "@/lib/novanalyser/plan-registry";
import { resolveNovAnalyserProfile } from "@/lib/novanalyser/profile";
import { buildNovAnalyserIssues } from "@/lib/novanalyser/correlate";
import { rankNovAnalyserIssues } from "@/lib/novanalyser/rank";
import { resolveNovaMetaEngineRoute } from "@/lib/ai/nova-engine-routing";
import type { NovAnalyserMetricSnapshot } from "@/lib/novanalyser/types";

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

describe("NovANALYSER P0", () => {
  const prevFlag = process.env.NOVA_NOVANALYSER_ENABLED;

  beforeEach(() => {
    process.env.NOVA_NOVANALYSER_ENABLED = "1";
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.NOVA_NOVANALYSER_ENABLED;
    else process.env.NOVA_NOVANALYSER_ENABLED = prevFlag;
  });

  it("registers novanalyser skill", () => {
    expect(hasNovaSkill("novanalyser")).toBe(true);
  });

  it("classifies business health vs productivity intents", () => {
    expect(classifyNovAnalyserIntent("how can I improve the business").intent).toBe(
      "business_health"
    );
    expect(classifyNovAnalyserIntent("company health").intent).toBe("business_health");
    expect(classifyNovAnalyserIntent("can I increase my productivity").intent).toBe(
      "productivity_self"
    );
    expect(classifyNovAnalyserIntent("how am I performing").intent).toBe("productivity_self");
    expect(classifyNovAnalyserIntent("why is my kpi low").intent).toBe("unknown");
  });

  it("routes broad cues to novanalyser before nova_analysis", () => {
    expect(isNovAnalyserCue("how can I improve the business")).toBe(true);
    expect(selectNovaTools(normalizeNovaQuery("how can I improve the business"))).toEqual([
      "novanalyser",
    ]);
    expect(selectNovaTools(normalizeNovaQuery("can I increase my productivity"))).toEqual([
      "novanalyser",
    ]);
    expect(selectNovaTools(normalizeNovaQuery("why is my kpi low"))).toContain("nova_analysis");
    expect(selectNovaTools(normalizeNovaQuery("why is my kpi low"))).not.toContain("novanalyser");
  });

  it("Staff business health plan has no org finance steps", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "task.read.self", "kpi.read.self"],
    });
    const profile = resolveNovAnalyserProfile(staff, "business_health");
    expect(profile).toBe("staff");
    const plan = buildNovAnalyserPlan({
      user: staff,
      intent: "business_health",
      profile,
    });
    expect(plan?.steps).toEqual([]);
    expect(plan?.skippedModules.length).toBeGreaterThan(0);
  });

  it("Director business health plan includes finance modules when permitted", () => {
    const director = user({
      role: "DIRECTOR",
      grantedPermissions: [
        "ai.assistant.read",
        "invoice.read",
        "receipt.read",
        "project.read",
        "director.dashboard",
        "kpi.read.all",
        "approval.read.all",
        "stock.read",
        "delivery.read",
        "accounts.dashboard.read",
      ],
    });
    const plan = buildNovAnalyserPlan({
      user: director,
      intent: "business_health",
      profile: "director",
    });
    const toolIds = plan?.steps.map((s) => s.toolId) ?? [];
    expect(toolIds).toContain("sales_summary");
    expect(toolIds).toContain("overdue_invoices");
    expect(toolIds).toContain("projects_summary");
    expect(toolIds).not.toContain("salary_summary");
  });

  it("plan templates never include salary_summary", () => {
    const director = user({
      role: "DIRECTOR",
      grantedPermissions: [
        "ai.assistant.read",
        "invoice.read",
        "receipt.read",
        "project.read",
        "director.dashboard",
        "kpi.read.all",
        "hr.salary.read",
      ],
    });
    for (const intent of ["business_health", "productivity_self"] as const) {
      const plan = buildNovAnalyserPlan({
        user: director,
        intent,
        profile: intent === "productivity_self" ? "staff" : "director",
      });
      expect(listNovAnalyserPlanToolIds(plan!)).not.toContain("salary_summary");
    }
  });

  it("Staff productivity plan is self-scoped tools only", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: [
        "ai.assistant.read",
        "task.read.self",
        "kpi.read.self",
        "hr.punch.self",
        "hr.leave.create",
      ],
    });
    const plan = buildNovAnalyserPlan({
      user: staff,
      intent: "productivity_self",
      profile: "staff",
    });
    const toolIds = plan?.steps.map((s) => s.toolId) ?? [];
    expect(toolIds).toContain("my_work_summary");
    expect(toolIds).toContain("kpi_summary");
    expect(toolIds).not.toContain("sales_summary");
    expect(toolIds).not.toContain("overdue_invoices");
  });

  it("C01 collections gap ranks above low severity singles", () => {
    const metrics: NovAnalyserMetricSnapshot[] = [
      {
        metricId: "finance.ar.overdue_amount_inr",
        value: 4200000,
        toolId: "overdue_invoices",
        entityScope: "org",
      },
      {
        metricId: "finance.ar.overdue_count",
        value: 12,
        toolId: "overdue_invoices",
        entityScope: "org",
      },
      {
        metricId: "finance.receipts.total_inr",
        value: 800000,
        toolId: "receipts_summary",
        entityScope: "org",
      },
      {
        metricId: "finance.ar.open_total_inr",
        value: 5000000,
        toolId: "receivables_summary",
        entityScope: "org",
      },
      {
        metricId: "hr.leave.pending_count",
        value: 1,
        toolId: "leave_summary",
        entityScope: "self",
      },
    ];
    const issues = rankNovAnalyserIssues(buildNovAnalyserIssues(metrics), true);
    expect(issues[0]?.correlationRuleId).toBe("C01");
    expect(issues[0]?.severity).toBe("critical");
  });

  it("money-hidden ranking omits financial exposure weight", () => {
    const metrics: NovAnalyserMetricSnapshot[] = [
      {
        metricId: "finance.ar.overdue_amount_inr",
        value: 9000000,
        toolId: "overdue_invoices",
        entityScope: "org",
      },
      {
        metricId: "finance.ar.overdue_count",
        value: 20,
        toolId: "overdue_invoices",
        entityScope: "org",
      },
    ];
    const withMoney = rankNovAnalyserIssues(buildNovAnalyserIssues(metrics), true)[0]?.score ?? 0;
    const hidden = rankNovAnalyserIssues(buildNovAnalyserIssues(metrics), false)[0]?.score ?? 0;
    expect(withMoney).toBeGreaterThan(hidden);
  });

  it("disabled when NOVA_NOVANALYSER_ENABLED unset — zero routing / tool / chip change", () => {
    delete process.env.NOVA_NOVANALYSER_ENABLED;
    expect(isNovAnalyserEnabled()).toBe(false);
    expect(isNovAnalyserCue("how can I improve the business")).toBe(false);
    expect(isNovAnalyserCue("can I increase my productivity")).toBe(false);
    expect(resolveNovaMetaEngineRoute("how can I improve the business")).toBeNull();
    expect(selectNovaTools(normalizeNovaQuery("how can I improve the business"))).not.toContain(
      "novanalyser"
    );
    expect(selectNovaTools(normalizeNovaQuery("why is my kpi low"))).toContain("nova_analysis");
    expect(selectToolsFromLexicon("how can I improve the business").tools).not.toContain(
      "novanalyser"
    );
    expect(buildNovaPlan("how can I improve the business").tools).not.toContain("novanalyser");

    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "task.read.self", "kpi.read.self"],
    });
    expect(novaCanRunTool(staff, "novanalyser")).toBe(false);
    expect(filterNovaToolsForUser(staff, ["novanalyser"])).toEqual([]);
    expect(filterNovaToolsForUser(staff, ["novanalyser", "kpi_summary"])).toEqual(["kpi_summary"]);

    const director = user({
      role: "DIRECTOR",
      grantedPermissions: ["ai.assistant.read", "invoice.read", "director.dashboard"],
    });
    const prompts = novaSuggestedPrompts(director).map((p) => p.prompt);
    expect(prompts).not.toContain("how can I improve the business");
    expect(prompts).not.toContain("can I increase my productivity");
  });

  it("forced-tool path still filtered when flag OFF", () => {
    delete process.env.NOVA_NOVANALYSER_ENABLED;
    const director = user({
      role: "DIRECTOR",
      grantedPermissions: [
        "ai.assistant.read",
        "invoice.read",
        "kpi.read.all",
        "director.dashboard",
      ],
    });
    expect(filterNovaToolsForUser(director, ["novanalyser"])).toEqual([]);
  });
});
