/**
 * P1 self-reliance goldens — NOVA_SELF_RELIANCE_LIGHT_PLAN §9.
 * Catalog near-miss Did-you-mean + sticky Tata + staff/tasks + approvals-for-project + health tags.
 * Prefer Vitest goldens over a new harness. No Think invent / free SQL.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { answerNovaQuery } from "@/lib/ai/nova";
import { resolveNovaFollowUp } from "@/lib/ai/nova-context";
import { composeNovaIntent } from "@/lib/ai/nova-intent";
import { buildNovaPlan, novaPlanHasReadyTools } from "@/lib/ai/nova-plan";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import {
  formatNovaCatalogDidYouMean,
  suggestNovaCatalogPhrases,
  suggestNovaCatalogPhrasesForUser,
} from "@/lib/ai/nova-catalog-suggest";
import {
  buildCatalogNearMissClarifyCard,
  formatNovaClarifyCard,
  matchNovaClarifySelection,
} from "@/lib/ai/nova-clarify";
import {
  buildNovaClarifyAct,
  emptyNovaDialogState,
  refreshNovaConversationSlots,
  shouldKeepNovaBoundEntityOnTopicSwitch,
  utteranceReferencesBoundEntity,
} from "@/lib/nova/dialog-state";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import {
  novaSearchEngineIsDecisive,
  runNovaSearchEngine,
} from "@/lib/nova/nova-search-engine";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
    vendor: { findMany: vi.fn(), findFirst: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    salesInvoice: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    salesReceipt: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    task: { count: vi.fn(), findMany: vi.fn() },
    taskAssignee: { groupBy: vi.fn() },
    staffProfile: { findMany: vi.fn(), findFirst: vi.fn() },
    leaveRequest: { findMany: vi.fn(), count: vi.fn() },
    leaveBalance: { findMany: vi.fn() },
    approvalRequest: { count: vi.fn(), findMany: vi.fn() },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
  },
}));

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
    vendor: { findMany: vi.fn(), findFirst: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), findUnique: vi.fn() },
    salesInvoice: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    salesReceipt: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    task: { count: vi.fn().mockResolvedValue(2), findMany: vi.fn().mockResolvedValue([]) },
    taskAssignee: { groupBy: vi.fn().mockResolvedValue([]) },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    leaveRequest: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    leaveBalance: { findMany: vi.fn().mockResolvedValue([]) },
    approvalRequest: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/ai/llm", () => ({
  isNovaLlmConfigured: () => false,
  novaChatCompletion: vi.fn(),
}));

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "u1",
    email: "t@test.com",
    name: "Tester",
    role: "MANAGER",
    grantedPermissions: [
      "ai.assistant.read",
      "customer.read",
      "project.read",
      "invoice.read",
      "receipt.read",
      "accounts.reports.read",
      "hr.leave.read",
      "hr.leave.create",
      "task.read.self",
      "task.edit.team",
      "approval.read.team",
      "approval.read.all",
      "finance.dashboard.read",
      "director.dashboard",
    ],
    ...overrides,
  } as never;
}

describe("P1 catalog near-miss Did-you-mean", () => {
  it("alias typos resolve to catalog phrases (leave balans, reciepts, aprovals)", () => {
    for (const [q, re] of [
      ["leave balans", /leave balance/i],
      ["today reciepts", /receipt/i],
      ["aprovals", /approval/i],
      ["latecomers", /late comer/i],
      ["hows biz", /how is business/i],
    ] as const) {
      const hits = suggestNovaCatalogPhrases(q, { limit: 3, minScore: 0.28 });
      expect(hits.length, q).toBeGreaterThan(0);
      expect(hits.some((h) => re.test(h.phrase)), q).toBe(true);
    }
  });

  it("formats Did you mean numbered list (chip-parseable)", () => {
    const hits = suggestNovaCatalogPhrases("leave balans", { limit: 3 });
    const line = formatNovaCatalogDidYouMean("leave balans", hits);
    expect(line).toMatch(/Did you mean/i);
    expect(line).toMatch(/1\.\s+\*\*/);
    const card = buildCatalogNearMissClarifyCard(
      "leave balans",
      hits.map((h) => ({ id: h.topicId, label: h.phrase }))
    );
    expect(formatNovaClarifyCard(card)).toMatch(/Did you mean/i);
    expect(matchNovaClarifySelection("1", card.options)?.label).toBeTruthy();
  });

  it("RBAC-filters near-miss suggestions for restricted staff", () => {
    const staff = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "hr.leave.create", "hr.leave.read"],
    });
    const hits = suggestNovaCatalogPhrasesForUser(staff, "leave balans", 4);
    expect(hits.some((h) => /leave/i.test(h.phrase))).toBe(true);
    // Salary requires hr.salary.read — must not appear when absent
    expect(hits.every((h) => !h.tools.includes("salary_summary"))).toBe(true);
  });

  it("Did-you-mean card is selectable for leave balans near-miss", () => {
    const hits = suggestNovaCatalogPhrasesForUser(user(), "leave balans", 3);
    expect(hits.some((h) => /leave balance/i.test(h.phrase))).toBe(true);
    const card = buildCatalogNearMissClarifyCard(
      "leave balans",
      hits.map((h) => ({ id: h.topicId, label: h.phrase }))
    );
    expect(formatNovaClarifyCard(card)).toMatch(/Did you mean/i);
    expect(matchNovaClarifySelection("1", card.options)?.label).toMatch(/leave/i);
  });
});

