import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";
import {
  answerNovaPermissionHelp,
  isNovaPermissionCapabilityAsk,
} from "@/lib/ai/nova-permission-help";
import { detectNovaAwareQuery, answerNovaAwareQuery } from "@/lib/ai/nova-aware";
import { isNovaLiveErpDataAsk } from "@/lib/ai/nova-help-guides";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { selectToolsFromLexicon } from "@/lib/ai/nova-lexicon";

function user(partial: Partial<SessionUser> & { role: SessionUser["role"] }): SessionUser {
  return {
    id: partial.id ?? "u1",
    name: partial.name ?? "Test User",
    email: partial.email ?? "t@example.com",
    role: partial.role,
    canApprove: false,
    canSeeVendorBank: false,
    canSeeSalaryInfo: partial.canSeeSalaryInfo ?? false,
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

describe("nova-permission-help", () => {
  it("detects role permission shapes (production failure + cousins)", () => {
    expect(isNovaPermissionCapabilityAsk("can manager see profit")).toBe(true);
    expect(isNovaPermissionCapabilityAsk("can staff see salary")).toBe(true);
    expect(isNovaPermissionCapabilityAsk("can accountant view bank")).toBe(true);
    expect(isNovaPermissionCapabilityAsk("does manager have access to KPI")).toBe(true);
    expect(isNovaPermissionCapabilityAsk("who can see profit")).toBe(true);
    expect(isNovaPermissionCapabilityAsk("can i see profit")).toBe(true);
  });

  it("does not steal how-to or live P&L data asks", () => {
    expect(isNovaPermissionCapabilityAsk("can i do part payment of salry")).toBe(false);
    expect(isNovaPermissionCapabilityAsk("how to enter employee salary")).toBe(false);
    expect(isNovaPermissionCapabilityAsk("show project profit")).toBe(false);
    expect(isNovaPermissionCapabilityAsk("project profit")).toBe(false);
    expect(isNovaPermissionCapabilityAsk("projects on loss")).toBe(false);
    expect(isNovaPermissionCapabilityAsk("any project at loss")).toBe(false);
    expect(isNovaPermissionCapabilityAsk("fund position")).toBe(false);
  });

  it("does not classify permission asks as live ERP data", () => {
    expect(isNovaLiveErpDataAsk("can manager see profit")).toBe(false);
    expect(isNovaLiveErpDataAsk("who can see profit")).toBe(false);
    expect(isNovaLiveErpDataAsk("can staff see salary")).toBe(false);
    // Contrast: still live
    expect(isNovaLiveErpDataAsk("show project profit")).toBe(true);
    expect(isNovaLiveErpDataAsk("who is late today")).toBe(true);
  });

  it("Aware routes permission asks before profitability tools", () => {
    expect(detectNovaAwareQuery("can manager see profit")).toBe("permission_help");
    expect(detectNovaAwareQuery("who can see profit")).toBe("permission_help");
    expect(detectNovaAwareQuery("can staff see salary")).toBe("permission_help");
    expect(selectNovaTools("can manager see profit")).not.toContain("profitability_summary");
    expect(selectToolsFromLexicon("can manager see profit").tools).toEqual([]);
    // Live P&L still data path
    expect(detectNovaAwareQuery("show project profit")).toBeNull();
    expect(selectNovaTools("show project profit")).toContain("profitability_summary");
    expect(selectNovaTools("projects on loss")).toContain("profitability_summary");
  });

  it("answers manager cannot see profit (no live margins)", () => {
    const res = answerNovaPermissionHelp(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read"] }),
      "can manager see profit"
    );
    expect(res).not.toBeNull();
    expect(res!.toolsUsed).toContain("permission_help");
    expect(res!.toolsUsed).not.toContain("profitability_summary");
    expect(res!.answer).toMatch(/Manager/i);
    expect(res!.answer).toMatch(/cannot|No —/i);
    expect(res!.answer).toMatch(/Project P&L|profitability|permissions/i);
    expect(res!.answer).not.toMatch(/₹|Rs\.|margin\s*%|Total active project/i);
  });

  it("answers staff cannot see salary; accountant can view bank", () => {
    const staffSal = answerNovaAwareQuery(
      user({ role: "ADMIN" }),
      "can staff see salary"
    );
    expect(staffSal?.toolsUsed).toContain("permission_help");
    expect(staffSal?.answer).toMatch(/Staff/i);
    expect(staffSal?.answer).toMatch(/never|cannot|No —/i);

    const acctBank = answerNovaAwareQuery(
      user({ role: "ADMIN" }),
      "can accountant view bank"
    );
    expect(acctBank?.toolsUsed).toContain("permission_help");
    expect(acctBank?.answer).toMatch(/Accountant/i);
    expect(acctBank?.answer).toMatch(/Yes —|can open/i);
    expect(acctBank?.answer).toMatch(/Bank/i);
  });

  it("answers who can see profit with role list", () => {
    const res = answerNovaPermissionHelp(user({ role: "ADMIN" }), "who can see profit");
    expect(res?.answer).toMatch(/Typically yes/i);
    expect(res?.answer).toMatch(/Accountant|Director|Admin/i);
    expect(res?.answer).toMatch(/Typically no/i);
    expect(res?.answer).toMatch(/Manager|Staff/i);
  });

  it("answers manager KPI access from matrix", () => {
    const res = answerNovaPermissionHelp(
      user({ role: "ADMIN" }),
      "does manager have access to KPI"
    );
    expect(res?.toolsUsed).toContain("permission_help");
    expect(res?.answer).toMatch(/KPI/i);
    expect(res?.answer).toMatch(/Yes —|can open/i);
  });
});

describe("answerNovaQuery permission integration", () => {
  it("routes can manager see profit to permission_help not profitability dump", async () => {
    const { answerNovaQuery } = await import("@/lib/ai/nova");
    const admin = user({
      role: "ADMIN",
      grantedPermissions: ["ai.assistant.read", "project.profitability.view"],
    });
    const res = await answerNovaQuery(admin, "can manager see profit");
    expect(res.toolsUsed).toContain("permission_help");
    expect(res.toolsUsed).not.toContain("profitability_summary");
    expect(res.answer).toMatch(/Manager/i);
    expect(res.answer).toMatch(/cannot|No —|permissions/i);
    expect(res.answer).not.toMatch(/₹\s*[\d,]+|Total active project value/i);

    const data = await answerNovaQuery(admin, "show project profit");
    // May soft-deny or run tool depending on mocks — must not be permission_help
    expect(data.toolsUsed).not.toContain("permission_help");
  });
});
