/**
 * NI-01 regression: one toolId → permissions map shared by lexicon / suggest / skills.
 * Also locks money-hide, documents deny, vendor-bank SoD, late ⊆ present.
 */
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth";
import {
  NOVA_ORG_FINANCE_TOOL_IDS,
  NOVA_TOOL_PERMISSIONS,
  novaPermissionsForTool,
  novaPermissionsForTools,
  novaToolRequiresOrgFinance,
  sortedPermKeys,
} from "@/lib/ai/nova-tool-permissions";
import { NOVA_LEXICON } from "@/lib/ai/nova-lexicon";
import { novaCanRunTool, filterNovaClarifyChipsForUser } from "@/lib/ai/nova-suggest";
import { NOVA_ENTITY_METRIC_CONFIRM_CHIPS } from "@/lib/ai/nova-clarify";
import { listNovaSkills } from "@/lib/nova/skills/registry";
import {
  isNovaCredibleLateDay,
  isNovaPresentAttendanceStatus,
} from "@/lib/nova/skills/hr/attendance";

function user(partial: Partial<SessionUser> & Pick<SessionUser, "role">): SessionUser {
  return {
    id: "u1",
    email: "a@b.c",
    name: "Test",
    role: partial.role,
    permissions: partial.permissions ?? [],
    grantedPermissions: partial.grantedPermissions ?? [],
    canSeeProjectValue: false,
    canSeeVendorBank: false,
    ...partial,
  } as SessionUser;
}

describe("NI-01 toolId → permissions map (no drift)", () => {
  it("every registered skill has a map entry and matching metadata permissions", () => {
    for (const skill of listNovaSkills()) {
      expect(NOVA_TOOL_PERMISSIONS[skill.toolId], skill.toolId).toBeDefined();
      expect(sortedPermKeys(skill.permissions)).toEqual(
        sortedPermKeys(novaPermissionsForTool(skill.toolId))
      );
    }
  });

  it("every tooled lexicon topic derives permissions from the same map", () => {
    for (const topic of NOVA_LEXICON) {
      if (topic.tools.length === 0) continue;
      expect(sortedPermKeys(topic.permissions)).toEqual(
        sortedPermKeys(novaPermissionsForTools(topic.tools))
      );
      for (const toolId of topic.tools) {
        expect(NOVA_TOOL_PERMISSIONS[toolId], `${topic.id}/${toolId}`).toBeDefined();
      }
    }
  });

  it("map covers org-finance money-hide set", () => {
    for (const toolId of NOVA_ORG_FINANCE_TOOL_IDS) {
      expect(NOVA_TOOL_PERMISSIONS[toolId], toolId).toBeDefined();
      expect(novaToolRequiresOrgFinance(toolId)).toBe(true);
    }
  });
});

