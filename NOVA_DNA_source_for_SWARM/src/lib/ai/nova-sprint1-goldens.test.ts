/**
 * Sprint 1 — conversational goldens + slot combo matrix.
 * Absorb DialogState slot TTL / topic-switch; director multi-turn (Why Tata…).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { answerNovaQuery } from "@/lib/ai/nova";
import { resolveNovaFollowUp } from "@/lib/ai/nova-context";
import { validateNovaSearchSlots } from "@/lib/nova/nova-search-engine";
import {
  applyNovaTopicSwitchToDialogState,
  buildNovaClarifyAct,
  canNovaInheritConversationSlots,
  emptyNovaDialogState,
  expireNovaDialogSlots,
  refreshNovaConversationSlots,
} from "@/lib/nova/dialog-state";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
    vendor: { findMany: vi.fn(), findFirst: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    salesInvoice: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    salesReceipt: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    staffProfile: { findMany: vi.fn(), findFirst: vi.fn() },
    leaveRequest: { findMany: vi.fn(), count: vi.fn() },
    leaveBalance: { findMany: vi.fn() },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
  },
}));

vi.mock("@/lib/ai/llm", () => ({
  isNovaLlmConfigured: () => false,
  novaChatCompletion: vi.fn(),
}));

function directorUser() {
  return {
    id: "u1",
    email: "dir@test.com",
    name: "Director",
    role: "DIRECTOR",
    grantedPermissions: [
      "ai.assistant.read",
      "customer.read",
      "project.read",
      "invoice.read",
      "accounts.reports.read",
      "director.dashboard",
      "finance.dashboard.read",
    ],
  } as never;
}

const ALLOW = new Set([
  "sales_summary",
  "receipts_summary",
  "overdue_invoices",
  "customer_outstanding",
  "attendance_late_summary",
  "documents_search",
  "salary_summary",
  "approvals_summary",
  "payment_requests_summary",
  "director_dashboard_summary",
  "search_entities",
]);

describe("Sprint 1 slot combo matrix", () => {
  it("resolve family keeps identity search tools only", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "resolve",
        queryFamily: "resolve",
        tools: ["sales_summary", "search_entities"],
        confidence: "high",
      },
      ALLOW
    );
    expect(v?.tools).toEqual(["search_entities"]);
    expect(v?.tools).not.toContain("sales_summary");
  });

  it("approvals family strips sales + attendance", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "approvals",
        queryFamily: "approvals",
        tools: ["approvals_summary", "sales_summary", "attendance_late_summary"],
        confidence: "high",
      },
      ALLOW
    );
    expect(v?.tools).toEqual(["approvals_summary"]);
  });

  it("attendance + money mix collapses to family", () => {
    const att = validateNovaSearchSlots(
      {
        intent: "late",
        queryFamily: "attendance",
        tools: ["attendance_late_summary", "sales_summary"],
        confidence: "high",
      },
      ALLOW
    );
    expect(att?.tools).toEqual(["attendance_late_summary"]);

    const money = validateNovaSearchSlots(
      {
        intent: "sales",
        queryFamily: "money",
        tools: ["sales_summary", "attendance_late_summary"],
        confidence: "high",
      },
      ALLOW
    );
    expect(money?.tools).toEqual(["sales_summary"]);
  });

  it("salary metric drops customer entity", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "salary",
        queryFamily: "money",
        entityType: "customer",
        entityHint: "Tata",
        metric: "salary",
        tools: ["salary_summary", "sales_summary"],
        confidence: "high",
      },
      ALLOW
    );
    expect(v?.entityType).toBeNull();
    expect(v?.entityHint).toBeNull();
    expect(v?.tools).toEqual(["salary_summary"]);
  });

  it("money + document entity clears party/document bind", () => {
    const v = validateNovaSearchSlots(
      {
        intent: "sales",
        queryFamily: "money",
        entityType: "document",
        entityHint: "PO-1",
        tools: ["sales_summary", "documents_search"],
        confidence: "high",
      },
      ALLOW
    );
    expect(v?.entityType).toBeNull();
    expect(v?.tools).toContain("sales_summary");
  });
});

describe("Sprint 1 conversational goldens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null as never);
  });

  it("month ask → Why Tata binds bound customer without re-fuzzy clarify", async () => {
    const dialogState = refreshNovaConversationSlots(
      emptyNovaDialogState({
        bound: {
          entityType: "customer",
          entityId: "cust_tata",
          entityLabel: "Tata Steels",
          entityCode: "C0014",
        },
      }),
      {
        family: "money",
        metric: "month_performance",
        tools: ["sales_summary", "receipts_summary", "overdue_invoices"],
        periodLabel: "this month",
        periodGrain: "month",
        periodSource: "explicit",
        entityHint: "Tata Steels",
      }
    );

    const follow = resolveNovaFollowUp(
      "Why Tata?",
      [
        { role: "user", content: "How is this month going?" },
        {
          role: "assistant",
          content:
            "July is mixed. Attention: Tata Steels overdue ₹2,50,000 across 3 invoices.",
        },
      ],
      dialogState
    );

    // Must not invent a fresh soft-fuzzy clarify path for the already-bound party
    expect(follow.boundEntity?.label).toMatch(/Tata/i);
    expect(follow.boundEntity?.type).toBe("customer");
    expect(canNovaInheritConversationSlots(dialogState, { family: "money" })).toBe(true);

    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: "cust_tata",
      customerId: "C0014",
      customerName: "Tata Steels",
      companyName: null,
    } as never);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 0, balanceAmount: 250000 },
      _count: 3,
    } as never);
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(3);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([] as never);

    const res = await answerNovaQuery(
      directorUser(),
      "Why is Tata in attention?",
      [
        { role: "user", content: "How is this month going?" },
        {
          role: "assistant",
          content: "July attention: Tata Steels has overdue invoices.",
        },
      ],
      { dialogState }
    );
    expect(res.answer).not.toMatch(/Did you mean/i);
    expect(res.toolsUsed ?? []).not.toContain("clarify");
  });

  it("this month → and last month keeps money family, switches period", () => {
    const state = refreshNovaConversationSlots(emptyNovaDialogState(), {
      family: "money",
      metric: "sales",
      tools: ["sales_summary"],
      periodLabel: "this month",
      periodGrain: "month",
      periodSource: "explicit",
    });
    const next = applyNovaTopicSwitchToDialogState(state, "and last month");
    // Same family — slots retained but period contradicted → period cleared for re-bind
    expect(next.slots?.family).toBe("money");
    expect(next.slots?.periodLabel).toBeNull();

    const follow = resolveNovaFollowUp(
      "and last month",
      [
        { role: "user", content: "sales this month" },
        { role: "assistant", content: "Sales this month: ₹10,00,000." },
      ],
      next
    );
    expect(follow.isFollowUp || (follow.plan?.tools ?? []).includes("sales_summary")).toBe(true);
  });

  it("slot TTL expiry stops sticky receipts inherit", () => {
    const stale = refreshNovaConversationSlots(
      emptyNovaDialogState(),
      {
        family: "money",
        metric: "receipts",
        tools: ["receipts_summary"],
        periodLabel: "today",
        periodGrain: "day",
      },
      { now: new Date("2026-07-13T10:00:00.000Z") }
    );
    const expired = expireNovaDialogSlots(stale, new Date("2026-07-13T10:25:00.000Z"));
    expect(canNovaInheritConversationSlots(expired, { family: "money" })).toBe(false);
    const bare = resolveNovaFollowUp("tata", [], expired);
    expect(bare.isFollowUp).toBe(false);
  });

  it("pending clarify index bind still works after month context", () => {
    const act = buildNovaClarifyAct({
      kind: "entity",
      originalQuery: "tata",
      options: [
        { n: 1, id: "cust_tata", label: "Tata Steels", type: "customer", code: "C0014", reply: "C0014" },
        {
          n: 2,
          id: "proj_1",
          label: "Tata plant",
          type: "project",
          code: "C0014-P001",
          reply: "C0014-P001",
        },
      ],
      resume: {
        tools: ["customer_outstanding", "overdue_invoices"],
        metric: "outstanding",
        periodLabel: "this month",
        periodGrain: "month",
        periodSource: "follow_up",
        module: "receivables",
        routingQuery: "tata outstanding this month",
      },
    });
    const dialogState = refreshNovaConversationSlots(
      emptyNovaDialogState({ pendingClarify: act }),
      {
        family: "money",
        metric: "outstanding",
        tools: ["customer_outstanding"],
        periodLabel: "this month",
        periodGrain: "month",
      }
    );
    const pick = resolveNovaFollowUp(
      "1",
      [
        { role: "user", content: "How is this month going?" },
        { role: "assistant", content: "Attention on overdue — which Tata?" },
        { role: "user", content: "tata" },
        {
          role: "assistant",
          content: "Did you mean?\n1. Tata Steels\n2. Tata plant",
        },
      ],
      dialogState
    );
    expect(pick.isFollowUp).toBe(true);
    expect(pick.boundEntity?.type).toBe("customer");
    expect(pick.plan?.period?.label).toMatch(/this month/i);
  });
});
