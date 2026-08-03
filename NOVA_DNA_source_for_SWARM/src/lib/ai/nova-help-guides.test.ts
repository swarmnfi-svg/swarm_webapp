import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";
import {
  answerNovaHelpGuide,
  isNovaHowToGuideQuery,
  isNovaLiveErpDataAsk,
  listNovaHelpGuideIds,
  matchNovaHelpGuideDef,
} from "@/lib/ai/nova-help-guides";
import { detectNovaAwareQuery, answerNovaAwareQuery } from "@/lib/ai/nova-aware";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { isNovaWriteMutationQuery } from "@/lib/ai/nova-write-guards";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";

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

describe("nova-help-guides", () => {
  it("exposes P0 guide ids", () => {
    const ids = listNovaHelpGuideIds();
    expect(ids).toEqual(
      expect.arrayContaining([
        "salary-enter",
        "salary-part-payment",
        "tasks-create",
        "payment-requests",
        "attendance-punch",
        "staff-advances",
        "projects",
        "receipts",
        "billing",
        "leave-request",
        "purchase-bills",
        "migrate-compare",
        "migrate-concepts",
        "migrate-tally",
        "migrate-zoho",
      ])
    );
  });

  it("detects how-to / guide / can-i instructional shapes", () => {
    expect(isNovaHowToGuideQuery("how to enter employee salary")).toBe(true);
    expect(isNovaHowToGuideQuery("guide me to create tasks")).toBe(true);
    expect(isNovaHowToGuideQuery("can i do part payment of salry")).toBe(true);
    expect(isNovaHowToGuideQuery("how to create tasks")).toBe(true);
    expect(isNovaHowToGuideQuery("salary kaise enter kare")).toBe(true);
    expect(isNovaHowToGuideQuery("leave kaise apply kare")).toBe(true);
    expect(isNovaHowToGuideQuery("migrating from tally")).toBe(true);
    expect(isNovaHowToGuideQuery("how is gst different from tally")).toBe(true);
    expect(isNovaHowToGuideQuery("today receipts")).toBe(false);
    expect(isNovaHowToGuideQuery("pending tasks")).toBe(false);
    expect(isNovaHowToGuideQuery("did madhu punch in today")).toBe(false);
    expect(isNovaHowToGuideQuery("punch in times")).toBe(false);
    expect(isNovaHowToGuideQuery("payment requests pending")).toBe(false);
  });

  it("matches compare & migrate guides from Tally / Zoho asks", () => {
    expect(matchNovaHelpGuideDef("migrating from tally")?.id).toBe("migrate-tally");
    expect(matchNovaHelpGuideDef("how is gst different from tally")?.id).toMatch(
      /^migrate-(tally|concepts)$/
    );
    expect(matchNovaHelpGuideDef("where is ledger in empower vs zoho")?.id).toMatch(
      /^migrate-(concepts|zoho)$/
    );
    expect(matchNovaHelpGuideDef("godown in empower")?.id).toBe("migrate-concepts");
    expect(detectNovaAwareQuery("migrating from tally")).toBe("howto_guide");
  });

  it("answers migrating-from-tally with connector + compare grounding", () => {
    const res = answerNovaHelpGuide(
      user({
        role: "ACCOUNTANT",
        grantedPermissions: ["ai.assistant.read", "tally.dashboard.view", "accounts.dashboard.read"],
      }),
      "migrating from tally"
    );
    expect(res).not.toBeNull();
    expect(res!.toolsUsed).toContain("howto_guide");
    expect(res!.toolsUsed).toContain("user_manual");
    expect(res!.answer).toMatch(/Tally|snapshot|Connector|Compare/i);
    expect(res!.links.some((l) => l.href === "/tally" || l.href === "/user-manual")).toBe(true);
  });

  it("does not steal live ERP asks into howto catalog / Aware", () => {
    expect(isNovaLiveErpDataAsk("payment requests pending")).toBe(true);
    expect(isNovaLiveErpDataAsk("did madhu punch in today")).toBe(true);
    expect(isNovaLiveErpDataAsk("punch in times")).toBe(true);
    expect(isNovaLiveErpDataAsk("how to punch in")).toBe(false);
    expect(matchNovaHelpGuideDef("payment requests pending")).toBeNull();
    expect(matchNovaHelpGuideDef("did madhu punch in today")).toBeNull();
    expect(matchNovaHelpGuideDef("punch in times")).toBeNull();
    expect(detectNovaAwareQuery("payment requests pending")).toBeNull();
    expect(detectNovaAwareQuery("did madhu punch in today")).toBeNull();
    expect(detectNovaAwareQuery("punch in times")).toBeNull();
    expect(detectNovaAwareQuery("how to punch in")).toBe("howto_guide");
  });

  it("maps salry typo part-payment to salary-part-payment guide (not party entity)", () => {
    const def = matchNovaHelpGuideDef("can i do part payment of salry");
    expect(def?.id).toBe("salary-part-payment");
    expect(normalizeNovaQuery("can i do part payment of salry")).toMatch(/salary/i);
    expect(normalizeNovaQuery("can i do part payment of salry")).not.toMatch(/salry/i);
  });

  it("maps create-tasks how-to to tasks-create guide", () => {
    expect(matchNovaHelpGuideDef("how to create tasks")?.id).toBe("tasks-create");
    expect(matchNovaHelpGuideDef("guide me to create tasks")?.id).toBe("tasks-create");
  });

  it("Aware routes howto before write-deny / entity resolve", () => {
    expect(detectNovaAwareQuery("can i do part payment of salry")).toBe("howto_guide");
    expect(detectNovaAwareQuery("how to create tasks")).toBe("howto_guide");
    expect(detectNovaAwareQuery("how to enter employee salary")).toBe("howto_guide");
    expect(isNovaWriteMutationQuery("how to create tasks")).toBe(false);
    expect(isNovaWriteMutationQuery("please create this invoice")).toBe(true);
    expect(isNovaWriteMutationQuery("please approve this payment")).toBe(true);
    expect(runNovaSearchEngine("how to create tasks").queryFamily).not.toBe("deny_write");
  });

  it("answers part-payment guide with salary screen steps", () => {
    const res = answerNovaHelpGuide(
      user({
        role: "ACCOUNTANT",
        grantedPermissions: ["ai.assistant.read", "hr.salary.read", "accounts.dashboard.read"],
      }),
      "can i do part payment of salry"
    );
    expect(res).not.toBeNull();
    expect(res!.toolsUsed).toContain("howto_guide");
    expect(res!.toolsUsed).toContain("user_manual");
    expect(res!.answer).toMatch(/Salary|partial|Accounts/i);
    expect(res!.answer).toMatch(/paid in parts|multiple entries|Repeat/i);
    expect(res!.answer).toMatch(/Record Salary Payment/i);
    expect(res!.answer).toMatch(/warning|warn only|still allowed/i);
    expect(res!.answer).not.toMatch(/only\s+\*\*one active\*\*|do not create a second/i);
    expect(res!.answer).toMatch(/read-only|can’t create|cannot create/i);
    expect(res!.answer).not.toMatch(/project or customer match/i);
  });

  it("answers create-tasks guide with Tasks screen (not bare read-only wall)", () => {
    const res = answerNovaAwareQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read", "task.read.self"] }),
      "guide me to create tasks"
    );
    expect(res).not.toBeNull();
    expect(res!.toolsUsed).toContain("howto_guide");
    expect(res!.answer).toMatch(/Tasks/i);
    expect(res!.answer).toMatch(/New task|Personal|Project/i);
    expect(res!.links.some((l) => l.href === "/tasks" || l.href === "/user-manual")).toBe(true);
    // Mentions read-only but still gives steps
    expect(res!.answer).toMatch(/Steps:|Sidebar/i);
  });

  it("answers salary entry how-to", () => {
    const res = answerNovaAwareQuery(
      user({
        role: "ACCOUNTANT",
        grantedPermissions: ["ai.assistant.read", "hr.salary.read"],
      }),
      "how to enter employee salary"
    );
    expect(res?.toolsUsed).toContain("howto_guide");
    expect(res?.answer).toMatch(/Salary/i);
    expect(res?.answer).toMatch(/Accounts|Salary Payments|Record/i);
  });

  it("staff without salary path still gets guidance + permission note", () => {
    const res = answerNovaHelpGuide(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "how to enter employee salary"
    );
    expect(res?.answer).toMatch(/may not have access|permission/i);
    expect(res?.links.some((l) => l.href === "/user-manual")).toBe(true);
  });

  it("payment request / attendance / punch guides match", () => {
    expect(matchNovaHelpGuideDef("how to create a payment request")?.id).toBe(
      "payment-requests"
    );
    expect(matchNovaHelpGuideDef("how to punch in")?.id).toBe("attendance-punch");
    expect(matchNovaHelpGuideDef("how to request staff advance")?.id).toBe("staff-advances");
  });
});

