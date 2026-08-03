/**
 * NovaDialogState / ClarifyResolver — Tata Steels clarify loop + bind-by-id.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { answerNovaQuery } from "@/lib/ai/nova";
import { inferNovaQuery } from "@/lib/ai/nova-inference";
import { lastFreshMoneyUserText, resolveNovaFollowUp } from "@/lib/ai/nova-context";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import {
  applyNovaTopicSwitchToDialogState,
  buildNovaClarifyAct,
  bumpNovaConversationSlotTurn,
  canNovaInheritConversationSlots,
  emptyNovaDialogState,
  expireNovaDialogSlots,
  NOVA_CONVERSATION_SLOT_MAX_TURNS,
  refreshNovaConversationSlots,
  resolveNovaClarifyReply,
  setNovaLastSavablePack,
  shouldKeepNovaBoundEntityOnTopicSwitch,
  utteranceReferencesBoundEntity,
} from "@/lib/nova/dialog-state";
import { buildNovaPackResult, selectNovaPackAttentions } from "@/lib/nova/pack-result";
import { MONTH_PERFORMANCE_PACK_VERSION } from "@/lib/nova/packs/month-performance";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
    vendor: { findMany: vi.fn(), findFirst: vi.fn() },
    project: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() },
    salesInvoice: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    salesReceipt: { aggregate: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    task: { count: vi.fn(), findMany: vi.fn() },
    staffProfile: { findMany: vi.fn(), findFirst: vi.fn() },
    leaveRequest: { findMany: vi.fn(), count: vi.fn() },
    leaveBalance: { findMany: vi.fn() },
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
    role: "STAFF",
    grantedPermissions: [
      "ai.assistant.read",
      "customer.read",
      "project.read",
      "invoice.read",
      "accounts.reports.read",
      "hr.leave.read",
    ],
    ...overrides,
  } as never;
}

const TATA_CLARIFY = [
  'Did you mean one of these for “Tata Steels”?',
  "",
  "1. **Tata Steels** (customer · C0014)",
  "2. **Tata Steels 800 Kg Biogas** (project · C0014-P001)",
  "",
  "Reply with the number (e.g. **1**) or the full name/code.",
].join("\n");

const histProjects = [
  { role: "user" as const, content: "Tata Steels projects" },
  { role: "assistant" as const, content: TATA_CLARIFY },
];

describe("NovaClarifyResolver", () => {
  it("binds index / code / type deixis against ClarifyAct", () => {
    const act = buildNovaClarifyAct({
      kind: "entity",
      originalQuery: "Tata Steels projects",
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
    expect(resolveNovaClarifyReply("1", act).kind).toBe("matched");
    expect(resolveNovaClarifyReply("C0014", act).kind).toBe("matched");
    expect(resolveNovaClarifyReply("the customer", act).kind).toBe("matched");
    expect(resolveNovaClarifyReply("the project", act).kind).toBe("matched");
    expect(resolveNovaClarifyReply("9", act).kind).toBe("reask");
    expect(resolveNovaClarifyReply("yes", act).kind).toBe("reask");
    expect(resolveNovaClarifyReply("leave balance", act).kind).toBe("cancel");
  });
});

describe("period preserved across clarify pick (today receipts → tata → 1)", () => {
  it("resume.periodLabel today survives entity pick — not widened to month", () => {
    const act = buildNovaClarifyAct({
      kind: "entity",
      originalQuery: "tata",
      hint: "tata",
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
      resume: {
        tools: ["receipts_summary"],
        metric: "receipts",
        periodLabel: "today",
        periodGrain: "day",
        periodSource: "explicit",
        module: "receipts",
        routingQuery: "tata receipts today",
      },
    });
    const dialogState = emptyNovaDialogState({ pendingClarify: act });
    const pick = resolveNovaFollowUp("1", [], dialogState);
    expect(pick.isFollowUp).toBe(true);
    expect(pick.boundEntity?.type).toBe("customer");
    expect(pick.plan?.period?.label).toMatch(/today/i);
    expect(pick.plan?.period?.grain).toBe("day");
    expect(pick.plan?.period?.label).not.toMatch(/july|this month|month/i);
    expect(pick.query).toMatch(/today/i);
    expect(pick.query).not.toMatch(/this month/i);
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toContain("receipts_summary");
  });

  it("without resume period, bare originalQuery must not invent July month silently when routing has today", () => {
    const act = buildNovaClarifyAct({
      kind: "entity",
      originalQuery: "tata receipts today",
      hint: "tata",
      options: [
        { n: 1, id: "cust_db_1", label: "Tata Steels", type: "customer", code: "C0014", reply: "C0014" },
      ],
      resume: {
        tools: ["receipts_summary"],
        metric: "receipts",
        periodLabel: "today",
        periodGrain: "day",
        periodSource: "follow_up",
        routingQuery: "tata receipts today",
      },
    });
    const pick = resolveNovaFollowUp("1", [], emptyNovaDialogState({ pendingClarify: act }));
    expect(pick.plan?.period?.grain).toBe("day");
    expect(String(pick.plan?.period?.label ?? "")).toMatch(/today/i);
  });
});

describe("Tata Steels clarify → bind-by-id (no re-fuzzy loop)", () => {
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
    vi.mocked(prisma.project.count).mockResolvedValue(2);
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      {
        projectId: "C0014-P001",
        projectName: "Tata Steels 800 Kg Biogas",
        status: "ACTIVE",
        projectValue: 100000,
        createdAt: new Date(),
        customer: { customerName: "Tata Steels" },
      },
      {
        projectId: "C0014-P002",
        projectName: "Tata Steels Expansion",
        status: "ACTIVE",
        projectValue: 50000,
        createdAt: new Date(),
        customer: { customerName: "Tata Steels" },
      },
    ] as never);
  });

  it("follow-up 1 binds customer C0014 and plans projects_summary", () => {
    const pick = resolveNovaFollowUp("1", histProjects);
    expect(pick.isFollowUp).toBe(true);
    expect(pick.boundEntity?.type).toBe("customer");
    expect(pick.boundEntity?.code ?? pick.boundEntity?.id).toMatch(/C0014|cust/i);
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/projects_summary|project_command/)])
    );
    expect(pick.clarifyReask).toBeUndefined();
  });

  it("follow-up 2 binds project", () => {
    const pick = resolveNovaFollowUp("2", histProjects);
    expect(pick.boundEntity?.type).toBe("project");
    expect(pick.boundEntity?.code ?? pick.plan?.entityCode).toMatch(/C0014-P001|proj/i);
  });

  it("answerNovaQuery 1 → projects_summary without clarify loop", async () => {
    // If fuzzy re-ran on "Tata Steels", both customer+project would return → clarify again.
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "cust_db_1",
        customerId: "C0014",
        customerName: "Tata Steels",
        companyName: "Tata Steels",
      },
    ] as never);
    vi.mocked(prisma.project.findMany).mockImplementation(async (args: { where?: { id?: string; customerId?: string } }) => {
      // Bound path filters by customerId — return customer projects only
      if (args?.where && ("customerId" in (args.where as object) || "id" in (args.where as object))) {
        return [
          {
            projectId: "C0014-P001",
            projectName: "Tata Steels 800 Kg Biogas",
            status: "ACTIVE",
            projectValue: 100000,
            createdAt: new Date(),
            customer: { customerName: "Tata Steels" },
          },
        ] as never;
      }
      // Fuzzy would also find the project by name — must not be called for bound path
      return [
        {
          projectId: "C0014-P001",
          projectName: "Tata Steels 800 Kg Biogas",
          status: "ACTIVE",
          projectValue: 100000,
          createdAt: new Date(),
          customer: { customerName: "Tata Steels" },
        },
      ] as never;
    });

    const res = await answerNovaQuery(user(), "1", histProjects);
    expect(res.toolsUsed.some((t) => /projects_summary|project_command/i.test(t))).toBe(true);
    expect(res.toolsUsed).toContain("clarify_bound");
    expect(res.toolsUsed).not.toContain("clarify");
    expect(res.answer).not.toMatch(/Did you mean/i);
  });

  it("answerNovaQuery 2 binds project without re-clarify", async () => {
    const res = await answerNovaQuery(user(), "2", histProjects);
    expect(res.toolsUsed).not.toContain("clarify");
    expect(res.answer).not.toMatch(/Did you mean/i);
    expect(res.toolsUsed.some((t) => t === "projects_summary" || t === "clarify_bound")).toBe(true);
  });

  it("topic switch cancels pending and does not entity-clarify", async () => {
    vi.mocked(prisma.leaveBalance.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(0);
    const dialogState = emptyNovaDialogState({
      pendingClarify: buildNovaClarifyAct({
        kind: "entity",
        originalQuery: "Tata Steels projects",
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
      }),
    });
    const res = await answerNovaQuery(user(), "leave balance", histProjects, { dialogState });
    expect(res.answer).not.toMatch(/Did you mean one of these for .Tata/i);
    expect(res.dialogState?.pendingClarify).toBeNull();
  });
});

describe("conversation slot TTL + topic-switch", () => {
  const receiptsHist = [
    { role: "user" as const, content: "today receipts" },
    {
      role: "assistant" as const,
      content: "Today's receipts total ₹0. Top customer mentioned earlier: Tata Steels.",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.customer.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.project.findFirst).mockResolvedValue(null as never);
  });

  it("today receipts → who was late → attendance, not sticky receipts", () => {
    const inf = inferNovaQuery("who was late", receiptsHist);
    expect(inf.allowFollowUpMerge).toBe(false);
    expect(inf.reason).toMatch(/topic_switch|erp_signal/);

    const follow = resolveNovaFollowUp("who was late", receiptsHist);
    expect(follow.isFollowUp).toBe(false);

    const moneySlots = refreshNovaConversationSlots(emptyNovaDialogState(), {
      family: "money",
      metric: "receipts",
      tools: ["receipts_summary"],
      periodLabel: "today",
      periodGrain: "day",
      periodSource: "explicit",
      entityHint: "Tata Steels",
    });
    const switched = applyNovaTopicSwitchToDialogState(moneySlots, "who was late");
    expect(switched.slots).toBeNull();
    expect(switched.bound).toBeUndefined();

    expect(selectNovaTools(normalizeNovaQuery("who was late"))).toContain(
      "attendance_late_summary"
    );
    expect(selectNovaTools(normalizeNovaQuery("who was late"))).not.toContain("receipts_summary");
  });

  it("today receipts → tata → 1 still today receipts (period preserve)", () => {
    const act = buildNovaClarifyAct({
      kind: "entity",
      originalQuery: "tata",
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
      resume: {
        tools: ["receipts_summary"],
        metric: "receipts",
        periodLabel: "today",
        periodGrain: "day",
        periodSource: "explicit",
        module: "receipts",
        routingQuery: "tata receipts today",
      },
    });
    const dialogState = refreshNovaConversationSlots(
      emptyNovaDialogState({ pendingClarify: act }),
      {
        family: "money",
        metric: "receipts",
        tools: ["receipts_summary"],
        periodLabel: "today",
        periodGrain: "day",
        periodSource: "explicit",
      }
    );
    const pick = resolveNovaFollowUp("1", receiptsHist, dialogState);
    expect(pick.isFollowUp).toBe(true);
    expect(pick.boundEntity?.type).toBe("customer");
    expect(pick.plan?.period?.label).toMatch(/today/i);
    expect(pick.plan?.period?.grain).toBe("day");
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toContain("receipts_summary");
  });

  it("after TTL / many turns, bare tata does not inherit stale receipts month", () => {
    const stale = refreshNovaConversationSlots(
      emptyNovaDialogState(),
      {
        family: "money",
        metric: "receipts",
        tools: ["receipts_summary"],
        periodLabel: "this month",
        periodGrain: "month",
        periodSource: "default",
      },
      { now: new Date("2026-07-13T10:00:00.000Z") }
    );
    // Wall-clock expiry
    const expired = expireNovaDialogSlots(
      stale,
      new Date("2026-07-13T10:25:00.000Z") // > 20 min
    );
    expect(expired.slots).toBeNull();
    expect(canNovaInheritConversationSlots(expired, { family: "money" })).toBe(false);

    const manyTurns: { role: "user" | "assistant"; content: string }[] = [...receiptsHist];
    for (let i = 0; i < 12; i++) {
      manyTurns.push({ role: "user", content: `ok thanks ${i}` });
      manyTurns.push({ role: "assistant", content: "You're welcome." });
    }
    expect(lastFreshMoneyUserText(manyTurns)).toBe("");
    const bare = resolveNovaFollowUp("tata", manyTurns, expired);
    expect(bare.isFollowUp).toBe(false);
    expect(bare.forcedTools ?? []).not.toContain("receipts_summary");
    expect(bare.plan?.metric).not.toBe("receipts");
  });

  it("turn-count TTL clears slots at MAX_TURNS", () => {
    let state = refreshNovaConversationSlots(emptyNovaDialogState(), {
      family: "money",
      metric: "receipts",
      tools: ["receipts_summary"],
      periodLabel: "today",
      periodGrain: "day",
    });
    for (let i = 0; i < NOVA_CONVERSATION_SLOT_MAX_TURNS; i++) {
      state = bumpNovaConversationSlotTurn(state);
    }
    expect(state.slots).toBeNull();
    expect(canNovaInheritConversationSlots(state, { family: "money" })).toBe(false);
  });

  it("slot wall-clock TTL clears lastSavablePack ₹ snapshot from DialogState", () => {
    const pack = buildNovaPackResult({
      packId: "month_performance",
      packVersion: MONTH_PERFORMANCE_PACK_VERSION,
      period: {
        label: "Jul 2026",
        grain: "month",
        calendarKind: "calendar_month",
        source: "explicit",
      },
      dataAsOf: "2026-07-13T00:00:00.000Z",
      metrics: [],
      facts: [],
      findings: [],
      attentions: selectNovaPackAttentions([]),
      charts: [],
      links: [],
      warnings: [],
      omittedNotes: [],
      narrativeHints: [],
    });
    const capturedAt = new Date("2026-07-13T10:00:00.000Z");
    let state = refreshNovaConversationSlots(
      emptyNovaDialogState(),
      {
        family: "money",
        metric: "receipts",
        tools: ["receipts_summary"],
        periodLabel: "this month",
        periodGrain: "month",
      },
      { now: capturedAt }
    );
    state = setNovaLastSavablePack(state, pack, "July sales ₹12,50,000", { now: capturedAt });
    expect(state.lastSavablePack?.narrative).toMatch(/₹/);

    const expired = expireNovaDialogSlots(state, new Date("2026-07-13T10:25:00.000Z"));
    expect(expired.slots).toBeNull();
    expect(expired.lastSavablePack).toBeNull();
  });

  it("lastSavablePack pack TTL clears even when conversation slots still live", () => {
    const pack = buildNovaPackResult({
      packId: "month_performance",
      packVersion: MONTH_PERFORMANCE_PACK_VERSION,
      period: {
        label: "Jul 2026",
        grain: "month",
        calendarKind: "calendar_month",
        source: "explicit",
      },
      dataAsOf: "2026-07-13T00:00:00.000Z",
      metrics: [],
      facts: [],
      findings: [],
      attentions: selectNovaPackAttentions([]),
      charts: [],
      links: [],
      warnings: [],
      omittedNotes: [],
      narrativeHints: [],
    });
    const packCaptured = new Date("2026-07-13T09:00:00.000Z");
    let state = setNovaLastSavablePack(
      emptyNovaDialogState(),
      pack,
      "Stale ₹ pack",
      { now: packCaptured }
    );
    state = refreshNovaConversationSlots(
      state,
      {
        family: "money",
        metric: "receipts",
        tools: ["receipts_summary"],
        periodLabel: "today",
        periodGrain: "day",
      },
      { now: new Date("2026-07-13T10:00:00.000Z") }
    );
    expect(state.slots).not.toBeNull();
    expect(state.lastSavablePack).not.toBeNull();

    const next = expireNovaDialogSlots(state, new Date("2026-07-13T10:05:00.000Z"));
    expect(next.slots).not.toBeNull();
    expect(next.lastSavablePack).toBeNull();
  });

  it("MAX_TURNS bump clears lastSavablePack with slots", () => {
    const pack = buildNovaPackResult({
      packId: "month_performance",
      packVersion: MONTH_PERFORMANCE_PACK_VERSION,
      period: {
        label: "Jul 2026",
        grain: "month",
        calendarKind: "calendar_month",
        source: "explicit",
      },
      dataAsOf: "2026-07-13T00:00:00.000Z",
      metrics: [],
      facts: [],
      findings: [],
      attentions: selectNovaPackAttentions([]),
      charts: [],
      links: [],
      warnings: [],
      omittedNotes: [],
      narrativeHints: [],
    });
    let state = setNovaLastSavablePack(
      refreshNovaConversationSlots(emptyNovaDialogState(), {
        family: "money",
        metric: "receipts",
        tools: ["receipts_summary"],
      }),
      pack,
      "Cash ₹9,999"
    );
    for (let i = 0; i < NOVA_CONVERSATION_SLOT_MAX_TURNS; i++) {
      state = bumpNovaConversationSlotTurn(state);
    }
    expect(state.slots).toBeNull();
    expect(state.lastSavablePack).toBeNull();
  });
});

describe("MM sticky bind — Tata Steels bare → 2 → module follow-up", () => {
  const TATA_BARE_CLARIFY = [
    'Did you mean one of these for “Tata Steels”?',
    "",
    "1. **Tata Steels** (customer · C0014)",
    "2. **Tata Steels 800 Kg Biogas** (project · C0014-P001)",
    "",
    "Reply with the number (e.g. **1**) or the full name/code.",
  ].join("\n");

  const histBare = [
    { role: "user" as const, content: "TATA STEELS" },
    { role: "assistant" as const, content: TATA_BARE_CLARIFY },
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
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 0, taxableValue: 0, totalGst: 0 },
      _count: 0,
      _avg: {},
      _min: {},
      _max: {},
    } as never);
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(0);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([] as never);
  });

  it("deixis + typo normalize: this project / i this project", () => {
    expect(normalizeNovaQuery("PENDING TASKS I THIS PROJECT")).toMatch(/in this project/i);
    expect(
      utteranceReferencesBoundEntity("pending tasks in this project", {
        entityId: "proj_db_1",
        entityType: "project",
        entityLabel: "Tata Steels 800 Kg Biogas",
        entityCode: "C0014-P001",
      })
    ).toBe(true);
    expect(
      shouldKeepNovaBoundEntityOnTopicSwitch(
        "pending tasks",
        "tasks",
        {
          entityId: "proj_db_1",
          entityType: "project",
          entityLabel: "Tata Steels 800 Kg Biogas",
        }
      )
    ).toBe(true);
    expect(
      shouldKeepNovaBoundEntityOnTopicSwitch("who was late", "attendance", {
        entityId: "proj_db_1",
        entityType: "project",
      })
    ).toBe(false);
    expect(
      shouldKeepNovaBoundEntityOnTopicSwitch("my tasks", "tasks", {
        entityId: "proj_db_1",
        entityType: "project",
      })
    ).toBe(false);
  });

  it("HR ask clears sticky bind even when slots already null", () => {
    const state = applyNovaTopicSwitchToDialogState(
      emptyNovaDialogState({
        bound: {
          entityId: "proj_db_1",
          entityType: "project",
          entityLabel: "Tata Steels 800 Kg Biogas",
        },
        slots: null,
      }),
      "who was late today"
    );
    expect(state.bound).toBeUndefined();
  });

  it("bare Tata → reply 2 binds project + confirms (no search dump)", async () => {
    const dialogState = emptyNovaDialogState({ pendingClarify: tataAct() });
    const res = await answerNovaQuery(user(), "2", histBare, { dialogState });
    expect(res.dialogState?.bound?.entityType).toBe("project");
    expect(res.dialogState?.bound?.entityId).toBe("proj_db_1");
    expect(res.toolsUsed).toContain("clarify_bound");
    expect(res.toolsUsed).toContain("entity_bound");
    expect(res.answer).toMatch(/what should I look up|Got it/i);
    expect(res.answer).not.toMatch(/matching record/i);
    expect(res.toolsUsed).not.toContain("search_entities");
  });

  it("capability ask clears stale entity clarify; later 1 does not bind old list", async () => {
    const dialogState = emptyNovaDialogState({ pendingClarify: tataAct() });
    const language = await answerNovaQuery(user(), "languages support", histBare, { dialogState });
    expect(language.toolsUsed).toContain("nova_aware");
    expect(language.toolsUsed).toContain("language_support");
    expect(language.dialogState?.pendingClarify).toBeNull();
    expect(language.dialogState?.bound).toBeUndefined();
    expect(language.answer).not.toMatch(/Reply with the number|Tata Steels/i);

    const nextHistory = [
      ...histBare,
      { role: "user" as const, content: "languages support" },
      { role: "assistant" as const, content: language.answer },
    ];
    const one = await answerNovaQuery(user(), "1", nextHistory, {
      dialogState: language.dialogState,
    });
    expect(one.dialogState?.bound).toBeUndefined();
    expect(one.dialogState?.pendingClarify).toBeNull();
    expect(one.toolsUsed).not.toContain("clarify_bound");
    expect(one.toolsUsed).not.toContain("entity_bound");
    expect(one.toolsUsed).not.toContain("search_entities");
    expect(one.answer).not.toMatch(/Tata Steels|Reply with the number|customer\/vendor\/project/i);
  });

  it("after project bind, pending tasks uses sticky bind (no search dump)", async () => {
    const dialogState = refreshNovaConversationSlots(
      emptyNovaDialogState({
        bound: {
          entityId: "proj_db_1",
          entityType: "project",
          entityCode: "C0014-P001",
          entityLabel: "Tata Steels 800 Kg Biogas",
        },
      }),
      {
        family: "projects",
        entityHint: "Tata Steels 800 Kg Biogas",
        tools: [],
      }
    );
    const pick = resolveNovaFollowUp("pending tasks", histBare, dialogState);
    expect(pick.boundEntity?.type).toBe("project");
    expect(pick.boundEntity?.id).toBe("proj_db_1");
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toContain("tasks_summary");
    expect(pick.forcedTools ?? []).not.toContain("search_entities");

    const res = await answerNovaQuery(user(), "pending tasks", histBare, { dialogState });
    expect(res.toolsUsed).toContain("tasks_summary");
    expect(res.toolsUsed).toContain("clarify_bound");
    expect(res.answer).not.toMatch(/matching record|Did you mean/i);
    expect(res.toolsUsed).not.toContain("search_entities");
  });

  it("after project bind, invoices uses sticky bind", async () => {
    const dialogState = refreshNovaConversationSlots(
      emptyNovaDialogState({
        bound: {
          entityId: "proj_db_1",
          entityType: "project",
          entityCode: "C0014-P001",
          entityLabel: "Tata Steels 800 Kg Biogas",
        },
      }),
      { family: "projects", entityHint: "Tata Steels 800 Kg Biogas" }
    );
    const pick = resolveNovaFollowUp("invoices", histBare, dialogState);
    expect(pick.boundEntity?.id).toBe("proj_db_1");
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toEqual(
      expect.arrayContaining([expect.stringMatching(/sales_summary|invoice/i)])
    );

    const financeUser = user({
      role: "MANAGER",
      grantedPermissions: [
        "ai.assistant.read",
        "customer.read",
        "project.read",
        "invoice.read",
        "receipt.read",
        "accounts.reports.read",
      ],
    });
    const res = await answerNovaQuery(financeUser, "invoices", histBare, { dialogState });
    expect(res.toolsUsed).toContain("clarify_bound");
    expect(res.toolsUsed.some((t) => /sales_summary|invoice/i.test(t))).toBe(true);
    expect(res.answer).not.toMatch(/matching record/i);
  });

  it("typo pending tasks i this project keeps sticky project bind", () => {
    const dialogState = emptyNovaDialogState({
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
    const pick = resolveNovaFollowUp("PENDING TASKS I THIS PROJECT", histBare, dialogState);
    expect(pick.boundEntity?.type).toBe("project");
    expect(pick.forcedTools ?? pick.plan?.tools ?? []).toContain("tasks_summary");
  });

  it("after bind + metric chips, picking tasks runs skill with sticky bind (no chip loop)", async () => {
    const metricAct = buildNovaClarifyAct({
      kind: "metric",
      originalQuery: "Tata Steels 800 Kg Biogas",
      hint: "Tata Steels 800 Kg Biogas",
      options: [
        { n: 1, id: "tasks", label: "tasks", type: "metric", reply: "tasks" },
        { n: 2, id: "invoices", label: "invoices", type: "metric", reply: "invoices" },
        { n: 3, id: "sales", label: "sales", type: "metric", reply: "sales" },
      ],
    });
    const dialogState = refreshNovaConversationSlots(
      emptyNovaDialogState({
        pendingClarify: metricAct,
        bound: {
          entityId: "proj_db_1",
          entityType: "project",
          entityCode: "C0014-P001",
          entityLabel: "Tata Steels 800 Kg Biogas",
        },
      }),
      {
        family: "projects",
        entityHint: "Tata Steels 800 Kg Biogas",
        tools: [],
      }
    );
    const hist = [
      ...histBare,
      { role: "user" as const, content: "2" },
      {
        role: "assistant" as const,
        content: "For **Tata Steels 800 Kg Biogas**, what should I look up?\n\n1. **tasks**\n2. **invoices**",
      },
    ];
    const res = await answerNovaQuery(user(), "tasks", hist, { dialogState });
    expect(res.dialogState?.bound?.entityId).toBe("proj_db_1");
    expect(res.toolsUsed).toContain("tasks_summary");
    expect(res.toolsUsed).toContain("clarify_bound");
    expect(res.answer).not.toMatch(/what should I look up|matching record/i);
    expect(res.toolsUsed).not.toContain("search_entities");
  });
});