describe("P1 golden — Tata sticky path", () => {
  const TATA_CLARIFY = [
    'Did you mean one of these for “Tata Steels”?',
    "",
    "1. **Tata Steels** (customer · C0014)",
    "2. **Tata Steels 800 Kg Biogas** (project · C0014-P001)",
    "",
    "Reply with the number (e.g. **1**) or the full name/code.",
  ].join("\n");

  const histBare = [
    { role: "user" as const, content: "TATA STEELS" },
    { role: "assistant" as const, content: TATA_CLARIFY },
  ];

  const tataAct = () =>
    buildNovaClarifyAct({
      kind: "entity",
      originalQuery: "TATA STEELS",
      hint: "Tata Steels",
      options: [
        { n: 1, id: "cust_db_1", label: "Tata Steels", type: "customer", code: "C0014", reply: "C0014" },
        {
          n: 2,
          id: "proj_db_1",
          label: "Tata Steels 800 Kg Biogas",
          type: "project",
          code: "C0014-P001",
          reply: "C0014-P001",
        },
      ],
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: "cust_db_1",
      customerId: "C0014",
      customerName: "Tata Steels",
      companyName: "Tata Steels",
    } as never);
    vi.mocked(prisma.project.findFirst).mockResolvedValue({
      id: "proj_db_1",
      projectId: "C0014-P001",
      projectName: "Tata Steels 800 Kg Biogas",
    } as never);
    vi.mocked(prisma.task.count).mockResolvedValue(2);
    vi.mocked(prisma.task.findMany).mockResolvedValue([] as never);
  });

  it("bare Tata Steels → resolve (not health steal)", () => {
    const slots = runNovaSearchEngine("Tata Steels");
    expect(slots.queryFamily).toBe("resolve");
    expect(slots.tools).toEqual(["search_entities"]);
  });

  it("pick 2 binds project; pending tasks sticky (no search dump)", async () => {
    const dialogState = emptyNovaDialogState({ pendingClarify: tataAct() });
    const bind = await answerNovaQuery(user(), "2", histBare, { dialogState });
    expect(bind.dialogState?.bound?.entityType).toBe("project");
    expect(bind.toolsUsed).toContain("clarify_bound");
    expect(bind.toolsUsed).not.toContain("search_entities");

    const bound = refreshNovaConversationSlots(
      emptyNovaDialogState({
        bound: {
          entityId: "proj_db_1",
          entityType: "project",
          entityCode: "C0014-P001",
          entityLabel: "Tata Steels 800 Kg Biogas",
        },
      }),
      { family: "projects", entityHint: "Tata Steels 800 Kg Biogas", tools: [] }
    );
    const pick = resolveNovaFollowUp("pending tasks", histBare, bound);
    expect(pick.boundEntity?.id).toBe("proj_db_1");
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toContain("tasks_summary");

    const res = await answerNovaQuery(user(), "pending tasks", histBare, { dialogState: bound });
    expect(res.toolsUsed).toContain("tasks_summary");
    expect(res.toolsUsed).not.toContain("search_entities");
    expect(res.answer).not.toMatch(/matching record|Did you mean one of these for .Tata/i);
  });

  it("deixis i this project keeps sticky bind", () => {
    expect(normalizeNovaQuery("PENDING TASKS I THIS PROJECT")).toMatch(/in this project/i);
    const bound = {
      entityId: "proj_db_1",
      entityType: "project" as const,
      entityLabel: "Tata Steels 800 Kg Biogas",
      entityCode: "C0014-P001",
    };
    expect(utteranceReferencesBoundEntity("pending tasks in this project", bound)).toBe(true);
    expect(shouldKeepNovaBoundEntityOnTopicSwitch("pending tasks", "tasks", bound)).toBe(true);
  });
});

