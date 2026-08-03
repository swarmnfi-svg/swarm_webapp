import { describe, expect, it } from "vitest";
import { suggestNovaTriageOutcome, NOVA_TRIAGE_OUTCOMES } from "@/lib/ai/nova-triage";
import {
  assertRecipeContract,
  filterRecipeToolsForUser,
} from "@/lib/nova/recipes/recipe-contract";
import {
  buildNovaFinding,
  formatNovaFindings,
} from "@/lib/nova/recipes/finding";
import {
  getNovaRecipe,
  listNovaRecipes,
  recipeMatchesQuery,
} from "@/lib/nova/recipes/registry";
import type { SessionUser } from "@/auth";

function user(role: SessionUser["role"], granted: string[] = []): SessionUser {
  return {
    id: "u1",
    name: "T",
    email: "t@example.com",
    role,
    canApprove: false,
    canSeeVendorBank: false,
    canSeeSalaryInfo: false,
    canSeeProjectValue: true,
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
    grantedPermissions: granted as never,
  };
}

describe("NOVA triage factory", () => {
  it("exposes full outcome enum", () => {
    expect(NOVA_TRIAGE_OUTCOMES).toEqual(
      expect.arrayContaining(["alias", "synonym", "recipe", "remain_denied"])
    );
  });

  it("suggests alias for party shorthand; remain_denied for writes", () => {
    expect(suggestNovaTriageOutcome({ query: "Miura", count: 3, looksLikeEntityName: true }).suggestedOutcome).toBe(
      "alias"
    );
    expect(
      suggestNovaTriageOutcome({ query: "please approve this payment", count: 2 }).suggestedOutcome
    ).toBe("remain_denied");
  });
});

describe("NOVA recipes + Finding", () => {
  it("registers collection_attention / cbg_pipeline / project_health with valid contracts", () => {
    for (const r of listNovaRecipes()) {
      expect(assertRecipeContract(r), r.id).toEqual([]);
      expect(r.readOnly).toBe(true);
    }
    expect(getNovaRecipe("collection_attention")?.toolIds).toEqual(
      expect.arrayContaining([
        "customers_summary",
        "customer_outstanding",
        "overdue_invoices",
        "receipts_summary",
      ])
    );
  });

  it("recipeMatchesQuery routes phrases", () => {
    expect(recipeMatchesQuery("collection attention for Avaada")).toBe("collection_attention");
    expect(recipeMatchesQuery("CBG pipeline")).toBe("cbg_pipeline");
    expect(recipeMatchesQuery("project health for Tata")).toBe("project_health");
    expect(recipeMatchesQuery("How is this month going?")).toBe("month_performance");
    expect(recipeMatchesQuery("tell me everything important about this project")).toBe(
      "project_command"
    );
    expect(recipeMatchesQuery("open tasks on this project")).toBe("project_command");
    expect(recipeMatchesQuery("tasks pending in Tata plant")).toBe("project_command");
    expect(recipeMatchesQuery("customer context for Avaada")).toBe("collection_attention");
    expect(recipeMatchesQuery("customer master for Miura")).toBe("collection_attention");
    expect(recipeMatchesQuery("customer payment risk")).toBeNull();
  });

  it("intersection RBAC filters recipe steps for Staff", () => {
    const recipe = getNovaRecipe("collection_attention")!;
    const staff = user("STAFF", ["ai.assistant.read"]);
    const tools = filterRecipeToolsForUser(staff, recipe);
    // Money chapters stay gated; customer master may pass if role grants customer.read.
    expect(tools).not.toContain("customer_outstanding");
    expect(tools).not.toContain("overdue_invoices");
    expect(tools).not.toContain("receipts_summary");
  });

  it("Finding builder keeps prediction off the fact path; formats facts", () => {
    expect(() =>
      buildNovaFinding({
        observation: "x",
        evidence: [{ toolId: "sales_summary", summary: "1" }],
        contributors: [{ toolId: "sales_summary", role: "x" }],
        // @ts-expect-error prediction must use buildNovaPredictionFinding
        confidence: "prediction",
      })
    ).toThrow();
    const f = buildNovaFinding({
      observation: "Outstanding is ₹1",
      evidence: [{ toolId: "customer_outstanding", summary: "1" }],
      contributors: [{ toolId: "customer_outstanding", role: "AR" }],
      confidence: "fact",
    });
    expect(formatNovaFindings([f])).toMatch(/Outstanding/);
  });
});