describe("NI-01 RBAC evals — money-hide / documents / SoD / late⊆present", () => {
  it("money-hide: Staff with invoice.read cannot run org sales/receipts tools", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "invoice.read", "receipt.read"],
    });
    expect(novaCanRunTool(staff, "sales_summary")).toBe(false);
    expect(novaCanRunTool(staff, "receipts_summary")).toBe(false);
    expect(novaCanRunTool(staff, "receivables_summary")).toBe(false);
    expect(novaCanRunTool(staff, "customer_outstanding")).toBe(false);
    expect(novaCanRunTool(staff, "overdue_invoices")).toBe(false);
    expect(novaCanRunTool(staff, "credit_notes_summary")).toBe(false);
  });

  it("money-hide: entity-metric invoices chip dropped for Staff without org aggregates", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "invoice.read", "task.read.self", "project.read"],
    });
    const chips = filterNovaClarifyChipsForUser(staff, NOVA_ENTITY_METRIC_CONFIRM_CHIPS);
    expect(chips.map((c) => c.id)).toContain("tasks");
    expect(chips.map((c) => c.id)).not.toContain("invoices");
    expect(chips.map((c) => c.id)).not.toContain("sales");
    expect(chips.map((c) => c.id)).not.toContain("receipts");
  });

  it("money-hide: Staff cannot run expense/bank/PO org tools without aggregates; SO tool allowed with money hidden in skill", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: [
        "ai.assistant.read",
        // Tool floors only — not accounts.dashboard / finance.* (those imply aggregates)
        "accounts.read",
        "bank.read",
        "purchaseorder.read",
        "salesorder.read",
      ],
    });
    expect(novaCanRunTool(staff, "staff_expense_summary")).toBe(false);
    expect(novaCanRunTool(staff, "bank_accounts_summary")).toBe(false);
    expect(novaCanRunTool(staff, "purchase_orders_summary")).toBe(false);
    expect(novaCanRunTool(staff, "sales_orders_summary")).toBe(true);
    expect(NOVA_ORG_FINANCE_TOOL_IDS.has("sales_orders_summary")).toBe(false);
    expect(NOVA_ORG_FINANCE_TOOL_IDS.has("staff_expense_summary")).toBe(true);
    expect(NOVA_ORG_FINANCE_TOOL_IDS.has("cbg_quotations_summary")).toBe(true);
  });

  it("money-hide: Staff with cbgquotation.read cannot run CBG summary (costInr)", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "cbgquotation.read"],
    });
    expect(novaCanRunTool(staff, "cbg_quotations_summary")).toBe(false);
  });

  it("money-hide: Accountant with finance aggregates can run sales and receipts", () => {
    const accountant = user({
      role: "ACCOUNTANT",
      grantedPermissions: ["ai.assistant.read", "invoice.read", "accounts.reports.read"],
    });
    expect(novaCanRunTool(accountant, "sales_summary")).toBe(true);
    expect(novaCanRunTool(accountant, "receipts_summary")).toBe(true);
  });

  it("documents deny: Staff without documents.read cannot open vault tool", () => {
    const staff = user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] });
    expect(novaCanRunTool(staff, "documents_open")).toBe(false);
    const withDocs = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "documents.read"],
    });
    expect(novaCanRunTool(withDocs, "documents_open")).toBe(true);
  });

  it("vendor-bank SoD: vendor.read alone is insufficient; vendorbank / flag ok (POL-1 ignores Staff bank.viewfullaccount)", () => {
    expect(
      novaCanRunTool(
        user({ role: "STAFF", grantedPermissions: ["ai.assistant.read", "vendor.read"] }),
        "vendor_bank_open"
      )
    ).toBe(false);
    // POL-1: STAFF grandfathered bank.* grants are ignored
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read", "bank.viewfullaccount"],
        }),
        "vendor_bank_open"
      )
    ).toBe(false);
    expect(
      novaCanRunTool(
        user({
          role: "ACCOUNTANT",
          grantedPermissions: ["ai.assistant.read"],
        }),
        "vendor_bank_open"
      )
    ).toBe(true);
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read", "vendorbank.read"],
        }),
        "vendor_bank_open"
      )
    ).toBe(true);
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read"],
          canSeeVendorBank: true,
        }),
        "vendor_bank_open"
      )
    ).toBe(true);
  });

  it("late ⊆ present: credible late days are a subset of present-like statuses", () => {
    const sample = [
      { status: "LATE", lateMinutes: 30 },
      { status: "HALF_DAY", lateMinutes: 90 },
      { status: "MISSING_PUNCH_OUT", lateMinutes: 200 },
      { status: "LATE", lateMinutes: 900 },
      { status: "GEO_EXCEPTION", lateMinutes: 15 },
      { status: "MISSING_PUNCH_IN", lateMinutes: 0 },
      { status: "PRESENT", lateMinutes: 0 },
    ];
    const present = sample.filter((r) => isNovaPresentAttendanceStatus(r.status));
    const late = sample.filter((r) => isNovaCredibleLateDay(r.status, r.lateMinutes));
    expect(late.every((r) => isNovaPresentAttendanceStatus(r.status))).toBe(true);
    expect(late.length).toBeLessThanOrEqual(present.length);
    expect(late.map((r) => r.status)).toEqual(
      expect.arrayContaining(["LATE", "MISSING_PUNCH_OUT", "GEO_EXCEPTION"])
    );
  });
});

describe("NI cost — COUNT_FIRST ⊆ preferDeterministic", () => {
  it("every COUNT_FIRST tool is flagged preferDeterministic on its skill", async () => {
    const { NOVA_COUNT_FIRST_TOOLS } = await import("@/lib/ai/nova-money");
    const { novaSkillPrefersDeterministic, hasNovaSkill } = await import(
      "@/lib/nova/skills/registry"
    );
    for (const toolId of NOVA_COUNT_FIRST_TOOLS) {
      expect(hasNovaSkill(toolId), toolId).toBe(true);
      expect(novaSkillPrefersDeterministic(toolId), toolId).toBe(true);
    }
  });
});