describe("P1 golden — staff + tasks", () => {
  it("aalok tasks → entity try then person demotion (tasks_summary, not silent org-wide)", () => {
    const q = "aalok tasks";
    const slots = runNovaSearchEngine(q);
    expect(slots.entityHint?.toLowerCase()).toBe("aalok");
    expect(slots.suppressPersonHint).toBe(true);
    expect(slots.tools).toEqual(["tasks_summary"]);
    expect(composeNovaIntent(q).slots.some((s) => s.kind === "entity" && /aalok/i.test(s.name))).toBe(
      true
    );
    expect(selectNovaTools(q)).toContain("tasks_summary");
    expect(buildNovaPlan(q).tools).toContain("tasks_summary");
  });

  it("tata steel tasks → entity not person", () => {
    const q = "tata steel tasks";
    const slots = runNovaSearchEngine(q);
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steel/);
    expect(slots.suppressPersonHint).toBe(true);
    expect(slots.tools).toEqual(["tasks_summary"]);
    expect(composeNovaIntent(q).slots.some((s) => s.kind === "person")).toBe(false);
  });

  it("tasks in avaada / Avaada project task / avaada tasks → project-scoped entity", () => {
    for (const q of ["tasks in avaada", "Avaada project task", "avaada tasks"] as const) {
      const slots = runNovaSearchEngine(q);
      expect(slots.entityHint, q).toMatch(/avaada/i);
      expect(slots.entityHint, q).not.toMatch(/\b(project|tasks?)\b/i);
      expect(slots.suppressPersonHint, q).toBe(true);
      expect(selectNovaTools(q)[0], q).toMatch(/^(tasks_summary|project_command)$/);
    }
  });
});

describe("P1 golden — approvals for project", () => {
  it("tata steel approvals → approvals_summary + entity hint", () => {
    const q = "tata steel approvals";
    const slots = runNovaSearchEngine(q);
    expect(slots.tools).toEqual(["approvals_summary"]);
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steel/);
    expect(slots.intent).toBe("approvals_for_entity");
    expect(selectNovaTools(q)).toEqual(["approvals_summary"]);
    expect(novaPlanHasReadyTools(buildNovaPlan(q))).toBe(true);
  });

  it("approvals for this project sticky after bind", () => {
    const bound = emptyNovaDialogState({
      bound: {
        entityId: "proj_db_1",
        entityType: "project",
        entityCode: "C0014-P001",
        entityLabel: "Tata Steels 800 Kg Biogas",
      },
      slots: refreshNovaConversationSlots(emptyNovaDialogState(), {
        family: "projects",
        entityHint: "Tata Steels 800 Kg Biogas",
      }).slots,
    });
    const pick = resolveNovaFollowUp("approvals", [], bound);
    expect(pick.boundEntity?.type).toBe("project");
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toContain("approvals_summary");
  });
});

describe("P1 golden — how-is health regression tags", () => {
  it.each([
    ["how is business", "month_performance"],
    ["how's business", "month_performance"],
    ["how are we doing", "month_performance"],
    ["how is sales", "sales_summary"],
    ["how is cash this week?", "cash_banking"],
  ] as const)("%s → %s (not resolve)", (q, tool) => {
    const slots = runNovaSearchEngine(q);
    expect(slots.queryFamily, q).not.toBe("resolve");
    expect(novaSearchEngineIsDecisive(slots), q).toBe(true);
    expect(slots.tools, q).toContain(tool);
    expect(composeNovaIntent(q).tools).toContain(tool);
  });

  it("Tata Steels bare stays resolve (health must not steal)", () => {
    const slots = runNovaSearchEngine("Tata Steels");
    expect(slots.queryFamily).toBe("resolve");
    expect(slots.tools).not.toContain("month_performance");
  });
});