describe("answerNovaQuery howto integration", () => {
  it("routes failing production asks to howto_guide (not entity/write)", async () => {
    const { answerNovaQuery } = await import("@/lib/ai/nova");
    const accountant = user({
      role: "ACCOUNTANT",
      grantedPermissions: [
        "ai.assistant.read",
        "hr.salary.read",
        "accounts.dashboard.read",
        "accounts.read",
      ],
    });
    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "task.read.self", "task.write.self"],
    });

    const part = await answerNovaQuery(accountant, "can i do part payment of salry");
    expect(part.toolsUsed).toContain("howto_guide");
    expect(part.toolsUsed).not.toContain("search_entities");
    expect(part.toolsUsed).not.toContain("read_only_guard");
    expect(part.answer).toMatch(/Salary|partial|part/i);
    expect(part.answer).toMatch(/paid in parts|multiple entries|Repeat/i);
    expect(part.answer).not.toMatch(/only\s+\*\*one active\*\*|do not create a second/i);
    expect(part.answer).not.toMatch(/project or customer match/i);

    const tasks = await answerNovaQuery(staff, "guide me to create tasks");
    expect(tasks.toolsUsed).toContain("howto_guide");
    expect(tasks.toolsUsed).not.toContain("read_only_guard");
    expect(tasks.answer).toMatch(/Tasks|New task/i);
    expect(tasks.answer).toMatch(/Steps:|Sidebar/i);

    const salary = await answerNovaQuery(accountant, "how to enter employee salary");
    expect(salary.toolsUsed).toContain("howto_guide");
    expect(salary.answer).toMatch(/Salary Payments|Accounts/i);
  });
});
