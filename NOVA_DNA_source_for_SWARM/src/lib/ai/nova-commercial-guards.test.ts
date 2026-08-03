/**
 * Dual write checkpoints + answer guards + sensitive entity / slot combo smoke.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  isNovaWriteMutationQuery,
  preflightNovaWriteDeny,
  guardNovaPlanWrite,
} from "@/lib/ai/nova-write-guards";
import {
  guardNovaAnswer,
  llmPreservesPrimaryCounts,
} from "@/lib/ai/nova-answer-guard";
import { validateNovaSearchSlots } from "@/lib/nova/nova-search-engine";
import {
  isNovaSensitiveEntityResolveQuery,
  resolveNovaEntityHint,
} from "@/lib/ai/nova-tools";
import { answerNovaQuery } from "@/lib/ai/nova";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
    vendor: { findMany: vi.fn(), findFirst: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]) },
    novaEntityAlias: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/ai/llm", () => ({
  isNovaLlmConfigured: () => false,
  novaChatCompletion: vi.fn(),
}));

function staffAi() {
  return {
    id: "u1",
    email: "t@test.com",
    name: "Tester",
    role: "STAFF",
    grantedPermissions: ["ai.assistant.read", "customer.read", "invoice.read"],
  } as never;
}

describe("dual write checkpoints", () => {
  it("detects create / approve / mark paid", () => {
    // Create+module noun prefers howto guide path (not write mutation)
    expect(isNovaWriteMutationQuery("create invoice for Avaada")).toBe(false);
    expect(isNovaWriteMutationQuery("how to create tasks")).toBe(false);
    expect(isNovaWriteMutationQuery("please approve this payment request")).toBe(true);
    expect(isNovaWriteMutationQuery("mark paid this invoice")).toBe(true);
    expect(isNovaWriteMutationQuery("delete this purchase bill")).toBe(true);
    expect(isNovaWriteMutationQuery("pending approvals")).toBe(false);
  });

  it("preflight returns read_only_guard + write_preflight", () => {
    const deny = preflightNovaWriteDeny("delete this purchase bill");
    expect(deny?.toolsUsed).toEqual(["read_only_guard", "write_preflight"]);
    expect(deny?.answer).toMatch(/read-only/i);
  });

  it("post-plan guard retags deny_write clarify", () => {
    const deny = guardNovaPlanWrite(
      {
        tools: [],
        clarifyReason:
          "NOVA AI is **read-only**. I can summarise and look up data, but I cannot create, edit, approve, pay, or delete records.",
      },
      "help"
    );
    expect(deny?.toolsUsed).toContain("write_plan_guard");
  });

  it("answerNovaQuery prefers howto guide over bare write-deny for create-shaped asks", async () => {
    const res = await answerNovaQuery(staffAi(), "create invoice for Avaada");
    // Instructional/create-shaped → module guide (not entity resolve, not bare refuse-only)
    expect(res.toolsUsed).toContain("howto_guide");
    expect(res.toolsUsed).not.toContain("search_entities");
    expect(res.answer).toMatch(/Billing|invoice|User Manual/i);
    expect(res.answer).toMatch(/read-only|can’t create|cannot create/i);
  });

  it("answerNovaQuery still write-denies imperative deletes", async () => {
    const res = await answerNovaQuery(staffAi(), "delete this purchase bill");
    expect(res.toolsUsed).toContain("read_only_guard");
    expect(res.toolsUsed).toContain("write_preflight");
  });
});

describe("guardNovaAnswer", () => {
  it("rejects invented ₹ and falls back deterministic", () => {
    const facts = [
      {
        tool: "sales_summary",
        ok: true,
        data: { grandTotalInr: "₹1,00,000.00", grandTotal: 100000, period: "Jul 2026" },
      },
    ];
    const bad = guardNovaAnswer({
      query: "sales this month",
      facts,
      text: "Sales were ₹10,00,000 this month.",
      userFirstName: "Tester",
    });
    expect(bad.failed).toBe(true);
    expect(bad.failedGuard).toBe("answer_money_guard");
    expect(bad.toolsUsed).toContain("deterministic");
  });

  it("bank: operational-only narration passes (no false inconsistently)", () => {
    const facts = [
      {
        tool: "bank_accounts_summary",
        ok: true,
        data: {
          accountCount: 2,
          balancesVisible: true,
          totalOperationalBalanceInr: "₹1,84,24,601.00",
          totalBookBalanceInr: "₹1,80,00,000.00",
          totalStatementBalanceInr: "₹1,75,00,000.00",
        },
      },
    ];
    const ok = guardNovaAnswer({
      query: "bank balance",
      facts,
      text: "Operational total is ₹1,84,24,601.00 across 2 accounts.",
      userFirstName: "Tester",
    });
    expect(ok.failed).toBe(false);
    expect(ok.text).not.toMatch(/inconsistently/i);
  });

  it("bank: 10× operational misread still fails", () => {
    const facts = [
      {
        tool: "bank_accounts_summary",
        ok: true,
        data: {
          totalOperationalBalanceInr: "₹1,84,24,601.00",
          totalBookBalanceInr: "₹1,80,00,000.00",
        },
      },
    ];
    const bad = guardNovaAnswer({
      query: "bank balance",
      facts,
      text: "Operational total is ₹18,42,46,010.00.",
      userFirstName: "Tester",
    });
    expect(bad.failed).toBe(true);
    expect(bad.failedGuard).toBe("answer_money_guard");
  });

  it("count guard catches 10× misread", () => {
    expect(
      llmPreservesPrimaryCounts("There are 100 awaiting.", [
        { tool: "payment_requests_summary", ok: true, data: { awaitingActionCount: 10 } },
      ])
    ).toBe(false);
    expect(
      llmPreservesPrimaryCounts("There are 10 awaiting.", [
        { tool: "payment_requests_summary", ok: true, data: { awaitingActionCount: 10 } },
      ])
    ).toBe(true);
    // Punch clocks must not look like 10× of a count of 1.
    expect(
      llmPreservesPrimaryCounts(
        "MD Arif Ansari punched in at 10:06 am (7 min late).",
        [{ tool: "attendance_late_summary", ok: true, data: { latePeopleCount: 1 } }]
      )
    ).toBe(true);
  });
});

describe("sensitive entity resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("flags money/salary/bank queries", () => {
    expect(isNovaSensitiveEntityResolveQuery("Avaada sales this month")).toBe(true);
    expect(isNovaSensitiveEntityResolveQuery("salary for Zeeshan")).toBe(true);
    expect(isNovaSensitiveEntityResolveQuery("bank balance")).toBe(true);
    expect(isNovaSensitiveEntityResolveQuery("Tata Steels projects")).toBe(false);
  });

  it("soft contains single hit clarifies when sensitiveMoney", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "c1",
        customerId: "C0001",
        customerName: "Avaada Energy",
        companyName: null,
      },
    ] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);

    const soft = await resolveNovaEntityHint("Avaada", staffAi(), { sensitiveMoney: true });
    expect(soft.kind).toBe("ambiguous");

    const exact = await resolveNovaEntityHint("C0001", staffAi(), { sensitiveMoney: true });
    expect(exact.kind).toBe("ok");
  });

  it("strips trailing project/task before lookup (Avaada project)", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      { id: "p1", projectId: "P-AVA", projectName: "AvAAda" },
    ] as never);

    const hit = await resolveNovaEntityHint("Avaada project", staffAi(), {
      preferTypes: ["project", "customer"],
    });
    expect(hit.kind).toBe("ok");
    if (hit.kind === "ok") {
      expect(hit.entity.type).toBe("project");
      expect(hit.entity.name).toMatch(/avaada/i);
    }
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              projectName: { contains: "Avaada", mode: "insensitive" },
            }),
          ]),
        }),
      })
    );
  });

  it("party + staff soft collision clarifies when includeStaff (never silent party bind)", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "c-arif",
        customerId: "C-ARIF",
        customerName: "Arif Traders",
        companyName: null,
      },
    ] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      {
        id: "s-arif",
        staffCode: "STF-1",
        fullName: "Arif Ansari",
        userId: "u-arif",
      },
    ] as never);

    const admin = {
      ...staffAi(),
      role: "ADMIN",
      grantedPermissions: ["ai.assistant.read", "customer.read", "staff.read"],
    } as never;

    const hit = await resolveNovaEntityHint("Arif", admin, { includeStaff: true });
    expect(hit.kind).toBe("ambiguous");
    if (hit.kind === "ambiguous") {
      const types = hit.options.map((o) => o.type);
      expect(types).toContain("customer");
      expect(types).toContain("staff");
    }
  });
});

describe("slot combo validation", () => {
  const allow = new Set([
    "sales_summary",
    "attendance_late_summary",
    "documents_search",
    "salary_summary",
  ]);

  it("attendance family strips money tools", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "late",
        queryFamily: "attendance",
        tools: ["attendance_late_summary", "sales_summary"],
        confidence: "high",
      },
      allow
    );
    expect(v?.tools).toEqual(["attendance_late_summary"]);
  });

  it("document entity strips money tools", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "docs",
        queryFamily: "search",
        entityType: "document",
        tools: ["documents_search", "sales_summary"],
        confidence: "high",
      },
      allow
    );
    expect(v?.tools).toEqual(["documents_search"]);
  });

  it("deny_write clears tools", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "create",
        queryFamily: "deny_write",
        tools: ["sales_summary"],
        confidence: "high",
      },
      allow
    );
    expect(v?.tools).toEqual([]);
  });

  it("money + attendance mix strips attendance", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "sales",
        queryFamily: "money",
        tools: ["sales_summary", "attendance_late_summary"],
        confidence: "high",
      },
      allow
    );
    expect(v?.tools).toEqual(["sales_summary"]);
  });
});
