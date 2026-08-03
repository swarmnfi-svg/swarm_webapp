import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    paymentRequest: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    purchaseBill: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    salesInvoice: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    salesReceipt: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    approvalRequest: { findMany: vi.fn(), count: vi.fn() },
    customer: { count: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    project: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    bankTransaction: { count: vi.fn() },
    bankAccount: { findMany: vi.fn() },
    manualExpensePayment: { groupBy: vi.fn(), findMany: vi.fn() },
    kpiPeriod: { findFirst: vi.fn() },
    kpiReview: { findMany: vi.fn() },
    task: { count: vi.fn(), findMany: vi.fn() },
    taskAssignee: { groupBy: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
    notification: { count: vi.fn().mockResolvedValue(0) },
    eInvoiceRecord: { groupBy: vi.fn().mockResolvedValue([]) },
    eWayBillRecord: { groupBy: vi.fn().mockResolvedValue([]) },
    hrAttendanceDaily: { findMany: vi.fn(), count: vi.fn() },
    itemMaster: { count: vi.fn() },
    stockMovement: { count: vi.fn(), findMany: vi.fn() },
    deliveryRecord: { count: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    projectChecklistItem: { count: vi.fn().mockResolvedValue(0) },
    vendor: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    staffProfile: { findFirst: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    salaryPayment: {
      count: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    hrPayrollRun: { count: vi.fn() },
    journalVoucher: { count: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    ledgerAccount: { count: vi.fn() },
    tallyConnection: { count: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    tallySyncJob: { findMany: vi.fn().mockResolvedValue([]) },
    document: { count: vi.fn().mockResolvedValue(0), groupBy: vi.fn().mockResolvedValue([]) },
    materialReceipt: { count: vi.fn(), findMany: vi.fn() },
    salesCreditNote: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
    salesDebitNote: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    fyOrderBookTarget: { findFirst: vi.fn(), findUnique: vi.fn() },
    salesOrder: { count: vi.fn() },
    purchaseOrder: { count: vi.fn(), findMany: vi.fn() },
    purchaseRequest: { count: vi.fn(), findMany: vi.fn() },
    staffAdvance: {
      count: vi.fn(),
      findMany: vi.fn(),
      aggregate: vi.fn().mockResolvedValue({ _sum: { balancePending: 0, amountIssued: 0 } }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    hrLeaveRequest: { count: vi.fn(), findMany: vi.fn() },
    hrLeaveType: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), findFirst: vi.fn() },
    hrLeaveLedgerEntry: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    hrSalaryStructure: { findFirst: vi.fn().mockResolvedValue(null) },
    hrPayrollItem: { findUnique: vi.fn().mockResolvedValue(null) },
    hrPayslip: { findUnique: vi.fn().mockResolvedValue(null) },
    hrOvertimeRecord: { findMany: vi.fn().mockResolvedValue([]) },
    staffIncentive: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    cbgQuotation: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    novaEntityAlias: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn(), update: vi.fn() },
  },
}));

/** Skills read via prisma-readonly — alias the same mock so answerNovaQuery tests stay hermetic. */
vi.mock("@/lib/nova/prisma-readonly", async () => {
  const { prisma } = await import("@/lib/prisma");
  return {
    prisma,
    novaReadonlyPrisma: prisma,
    isNovaReadonlyUsingDedicatedUrl: () => false,
  };
});

vi.mock("@/lib/search/data-search", () => ({
  searchBusinessData: vi.fn(async () => []),
}));

vi.mock("@/lib/ai/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/llm")>("@/lib/ai/llm");
  return {
    ...actual,
    isNovaLlmConfigured: vi.fn(() => false),
    novaChatCompletion: vi.fn(),
  };
});

import { answerNovaQuery } from "@/lib/ai/nova";
import { searchBusinessData } from "@/lib/search/data-search";
import { isNovaLlmConfigured, novaChatCompletion } from "@/lib/ai/llm";
import { parseNovaDateRange, novaAmbiguityClarification, llmPreservesPeriodIntent } from "@/lib/ai/nova-dates";
import { extractNovaEntityHint, extractNovaPersonHint, extractNovaBareEntityCandidate, isNovaConfirmedOrdersAsk, matchNovaTopics, novaAcronymClarification } from "@/lib/ai/nova-lexicon";
import { selectNovaTools, isNovaBookkeepingProjectName, novaLeaveAccessMode, novaTaskAccessMode, novaPurchaseBillPendingScope } from "@/lib/ai/nova-tools";
import { formatFactsDeterministic, llmPreservesLatePunchTimes, llmPreservesLateStaffNames, llmPreservesAttendancePresence, llmPreservesPunchOutFocus } from "@/lib/ai/nova-format";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { resolveNovaFollowUp } from "@/lib/ai/nova-context";
import { novaBridgeSmokeCases } from "@/lib/ai/nova-module-bridge";
import { novaSuggestedPrompts } from "@/lib/ai/nova-suggest";
import { llmPreservesSubjectIdentity } from "@/lib/ai/nova-identity";
import { prisma } from "@/lib/prisma";

function user(partial: Partial<SessionUser> & { role: SessionUser["role"] }): SessionUser {
  return {
    id: partial.id ?? "u1",
    name: partial.name ?? "Test User",
    email: partial.email ?? "t@example.com",
    role: partial.role,
    canApprove: false,
    canSeeVendorBank: false,
    canSeeSalaryInfo: false,
    canSeeProjectValue: partial.canSeeProjectValue ?? false,
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

describe("normalizeNovaQuery", () => {
  it("fixes common typos including reciepts and todays", () => {
    expect(normalizeNovaQuery("slaes total")).toMatch(/sales total/i);
    expect(normalizeNovaQuery("tis month")).toMatch(/this month/i);
    expect(normalizeNovaQuery("todays reciepts")).toBe("today receipts");
    expect(normalizeNovaQuery("late commers")).toMatch(/late comers/i);
    expect(normalizeNovaQuery("latecomers today")).toMatch(/late comers today/i);
    expect(normalizeNovaQuery("part payment of salry")).toMatch(/salary/i);
    expect(normalizeNovaQuery("salery this month")).toMatch(/salary this month/i);
  });

  it("maps today/yesterday fat-finger typos (todyas, toady, yesteday)", () => {
    expect(normalizeNovaQuery("todyas late comers")).toMatch(/^today late comers$/i);
    expect(normalizeNovaQuery("todys late comers")).toMatch(/today late comers/i);
    expect(normalizeNovaQuery("toady late comers")).toMatch(/today late comers/i);
    expect(normalizeNovaQuery("todaya receipts")).toMatch(/today receipts/i);
    expect(normalizeNovaQuery("tday receipts")).toMatch(/today receipts/i);
    expect(normalizeNovaQuery("todsy sales")).toMatch(/today sales/i);
    expect(normalizeNovaQuery("todyas receipts")).toMatch(/^today receipts$/i);
    expect(normalizeNovaQuery("yesteday sales")).toMatch(/yesterday sales/i);
    expect(normalizeNovaQuery("yestarday late comers")).toMatch(/yesterday late comers/i);
  });

  it("maps Hinglish periods and money phrases to English", () => {
    expect(normalizeNovaQuery("aaj receipts")).toMatch(/^today receipts$/i);
    expect(normalizeNovaQuery("kal ki sales")).toMatch(/yesterday.*sales/i);
    expect(normalizeNovaQuery("is mahine sales")).toMatch(/this month sales/i);
    expect(normalizeNovaQuery("pichle mahine receipts")).toMatch(/last month receipts/i);
    expect(normalizeNovaQuery("paisa aaya aaj")).toMatch(/today.*receipts|receipts.*today/i);
    expect(normalizeNovaQuery("kitna collection aaya")).toMatch(/receipts/i);
    expect(normalizeNovaQuery("batao today receipts")).toMatch(/^today receipts$/i);
    expect(normalizeNovaQuery("parso sales")).toMatch(/day before yesterday.*sales|sales.*day before yesterday/i);
    expect(normalizeNovaQuery("agle hafte leave")).toMatch(/next week.*leave|leave.*next week/i);
    expect(normalizeNovaQuery("meri chutti balance")).toMatch(/leave/i);
    expect(normalizeNovaQuery("आज बिक्री")).toMatch(/today.*sales|sales.*today/i);
  });

  it("maps kon/kaun late aaya to late comers (not late comers comers)", () => {
    expect(normalizeNovaQuery("kon late aaya")).toMatch(/^late comers$/i);
    expect(normalizeNovaQuery("kaun late aaya")).toMatch(/^late comers$/i);
    expect(normalizeNovaQuery("kon late aaya")).not.toMatch(/comers comers/i);
    expect(normalizeNovaQuery("late aaya")).toMatch(/^late comers$/i);
    expect(normalizeNovaQuery("kon late")).toMatch(/^late comers$/i);
    expect(selectNovaTools(normalizeNovaQuery("kon late aaya"))).toEqual([
      "attendance_late_summary",
    ]);
  });
});

describe("novaAmbiguityClarification", () => {
  const now = new Date("2026-07-10T12:00:00.000Z");
  it("asks when sales has no period", () => {
    const c = novaAmbiguityClarification("sales", now, "Asia/Kolkata");
    expect(c).toMatch(/FY 26-27|Did you mean/i);
  });
  it("asks for the same period clarify on summarize/billing synonyms", () => {
    for (const q of [
      "billing",
      "summarize sales",
      "summarise sales",
      "sales summary",
      "show sales",
      "list sales",
      "invoice summary",
    ]) {
      const c = novaAmbiguityClarification(normalizeNovaQuery(q), now, "Asia/Kolkata");
      expect(c, q).toMatch(/FY 26-27|Did you mean/i);
      expect(c, q).toMatch(/July 2026/);
    }
  });
  it("does not ask for 26-27 sales", () => {
    expect(novaAmbiguityClarification("26-27 sales", now, "Asia/Kolkata")).toBeNull();
  });
  it("does not ask when month is already named", () => {
    expect(novaAmbiguityClarification("july sales", now, "Asia/Kolkata")).toBeNull();
    expect(novaAmbiguityClarification("summarize sales july", now, "Asia/Kolkata")).toBeNull();
  });
  it("asks for period on bare late comers / attendance", () => {
    for (const q of ["late comers", "latecomers", "who is late", "attendance"]) {
      const c = novaAmbiguityClarification(normalizeNovaQuery(q), now, "Asia/Kolkata");
      expect(c, q).toMatch(/today|this week|this month/i);
    }
  });
  it("does not ask period when late comers already has a day", () => {
    expect(novaAmbiguityClarification("today late comers", now, "Asia/Kolkata")).toBeNull();
    expect(
      novaAmbiguityClarification(normalizeNovaQuery("todyas late comers"), now, "Asia/Kolkata")
    ).toBeNull();
    expect(novaAmbiguityClarification("late comers this week", now, "Asia/Kolkata")).toBeNull();
  });
});

describe("sales/billing phrasing consistency", () => {
  it("clarifies summarize sales instead of inventing empty July totals", async () => {
    const u = user({
      role: "DIRECTOR",
      grantedPermissions: ["ai.assistant.read", "invoice.read", "receipt.read"],
    });
    const summarize = await answerNovaQuery(u, "summarize sales");
    const billing = await answerNovaQuery(u, "billing");
    expect(summarize.toolsUsed).toContain("clarify");
    expect(billing.toolsUsed).toContain("clarify");
    expect(summarize.answer).toMatch(/Did you mean|which period/i);
    expect(billing.answer).toMatch(/Did you mean|which period/i);
    // Same period options — never answer one path with empty month totals
    expect(summarize.answer).toMatch(/July 2026/);
    expect(billing.answer).toMatch(/July 2026/);
    expect(summarize.options?.some((o) => /July 2026/i.test(o.label))).toBe(true);
    expect(billing.options?.some((o) => /July 2026/i.test(o.label))).toBe(true);
  });

  it("merges july follow-up onto summarize sales and billing the same way", () => {
    const afterSummarize = resolveNovaFollowUp("july", [
      { role: "user", content: "summarize sales" },
      { role: "assistant", content: "Did you mean FY 26-27 sales, July 2026, or today?" },
    ]);
    const afterBilling = resolveNovaFollowUp("july", [
      { role: "user", content: "billing" },
      { role: "assistant", content: "Did you mean FY 26-27 sales, July 2026, or today?" },
    ]);
    expect(afterSummarize.isFollowUp).toBe(true);
    expect(afterBilling.isFollowUp).toBe(true);
    expect(afterSummarize.forcedTools).toContain("sales_summary");
    expect(afterBilling.forcedTools).toContain("sales_summary");
    expect(extractNovaEntityHint(afterSummarize.query)).toBeNull();
    expect(extractNovaEntityHint(afterBilling.query)).toBeNull();
    expect(parseNovaDateRange(afterSummarize.query)?.label).toBe("July 2026");
    expect(parseNovaDateRange(afterBilling.query)?.label).toBe("July 2026");
  });
});

describe("parseNovaDateRange", () => {
  // Noon UTC on 10 Jul 2026 = evening IST same calendar day
  const now = new Date("2026-07-10T12:00:00.000Z");
  const tz = "Asia/Kolkata";

  it("parses today as a single calendar day in IST, not the month", () => {
    const r = parseNovaDateRange("todays receipts", now, tz);
    expect(r?.label).toMatch(/10/);
    expect(r?.label).not.toMatch(/^July 2026$/);
    // IST day starts previous evening UTC
    expect(r!.from.toISOString()).toBe("2026-07-09T18:30:00.000Z");
    expect(r!.to.getTime()).toBeGreaterThan(r!.from.getTime());
    expect(r!.to.toISOString()).toMatch(/^2026-07-10T18:29:/);
  });

  it("includes UTC-midnight receipt dates that display as today in IST", () => {
    const r = parseNovaDateRange("today receipts", now, tz)!;
    const receiptStoredAsUtcMidnight = new Date("2026-07-10T00:00:00.000Z");
    expect(receiptStoredAsUtcMidnight >= r.from && receiptStoredAsUtcMidnight <= r.to).toBe(true);
  });

  it("includes late-evening UTC timestamps that are still IST today", () => {
    // 10 Jul 2026 01:00 IST = 9 Jul 19:30 UTC — displays as 10 Jul in IST
    const earlyIst = new Date("2026-07-09T19:30:00.000Z");
    const r = parseNovaDateRange("today receipts", now, tz)!;
    expect(earlyIst >= r.from && earlyIst <= r.to).toBe(true);
  });

  it("parses yesterday as prior IST day", () => {
    const r = parseNovaDateRange("yesterday sales", now, tz);
    expect(r?.label).toMatch(/9/);
    const jul9 = new Date("2026-07-09T00:00:00.000Z");
    expect(jul9 >= r!.from && jul9 <= r!.to).toBe(true);
  });

  it("parses July without year as current or prior year", () => {
    const r = parseNovaDateRange("july sales", now, tz);
    expect(r?.label).toMatch(/July/);
  });

  it("parses this FY as current Indian FY (Apr–Mar)", () => {
    const r = parseNovaDateRange("this fy sales", now, tz);
    expect(r?.label).toBe("FY 26-27");
  });

  it("parses bare 26-27 as FY 26-27, not July", () => {
    const r = parseNovaDateRange("26-27 sales", now, tz);
    expect(r?.label).toBe("FY 26-27");
    expect(r?.label).not.toMatch(/July/i);
  });

  it("parses FY 25-26 explicitly", () => {
    const r = parseNovaDateRange("fy 25-26 receipts", now, tz);
    expect(r?.label).toBe("FY 25-26");
  });

  it("parses this month", () => {
    const r = parseNovaDateRange("sales this month", now, tz);
    expect(r?.label).toMatch(/July 2026/);
  });

  it("parses this year as Indian FY (not calendar year)", () => {
    const r = parseNovaDateRange("this year sales", now, tz);
    expect(r?.label).toBe("FY 26-27");
  });

  it("parses calendar year explicitly", () => {
    const r = parseNovaDateRange("calendar year sales", now, tz);
    expect(r?.label).toBe("Calendar 2026");
  });

  it("parses this week and last week as week ranges, not months", () => {
    const thisWeek = parseNovaDateRange("this week sales", now, tz);
    expect(thisWeek?.label).toMatch(/6/);
    expect(thisWeek?.label).toMatch(/12/);
    expect(thisWeek?.label).not.toMatch(/^July 2026$/);

    const lastWeek = parseNovaDateRange("last week receipts", now, tz);
    expect(lastWeek?.label).toMatch(/29/);
    expect(lastWeek?.label).toMatch(/5/);
  });

  it("does not let receipts keyword expand today to the whole month", () => {
    const r = parseNovaDateRange("todays reciepts", now, tz);
    expect(r?.label).toMatch(/10/);
    expect(r?.label).not.toMatch(/^July 2026$/);
  });

  it("parses Hinglish aaj/kal/is mahine after normalize (not whole month for aaj)", () => {
    const aaj = parseNovaDateRange(normalizeNovaQuery("aaj receipts"), now, tz);
    expect(aaj?.label).toMatch(/10/);
    expect(aaj?.label).not.toMatch(/^July 2026$/);
    const kal = parseNovaDateRange(normalizeNovaQuery("kal sales"), now, tz);
    expect(kal?.label).toMatch(/9/);
    const mahine = parseNovaDateRange(normalizeNovaQuery("is mahine sales"), now, tz);
    expect(mahine?.label).toBe("July 2026");
  });

  it("parses todyas late comers / todyas receipts as a single day after normalize", () => {
    const late = parseNovaDateRange(normalizeNovaQuery("todyas late comers"), now, tz);
    expect(late?.label).toMatch(/10/);
    expect(late?.label).not.toMatch(/^July 2026$/);
    const receipts = parseNovaDateRange(normalizeNovaQuery("todyas receipts"), now, tz);
    expect(receipts?.label).toMatch(/10/);
    expect(receipts?.label).not.toMatch(/^July 2026$/);
    const todayLate = parseNovaDateRange("today late comers", now, tz);
    expect(todayLate?.label).toBe(late?.label);
  });
});

describe("llmPreservesPeriodIntent", () => {
  it("fails when day ask has month-labeled attendance facts", () => {
    expect(
      llmPreservesPeriodIntent("today late comers", [
        { ok: true, data: { period: "July 2026", periodGrain: "month" } },
      ])
    ).toBe(false);
  });
  it("passes when day ask has day-grain facts", () => {
    expect(
      llmPreservesPeriodIntent("todyas late comers".replace("todyas", "today"), [
        { ok: true, data: { period: "10 Jul 2026", periodGrain: "day" } },
      ])
    ).toBe(true);
  });
  it("fails when LLM prose claims a month on a day ask", () => {
    expect(
      llmPreservesPeriodIntent(
        "yesterday receipts",
        [{ ok: true, data: { period: "10 Jul 2026", periodGrain: "day" } }],
        "For July 2026, total receipts were ₹1,00,000."
      )
    ).toBe(false);
  });
  it("passes when LLM expands short day label to long month form", () => {
    expect(
      llmPreservesPeriodIntent(
        "todays expenses",
        [{ ok: true, data: { period: "20 Jul 2026", periodGrain: "day" } }],
        "Expenses paid on 20 July 2026 were ₹5,749.00."
      )
    ).toBe(true);
  });
  it("passes day ask when fact period is day-shaped without periodGrain", () => {
    expect(
      llmPreservesPeriodIntent(
        "today's receipts",
        [{ ok: true, data: { period: "20 Jul 2026" } }],
        "Today's receipts (20 July 2026): ₹1,00,000."
      )
    ).toBe(true);
  });
  it("still fails true month bleed when day facts lack a day label in prose", () => {
    expect(
      llmPreservesPeriodIntent(
        "today expenses",
        [{ ok: true, data: { period: "20 Jul 2026", periodGrain: "day" } }],
        "For July 2026, expenses totaled ₹5,749."
      )
    ).toBe(false);
  });
});

describe("extractNovaPersonHint", () => {
  it("extracts person from pending tasks for Name", () => {
    expect(extractNovaPersonHint("pending tasks for Zeeshan")).toBe("Zeeshan");
    expect(extractNovaPersonHint("tasks for Zeeshan")).toBe("Zeeshan");
    expect(extractNovaPersonHint("Zeeshan's tasks")).toBe("Zeeshan");
    expect(extractNovaPersonHint("attendance for Zeeshan")).toBe("Zeeshan");
    expect(extractNovaPersonHint("pending tasks")).toBeNull();
    expect(extractNovaPersonHint("my tasks")).toBeNull();
  });

  it("extracts Name pending tasks / show Name tasks / leading name", () => {
    expect(extractNovaPersonHint("Zeeshan pending tasks")).toBe("Zeeshan");
    expect(extractNovaPersonHint("show Zeeshan tasks")).toBe("Zeeshan");
    expect(extractNovaPersonHint("Zeeshan leave")).toBe("Zeeshan");
    expect(extractNovaPersonHint("leave for Zeeshan")).toBe("Zeeshan");
    expect(extractNovaPersonHint("KPI for Zeeshan")).toBe("Zeeshan");
    expect(extractNovaPersonHint("did Madhu punch in today")).toBe("Madhu");
    expect(extractNovaPersonHint("has Arun punched")).toBe("Arun");
    expect(extractNovaPersonHint("did Zeeshan come today")).toBe("Zeeshan");
    expect(extractNovaPersonHint("aalok tasks")).toBe("aalok");
  });

  it("strips possessive suffixes from personal-task person hints", () => {
    expect(extractNovaPersonHint("Arif's pending tasks")).toBe("Arif");
    expect(extractNovaPersonHint("Arif’s overdue tasks")).toBe("Arif");
    expect(extractNovaPersonHint("show me Arif's overdue tasks")).toBe("Arif");
    expect(extractNovaPersonHint("list Arif's pending tasks")).toBe("Arif");
    // Natural names ending in s stay intact
    expect(extractNovaPersonHint("James pending tasks")).toBe("James");
    expect(extractNovaPersonHint("Zeeshan's tasks")).toBe("Zeeshan");
  });

  it("does not staff-bind party/project-shaped names on {entity} tasks", () => {
    expect(extractNovaPersonHint("tata steel tasks")).toBeNull();
    expect(extractNovaPersonHint("tata steels tasks")).toBeNull();
    expect(extractNovaPersonHint("James School tasks")).toBeNull();
    expect(extractNovaPersonHint("pending tasks for tata steels 800")).toBeNull();
    // Explicit staff prefix still wins
    expect(extractNovaPersonHint("staff Tata")).toBe("Tata");
  });
  it("does not steal WH-phrases as person names", () => {
    for (const q of [
      "who punched late",
      "who punched late today",
      "who punched in late",
      "who came late",
      "who was late",
      "whose late",
      "who is absent today",
      "who completed more tasks",
      "who completed most task",
      "who completed most tasks",
      "what late",
      "which late",
      "kisne late",
      "kiska late",
    ]) {
      expect(extractNovaPersonHint(q), q).toBeNull();
      expect(extractNovaPersonHint(normalizeNovaQuery(q)), q).toBeNull();
    }
  });

  it("still extracts real staff names with domains", () => {
    expect(extractNovaPersonHint("Madhu attendance")).toBe("Madhu");
    expect(extractNovaPersonHint("attendance for Madhu")).toBe("Madhu");
    expect(extractNovaPersonHint("Arun leave")).toBe("Arun");
    expect(extractNovaPersonHint("which tasks for arif is over due")).toBe("arif");
    expect(extractNovaPersonHint("Arif pending tasks")).toBe("Arif");
  });
});

describe("selectNovaTools person vs my_work", () => {
  it("uses tasks_summary (not my_work) when another person is named — Super Admin still gets that tool", () => {
    const tools = selectNovaTools("pending tasks for Zeeshan");
    expect(tools).toContain("tasks_summary");
    expect(tools).not.toContain("my_work_summary");
  });
});

describe("selectNovaTools late yesterday → attendance", () => {
  it("routes late yesterday to attendance, not sales/receipts", () => {
    const tools = selectNovaTools("late yesterday");
    expect(tools).toContain("attendance_late_summary");
    expect(tools).not.toContain("sales_summary");
    expect(tools).not.toContain("receipts_summary");
  });

  it("routes yesterday late and late today to attendance", () => {
    expect(selectNovaTools("yesterday late")).toEqual(["attendance_late_summary"]);
    expect(selectNovaTools("late today")).toEqual(["attendance_late_summary"]);
  });

  it("routes Hinglish kal late to attendance after normalize", async () => {
    const { normalizeNovaQuery } = await import("@/lib/ai/nova-normalize");
    const q = normalizeNovaQuery("kal late");
    expect(q).toMatch(/yesterday/i);
    expect(selectNovaTools(q)).toEqual(["attendance_late_summary"]);
  });

  it("does not route late payment or payment late to attendance", () => {
    expect(selectNovaTools("late payment")).not.toContain("attendance_late_summary");
    expect(selectNovaTools("payment late")).not.toContain("attendance_late_summary");
  });
});

describe("composeNovaIntent keyword map", () => {
  it("R7 clarifies bare yesterday", async () => {
    const { composeNovaIntent } = await import("@/lib/ai/nova-intent");
    const intent = composeNovaIntent("yesterday");
    expect(intent.clarify).toMatch(/sales|receipts|late/i);
    expect(intent.tools).toEqual([]);
  });

  it("R1 late + period → attendance", async () => {
    const { composeNovaIntent } = await import("@/lib/ai/nova-intent");
    expect(composeNovaIntent("late yesterday").tools).toEqual(["attendance_late_summary"]);
  });

  it("R3 bare late clarifies period", async () => {
    const { composeNovaIntent } = await import("@/lib/ai/nova-intent");
    const intent = composeNovaIntent("late");
    expect(intent.clarify).toMatch(/today|week|month/i);
    expect(intent.tools).toEqual([]);
  });
});

/** Phase 5 — CI routing matrix: phrase → tools | clarify */
describe("keyword-map routing matrix", () => {
  const cases: Array<{
    q: string;
    tools?: string[];
    clarify?: RegExp;
    notTools?: string[];
  }> = [
    { q: "late yesterday", tools: ["attendance_late_summary"], notTools: ["sales_summary"] },
    { q: "yesterday late", tools: ["attendance_late_summary"] },
    { q: "late today", tools: ["attendance_late_summary"] },
    { q: "absent today", tools: ["attendance_late_summary"] },
    { q: "late", clarify: /today|week|month/i },
    { q: "absent", clarify: /today|week|month/i },
    { q: "present", clarify: /today|week|month/i },
    { q: "late payment", clarify: /late payment|late comers/i, notTools: ["attendance_late_summary"] },
    { q: "payment late", clarify: /late payment|late comers/i, notTools: ["attendance_late_summary"] },
    { q: "pending", clarify: /approvals|leave|tasks/i },
    { q: "pending yesterday", clarify: /pending what|approvals|leave|tasks/i, notTools: ["sales_summary"] },
    { q: "yesterday", clarify: /sales|receipts|late/i },
    { q: "today", clarify: /sales|receipts|late/i },
    { q: "advance", tools: ["staff_advances_summary"] },
    { q: "Zeeshan late yesterday", tools: ["attendance_late_summary"] },
    { q: "today receipts", tools: ["receipts_summary"] },
    { q: "yesterday sales", tools: ["sales_summary"] },
  ];

  it.each(cases)("$q", async ({ q, tools, clarify, notTools }) => {
    const { normalizeNovaQuery } = await import("@/lib/ai/nova-normalize");
    const { composeNovaIntent } = await import("@/lib/ai/nova-intent");
    const nq = normalizeNovaQuery(q);
    const intent = composeNovaIntent(nq);
    const selected = selectNovaTools(nq);
    if (tools) {
      for (const t of tools) expect(selected).toContain(t);
    }
    if (notTools) {
      for (const t of notTools) expect(selected).not.toContain(t);
    }
    if (clarify) {
      expect(intent.clarify ?? novaAmbiguityClarification(nq) ?? "").toMatch(clarify);
      expect(selected.filter((t) => t !== "search_entities")).toEqual([]);
    }
  });

  it("Hinglish der se / kal late → attendance", async () => {
    const { normalizeNovaQuery } = await import("@/lib/ai/nova-normalize");
    expect(selectNovaTools(normalizeNovaQuery("kal late"))).toEqual(["attendance_late_summary"]);
    expect(selectNovaTools(normalizeNovaQuery("der se aaya yesterday"))).toEqual([
      "attendance_late_summary",
    ]);
    expect(selectNovaTools(normalizeNovaQuery("kaun late aaj"))).toEqual([
      "attendance_late_summary",
    ]);
  });
});

describe("bare entity / Avaada fidelity", () => {
  it("clarifies bare company name with no metric", () => {
    const now = new Date("2026-07-10T12:00:00+05:30");
    expect(novaAmbiguityClarification("avaada", now, "Asia/Kolkata")).toMatch(
      /sales|receipts|outstanding/i
    );
    expect(novaAmbiguityClarification("tata steels", now, "Asia/Kolkata")).toMatch(
      /sales|receipts|outstanding/i
    );
  });

  it("swaps entity on bare follow-up after money answer", () => {
    const r = resolveNovaFollowUp("avaada", [
      { role: "user", content: "tata steels" },
      {
        role: "assistant",
        content: "Tata Steels Sales in July 2026\n₹1,23,000.00 from 3 sales invoices.",
      },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.query.toLowerCase()).toMatch(/avaada/);
    expect(r.query.toLowerCase()).toMatch(/sales/);
    expect(r.query.toLowerCase()).not.toMatch(/tata/);
    expect(r.query).not.toMatch(/₹/);
    expect(r.forcedTools).toContain("sales_summary");
    expect(r.plan?.entity?.toLowerCase()).toMatch(/avaada/);
    expect(r.plan?.tools).toContain("sales_summary");
  });

  it("what about X replaces prior entity", () => {
    const r = resolveNovaFollowUp("what about avaada", [
      { role: "user", content: "tata steels sales this month" },
      { role: "assistant", content: "Tata sales ₹1,00,000" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.query.toLowerCase()).toMatch(/avaada/);
    expect(r.query.toLowerCase()).toMatch(/sales/);
    expect(r.query).not.toMatch(/₹/);
    expect(extractNovaEntityHint(r.query)?.toLowerCase()).toMatch(/avaada/);
    expect(r.plan?.entity?.toLowerCase()).toMatch(/avaada/);
  });

  it("money guard rejects invented ₹ when facts have no amounts", async () => {
    const { llmPreservesPrimaryMoney } = await import("@/lib/ai/nova-money");
    expect(
      llmPreservesPrimaryMoney("Avaada Sales ₹1,23,000.00 from 3 invoices.", [
        { tool: "search_entities", ok: true, data: { matches: [{ title: "AVAADA" }] } },
      ])
    ).toBe(false);
    expect(
      llmPreservesPrimaryMoney("I found customer AVAADA — open the record?", [
        { tool: "search_entities", ok: true, data: { matches: [{ title: "AVAADA" }] } },
      ])
    ).toBe(true);
  });
});

describe("bare period / pending clarify", () => {
  it("clarifies bare yesterday / today for metric", () => {
    const now = new Date("2026-07-10T12:00:00+05:30");
    const c = novaAmbiguityClarification("yesterday", now, "Asia/Kolkata");
    expect(c).toMatch(/sales|receipts|late/i);
    expect(novaAmbiguityClarification("pending", now, "Asia/Kolkata")).toMatch(/approvals|leave/i);
  });
});

describe("NOVA RBAC access modes (L1/L2/L3)", () => {
  it("leave: leave.approve / employee.read are team, not org-wide", () => {
    expect(
      novaLeaveAccessMode({
        role: "MANAGER",
        grantedPermissions: ["hr.leave.approve", "hr.attendance.team"],
      })
    ).toBe("team");
    expect(
      novaLeaveAccessMode({
        role: "STAFF",
        grantedPermissions: ["hr.employee.read"],
      })
    ).toBe("team");
    expect(
      novaLeaveAccessMode({
        role: "DIRECTOR",
        grantedPermissions: ["hr.leave.read"],
      })
    ).toBe("all");
    expect(
      novaLeaveAccessMode({
        role: "STAFF",
        grantedPermissions: ["hr.leave.create"],
      })
    ).toBe("self");
    expect(novaLeaveAccessMode({ role: "SUPER_ADMIN", grantedPermissions: [] })).toBe("all");
  });

  it("tasks: task.edit.team is team, not admin-all", () => {
    expect(
      novaTaskAccessMode({
        role: "MANAGER",
        grantedPermissions: ["task.edit.team", "task.read.self"],
      })
    ).toBe("team");
    expect(
      novaTaskAccessMode({
        role: "STAFF",
        grantedPermissions: ["task.admin", "task.read.self"],
      })
    ).toBe("all");
    expect(
      novaTaskAccessMode({
        role: "STAFF",
        grantedPermissions: ["task.read.self"],
      })
    ).toBe("self");
    expect(novaTaskAccessMode({ role: "ADMIN", grantedPermissions: [] })).toBe("all");
  });

  it("purchase bills pending: read alone is own, verify/approve is org", () => {
    expect(
      novaPurchaseBillPendingScope({
        role: "STAFF",
        grantedPermissions: ["purchasebill.read"],
      })
    ).toBe("own");
    // STAFF role matrix includes purchasebill.read → own queue, never org-wide
    expect(
      novaPurchaseBillPendingScope({
        role: "STAFF",
        grantedPermissions: [],
      })
    ).toBe("own");
    expect(
      novaPurchaseBillPendingScope({
        role: "MANAGER",
        grantedPermissions: ["purchasebill.read", "purchasebill.verify"],
      })
    ).toBe("org");
    expect(novaPurchaseBillPendingScope({ role: "SUPER_ADMIN", grantedPermissions: [] })).toBe(
      "org"
    );
  });
});

describe("llmPreservesSubjectIdentity", () => {
  it("fails when LLM addresses session user as the other subject", () => {
    const facts = [
      {
        tool: "tasks_summary",
        ok: true,
        data: {
          subject: { name: "Zeeshan Khan", relation: "other" },
          openCount: 2,
          samples: [{ title: "Arun task", assigneeNames: ["Arun"] }],
        },
      },
    ];
    expect(llmPreservesSubjectIdentity("Zeeshan, you have 2 open tasks.", facts, "Arun")).toBe(
      false
    );
    expect(llmPreservesSubjectIdentity("Hi Zeeshan, here are your tasks.", facts, "Arun")).toBe(
      false
    );
    expect(
      llmPreservesSubjectIdentity("Zeeshan has 2 open tasks assigned.", facts, "Arun")
    ).toBe(true);
    expect(
      llmPreservesSubjectIdentity("Arun — Zeeshan has 3 pending tasks.", facts, "Arun")
    ).toBe(true);
  });

  it("fails on second-person leave/attendance for another person", () => {
    const facts = [
      {
        tool: "leave_summary",
        ok: true,
        data: { subject: { name: "Zeeshan Khan", relation: "other" } },
      },
    ];
    expect(llmPreservesSubjectIdentity("Your leave balance is 5 days.", facts, "Arun")).toBe(
      false
    );
    expect(llmPreservesSubjectIdentity("You were late yesterday.", facts, "Arun")).toBe(false);
    expect(
      llmPreservesSubjectIdentity("Zeeshan’s leave balance is 5 days.", facts, "Arun")
    ).toBe(true);
  });
});

describe("extractNovaEntityHint", () => {
  it("does not treat FY / month / this-year as customer names", () => {
    expect(extractNovaEntityHint("FY 26-27 sales")).toBeNull();
    expect(extractNovaEntityHint("fy 26-27 sales")).toBeNull();
    expect(extractNovaEntityHint("this month sales")).toBeNull();
    expect(extractNovaEntityHint("this year sales")).toBeNull();
    expect(extractNovaEntityHint("july sales")).toBeNull();
    expect(extractNovaEntityHint("today receipts")).toBeNull();
  });

  it("does not treat summarize/show/list verbs as customer names", () => {
    // Regression: "summarize sales" used to filter customerName contains "summarize"
    // → empty July totals while "billing" → "july" returned real sales.
    for (const q of [
      "summarize sales",
      "summarise sales",
      "sales summary",
      "show sales",
      "list sales",
      "give me sales",
      "report sales",
      "check sales",
      "get sales",
      "sales overview",
      "overview sales",
      "invoice summary",
      "summarize receipts",
      "show receipts",
      "receipts summary",
      "summarize sales july",
    ]) {
      expect(extractNovaEntityHint(q), q).toBeNull();
    }
  });

  it("still extracts real customer names", () => {
    expect(extractNovaEntityHint("Avaada sales")).toBe("Avaada");
    expect(extractNovaEntityHint("Avaada receipts today")).toBe("Avaada");
  });

  it("extracts named project from James School style asks", () => {
    expect(
      extractNovaEntityHint(
        "complete details of the work carried out at the James School project"
      )
    ).toMatch(/James School/i);
    expect(extractNovaEntityHint("biggest project")).toBeNull();
  });

  it("extracts trailing names after for/of/from", () => {
    expect(extractNovaEntityHint("receipts for Avaada")).toBe("Avaada");
    expect(extractNovaEntityHint("sales of Acme Energy")).toBe("Acme Energy");
    expect(extractNovaEntityHint("outstanding from Avaada today")).toBe("Avaada");
  });
});

describe("selectNovaTools", () => {
  it("selects sales_summary for july sales", () => {
    expect(selectNovaTools("july sales")).toContain("sales_summary");
  });

  it("selects receipts for today receipts and not projects", () => {
    const tools = selectNovaTools("today receipts");
    expect(tools).toContain("receipts_summary");
    expect(tools).not.toContain("projects_summary");
  });

  it("does not mix projects into todays summary", () => {
    const tools = selectNovaTools("todays summary");
    expect(tools).toContain("sales_summary");
    expect(tools).toContain("receipts_summary");
    expect(tools).not.toContain("projects_summary");
  });

  it("selects attendance tool for late comers", () => {
    expect(selectNovaTools("late comers this week")).toContain("attendance_late_summary");
    expect(selectNovaTools("who is most late")).toContain("attendance_late_summary");
    expect(selectNovaTools("attendance today")).toContain("attendance_late_summary");
    expect(selectNovaTools("who was absent this week")).toContain("attendance_late_summary");
    expect(selectNovaTools("leave balance")).toContain("leave_summary");
    expect(selectNovaTools("my leave balance")).toContain("leave_summary");
  });

  it("selects stock delivery vendors payment tools", () => {
    expect(selectNovaTools("stock movements")).toContain("stock_summary");
    expect(selectNovaTools("deliveries this month")).toContain("delivery_summary");
    expect(selectNovaTools("vendors list")).toContain("vendors_summary");
    expect(selectNovaTools("payment requests pending")).toContain("payment_requests_summary");
  });

  it("routes expanded module tools", () => {
    expect(selectNovaTools("customers summary")).toContain("customers_summary");
    expect(selectNovaTools("active staff count")).toContain("staff_summary");
    expect(selectNovaTools("pending leave")).toContain("leave_summary");
    expect(selectNovaTools("staff advances pending")).toContain("staff_advances_summary");
    expect(selectNovaTools("open sales orders")).toContain("sales_orders_summary");
    expect(selectNovaTools("open purchase orders")).toContain("purchase_orders_summary");
    expect(selectNovaTools("pending purchase requests")).toContain("purchase_requests_summary");
    expect(selectNovaTools("pending approvals")).toContain("approvals_summary");
    expect(selectNovaTools("bank accounts")).toContain("bank_accounts_summary");
    expect(selectNovaTools("pending incentives")).toContain("incentives_summary");
    expect(selectNovaTools("CBG quotations")).toContain("cbg_quotations_summary");
    expect(selectNovaTools("my work")).toContain("my_work_summary");
    expect(selectNovaTools("low stock items")).toContain("stock_summary");
  });

  it("routes biggest project to projects_summary only", () => {
    const tools = selectNovaTools("biggest project");
    expect(tools).toContain("projects_summary");
    expect(tools).not.toContain("receipts_summary");
    expect(tools).not.toContain("sales_summary");
    expect(tools).not.toContain("search_entities");
  });

  it("routes bare new/confirmed orders to projects_summary (not sales orders)", () => {
    expect(isNovaConfirmedOrdersAsk("new orders this month")).toBe(true);
    expect(isNovaConfirmedOrdersAsk("orders this month")).toBe(true);
    expect(isNovaConfirmedOrdersAsk("projects confirmed this month")).toBe(true);
    expect(isNovaConfirmedOrdersAsk("confirmed projects this month")).toBe(true);
    expect(isNovaConfirmedOrdersAsk("orders confirmed this month")).toBe(true);
    expect(isNovaConfirmedOrdersAsk("sales orders this month")).toBe(false);
    expect(isNovaConfirmedOrdersAsk("open sales orders")).toBe(false);
    expect(isNovaConfirmedOrdersAsk("order book")).toBe(false);

    expect(selectNovaTools("new orders this month")).toEqual(["projects_summary"]);
    expect(selectNovaTools("orders this month")).toEqual(["projects_summary"]);
    expect(selectNovaTools("projects confirmed this month")).toEqual(["projects_summary"]);
    expect(selectNovaTools("sales orders this month")).toEqual(["sales_orders_summary"]);
    expect(selectNovaTools("sales orders this month")).not.toContain("projects_summary");
  });

  it("selects kpi and projects tools", () => {
    expect(selectNovaTools("staff kpi")).toContain("kpi_summary");
    expect(selectNovaTools("active projects value")).toContain("projects_summary");
    expect(selectNovaTools("staff expense")).toContain("staff_expense_summary");
  });

  it("routes bare dashboard to director dashboard tool", () => {
    const tools = selectNovaTools("dashboard");
    expect(tools).toContain("director_dashboard_summary");
    expect(tools).not.toContain("sales_summary");
  });

  it("routes total bank balance to cash_banking pack", () => {
    const tools = selectNovaTools("total bank balance");
    expect(tools).toEqual(["cash_banking"]);
  });
});


  it("routes completed tasks and reports pack", () => {
    expect(selectNovaTools("who completed more tasks")).toContain("tasks_summary");
    expect(selectNovaTools("who completed most task")).toContain("tasks_summary");
    expect(selectNovaTools("GSTR-1")).toContain("gstr_snapshot");
    expect(selectNovaTools("sales register")).toContain("reports_snapshot");
    expect(selectNovaTools("fund position")).toContain("profitability_summary");
    expect(selectNovaTools("project wise profit")).toEqual(["profitability_summary"]);
    expect(selectNovaTools("project profit")).toEqual(["profitability_summary"]);
    expect(selectNovaTools("any project at loss")).toEqual(["profitability_summary"]);
    expect(selectNovaTools("any project at loss")).not.toContain("projects_summary");
    expect(selectNovaTools("project wise profit")).not.toContain("projects_summary");
  });

  it("fixes leave and incentives hrefs in lexicon", async () => {
    const { NOVA_LEXICON } = await import("@/lib/ai/nova-lexicon");
    expect(NOVA_LEXICON.find((t) => t.id === "leave")?.href).toBe("/attendance-hr/leave");
    expect(NOVA_LEXICON.find((t) => t.id === "incentives")?.href).toBe("/kpi/incentives");
    expect(NOVA_LEXICON.find((t) => t.id === "gst_docs")?.href).toBe("/accounts/gst-summary");
  });

describe("resolveNovaFollowUp", () => {
  it("forces projects_summary on recheck after project value ask", () => {
    const r = resolveNovaFollowUp("can u recheck that", [
      { role: "user", content: "biggest project" },
      { role: "assistant", content: "Biggest is X worth ₹1" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.forcedTools).toContain("projects_summary");
  });

  it("forces projects on i mean project value", () => {
    const r = resolveNovaFollowUp("i mean project value", [
      { role: "user", content: "biggest project" },
      { role: "assistant", content: "Here is a receipt…" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.forcedTools).toEqual(["projects_summary"]);
  });

  // #6 bug-sweep lock: multi-turn "recheck" must re-run the prior plan directly and
  // never emit a garbled merged routing query (prior text + slot expansion + utterance).
  it("recheck project follow-up yields a clean plan-routed query (no garble)", () => {
    const r = resolveNovaFollowUp("can u recheck that", [
      { role: "user", content: "biggest project" },
      { role: "assistant", content: "Here is a receipt by mistake" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.forcedTools).toEqual(["projects_summary"]);
    // Carries a ready plan so downstream never re-derives from noisy text.
    expect(r.plan?.tools).toEqual(["projects_summary"]);
    expect(r.plan?.module).toBe("projects");
    // Routing query must not re-emit the prior question text or the recheck utterance.
    expect(r.query).not.toMatch(/recheck/i);
    expect(r.query).not.toMatch(/biggest project.*biggest project/i);
    expect(r.query.split(/\s+/).length).toBeLessThanOrEqual(4);
  });

  it("recheck re-runs a ready prior plan (receipts) without appending recheck noise", () => {
    const r = resolveNovaFollowUp("recheck that please", [
      { role: "user", content: "receipts today" },
      { role: "assistant", content: "Total collected ₹5,00,000 today" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.forcedTools).toContain("receipts_summary");
    expect(r.query).not.toMatch(/recheck/i);
  });

  it("recheck after topic-switch uses the latest ERP turn (not older sales)", () => {
    const r = resolveNovaFollowUp("recheck that", [
      { role: "user", content: "sales this month" },
      { role: "assistant", content: "FY sales…" },
      { role: "user", content: "pending tasks" },
      { role: "assistant", content: "17 pending tasks" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.forcedTools).toContain("tasks_summary");
    expect(r.forcedTools ?? []).not.toContain("sales_summary");
    expect(r.query).not.toMatch(/recheck/i);
  });

  it("recheck with empty prior plan asks once (no garbled merge)", () => {
    const r = resolveNovaFollowUp("can u recheck that", [
      { role: "user", content: "thanks" },
      { role: "assistant", content: "You’re welcome." },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.clarifyReask).toMatch(/not sure what to recheck/i);
    expect(r.forcedTools).toBeUndefined();
    expect(r.query).toMatch(/recheck/i);
  });

  it("merges period-only 26-27 onto prior sales ask", () => {
    const r = resolveNovaFollowUp("26-27", [
      { role: "user", content: "sales" },
      { role: "assistant", content: "Did you mean FY or this month?" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.query).toMatch(/sales/i);
    expect(r.query).toMatch(/26-27/);
  });

  it("does not treat bare it/that as a follow-up", () => {
    const history = [
      { role: "user" as const, content: "biggest project" },
      { role: "assistant" as const, content: "Plant A is largest" },
    ];
    expect(resolveNovaFollowUp("it", history).isFollowUp).toBe(false);
    expect(resolveNovaFollowUp("that", history).isFollowUp).toBe(false);
    expect(resolveNovaFollowUp("recheck that", history).isFollowUp).toBe(true);
  });

  it("does not merge yesterday receipts into prior tasks/sales turns", () => {
    const history = [
      { role: "user" as const, content: "what is sales this year" },
      { role: "assistant" as const, content: "FY sales…" },
      { role: "user" as const, content: "pending tasks" },
      { role: "assistant" as const, content: "17 pending tasks" },
    ];
    const r = resolveNovaFollowUp("yesterdays reciepts", history);
    expect(r.isFollowUp).toBe(false);
    expect(r.query).toBe("yesterday receipts");
    expect(r.forcedTools).toBeUndefined();
    expect(selectNovaTools(r.query)).toEqual(["receipts_summary"]);
  });

  it("does not merge summarise yesterday activity into prior list kpi", () => {
    const r = resolveNovaFollowUp("summarise yesterdays activity", [
      { role: "user" as const, content: "list kpi" },
      { role: "assistant" as const, content: "KPI July 2026 avg 58" },
    ]);
    expect(r.isFollowUp).toBe(false);
    expect(r.query.toLowerCase()).toMatch(/yesterday/);
    expect(r.query.toLowerCase()).not.toMatch(/list kpi/);
    expect(selectNovaTools(r.query)).toEqual(
      expect.arrayContaining(["sales_summary", "receipts_summary"])
    );
    expect(selectNovaTools(r.query)).not.toContain("kpi_summary");
  });

  it("still merges bare yesterday onto prior receipts ask", () => {
    const r = resolveNovaFollowUp("yesterday", [
      { role: "user", content: "receipts" },
      { role: "assistant", content: "Did you mean today or FY?" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.query).toMatch(/receipt/i);
    expect(r.query).toMatch(/yesterday/i);
    expect(r.forcedTools).toContain("receipts_summary");
    expect(r.forcedTools).not.toContain("tasks_summary");
  });

  it("forces receivables/overdue tools on who are they after receivables", () => {
    const history = [
      { role: "user" as const, content: "receivables" },
      {
        role: "assistant" as const,
        content: "Receivables: 12 overdue invoices, outstanding ~ ₹4,50,000.00",
      },
    ];
    for (const q of ["who are they", "who", "which customers", "list them", "names", "show them", "details"]) {
      const r = resolveNovaFollowUp(q, history);
      expect(r.isFollowUp).toBe(true);
      expect(r.forcedTools).toEqual(
        expect.arrayContaining(["receivables_summary", "overdue_invoices"])
      );
    }
  });

  it("forces tasks_summary on who are they after overdue tasks", () => {
    const r = resolveNovaFollowUp("who are they", [
      { role: "user", content: "overdue tasks" },
      { role: "assistant", content: "3 overdue tasks" },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.forcedTools).toEqual(["tasks_summary"]);
  });

  it("does not treat who are they as follow-up without domain history", () => {
    const r = resolveNovaFollowUp("who are they", [
      { role: "user", content: "hello" },
      { role: "assistant", content: "Hi — how can I help?" },
    ]);
    expect(r.isFollowUp).toBe(false);
    expect(r.forcedTools).toBeUndefined();
  });
});

describe("isNovaBookkeepingProjectName", () => {
  it("flags FY adjustment projects", () => {
    expect(isNovaBookkeepingProjectName("Fy 25-26 Adjustment")).toBe(true);
    expect(isNovaBookkeepingProjectName("Solar Plant Phase 2")).toBe(false);
  });
});

describe("formatFactsDeterministic tasks", () => {
  it("names assignees from task samples", () => {
    const text = formatFactsDeterministic("overdue tasks", [
      {
        tool: "tasks_summary",
        ok: true,
        data: {
          openCount: 2,
          overdueCount: 1,
          dueSoonCount: 0,
          samples: [
            {
              no: "TSK-1",
              title: "Site visit",
              status: "TODO",
              priority: "HIGH",
              due: "2026-07-01",
              overdue: true,
              assigneeNames: ["Ravi Kumar (STF-01)"],
              project: { name: "Plant A", id: "P1" },
            },
          ],
        },
      },
    ]);
    expect(text).toMatch(/Ravi Kumar/);
    expect(text).not.toMatch(/not mentioned|missing/i);
  });
});

describe("single-day late comers punch-in times", () => {
  const dayFacts = [
    {
      tool: "attendance_late_summary",
      ok: true,
      data: {
        period: "11 Jul 2026",
        periodGrain: "day",
        from: "2026-07-11",
        to: "2026-07-11",
        focus: "late",
        peopleWithLate: 2,
        presentPunchDays: 10,
        absentDays: 0,
        mostLate: {
          name: "Arun C Michael",
          code: "STF0003",
          lateDays: 1,
          totalLateMinutes: 140,
          lateMinutes: 140,
          punchInLabel: "10:20 am",
        },
        topLateComers: [
          {
            name: "Arun C Michael",
            code: "STF0003",
            department: "Management",
            lateDays: 1,
            totalLateMinutes: 140,
            lateMinutes: 140,
            punchInLabel: "10:20 am",
          },
          {
            name: "MD Arif Ansari",
            code: "STF0007",
            department: "Operations",
            lateDays: 1,
            totalLateMinutes: 33,
            lateMinutes: 33,
            punchInLabel: "8:33 am",
          },
        ],
      },
    },
  ];

  it("deterministic format shows punch-in times for a single day", () => {
    const text = formatFactsDeterministic("today late comers", dayFacts);
    expect(text).toMatch(/punched in at 10:20 am/i);
    expect(text).toMatch(/punched in at 8:33 am/i);
    expect(text).toMatch(/140 min late/);
    expect(text).not.toMatch(/1 late day/);
  });

  it("multi-day format still uses late-day aggregates without requiring punch labels", () => {
    const text = formatFactsDeterministic("late comers this week", [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          period: "This week",
          periodGrain: "week",
          focus: "late",
          peopleWithLate: 2,
          lateDayCount: 5,
          mostLate: {
            name: "Arun C Michael",
            code: "STF0003",
            lateDays: 3,
            totalLateMinutes: 200,
          },
          topLateComers: [
            {
              name: "Arun C Michael",
              code: "STF0003",
              lateDays: 3,
              totalLateMinutes: 200,
            },
          ],
        },
      },
    ]);
    expect(text).toMatch(/Top late comers/i);
    expect(text).toMatch(/3d/);
    expect(text).not.toMatch(/punched in/i);
  });

  it("llmPreservesLatePunchTimes fails on aggregate-only single-day answers", () => {
    const bad =
      "6 staff were late today. Arun C Michael · STF0003 — 1 late day · 140 late minutes.";
    expect(llmPreservesLatePunchTimes(bad, dayFacts)).toBe(false);
    const verbalNoClock =
      "Arun C Michael punched in late (140 min late); MD Arif Ansari punched in late.";
    expect(llmPreservesLatePunchTimes(verbalNoClock, dayFacts)).toBe(false);
    const good =
      "Arun C Michael punched in at 10:20 am (140 min late); MD Arif Ansari punched in at 8:33 am.";
    expect(llmPreservesLatePunchTimes(good, dayFacts)).toBe(true);
  });

  it("guard fallback keeps punch-in times when LLM omits clocks", async () => {
    const { guardNovaAnswer } = await import("@/lib/ai/nova-answer-guard");
    const omitted =
      "2 people were late today. Arun C Michael · STF0003 — 1 late day · 140 late minutes.";
    const guarded = guardNovaAnswer({
      query: "today late comers",
      facts: dayFacts,
      text: omitted,
      deterministic: false,
    });
    expect(guarded.failed).toBe(true);
    expect(guarded.failedGuard).toBe("answer_late_punch_guard");
    expect(guarded.text).toMatch(/punched in at 10:20 am/i);
    expect(guarded.text).toMatch(/punched in at 8:33 am/i);
    expect(guarded.text).toMatch(/MD Arif Ansari/i);
    expect(guarded.text).not.toMatch(/AI omitted/i);
  });

  it("count guard ignores clock digits from punch-in times", async () => {
    const { llmPreservesPrimaryCounts } = await import("@/lib/ai/nova-answer-guard");
    expect(
      llmPreservesPrimaryCounts(
        "1 person late — MD Arif Ansari punched in at 10:06 am (7 min late).",
        dayFacts.map((f) => ({
          ...f,
          data: { ...f.data, peopleWithLate: 1, latePeopleCount: 1 },
        }))
      )
    ).toBe(true);
  });

  it("llmPreservesLateStaffNames rejects invented punch attributions", () => {
    const invented =
      "Madhu M punched in at 10:11 am (12 min late); Arun C Michael punched in at 10:20 am.";
    expect(llmPreservesLateStaffNames(invented, dayFacts)).toBe(false);
    const ok =
      "Arun C Michael punched in at 10:20 am (140 min late); MD Arif Ansari punched in at 8:33 am.";
    expect(llmPreservesLateStaffNames(ok, dayFacts)).toBe(true);
  });

  it("llmPreservesLateStaffNames rejects demo-name bullet lists and empty-fact inventions", () => {
    const demoBullets = `**6 people late today**
- Rahul punched in at 10:20 am (140 min late)
- Priya punched in at 9:45 am (105 min late)
- Amit punched in at 10:00 am (100 min late)`;
    expect(llmPreservesLateStaffNames(demoBullets, dayFacts)).toBe(false);

    const emptyFacts = [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          periodGrain: "day",
          focus: "late",
          peopleWithLate: 0,
          topLateComers: [],
          mostLate: null,
        },
      },
    ];
    expect(llmPreservesLateStaffNames(demoBullets, emptyFacts)).toBe(false);
  });
});

describe("day-scoped absentees formatting + provenance", () => {
  const dayAbsentFacts = [
    {
      tool: "attendance_late_summary",
      ok: true,
      data: {
        period: "11 Jul 2026",
        periodGrain: "day",
        from: "2026-07-11",
        to: "2026-07-11",
        scope: "team",
        focus: "absent",
        absentDays: 2,
        topAbsent: [
          { name: "Madhu M", code: "STF0010", absentDays: 1 },
          { name: "Ravi Kumar", code: "STF0012", absentDays: 1 },
        ],
      },
    },
  ];

  it("single-day absent list uses Absent: without 1d ranks", () => {
    const text = formatFactsDeterministic("who are absent yesterday", dayAbsentFacts);
    expect(text).toMatch(/^Here’s who was absent:/);
    expect(text).toMatch(/\*\*Absent\*\*/);
    expect(text).toMatch(/Madhu M \(STF0010\)/);
    expect(text).toMatch(/Ravi Kumar \(STF0012\)/);
    expect(text).not.toMatch(/Most absent/i);
    expect(text).not.toMatch(/1d/);
    expect(text).not.toMatch(/what I found for/i);
  });

  it("multi-day absent still ranks with day counts", () => {
    const text = formatFactsDeterministic("who was absent this week", [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          period: "This week",
          periodGrain: "week",
          scope: "team",
          focus: "absent",
          absentDays: 5,
          topAbsent: [
            { name: "Madhu M", code: "STF0010", absentDays: 3 },
            { name: "Ravi Kumar", code: "STF0012", absentDays: 2 },
          ],
        },
      },
    ]);
    expect(text).toMatch(/Most absent/i);
    expect(text).toMatch(/3d/);
    expect(text).toMatch(/2d/);
  });

  it("composeNovaIntent labels absentees not late comers", async () => {
    const { composeNovaIntent } = await import("@/lib/ai/nova-intent");
    const intent = composeNovaIntent("who are absent yesterday");
    expect(intent.tools).toEqual(["attendance_late_summary"]);
    expect(intent.interpretedAs).toEqual(["attendance / absentees"]);
    expect(intent.interpretedAs).not.toContain("attendance / late comers");

    const late = composeNovaIntent("late comers yesterday");
    expect(late.interpretedAs).toEqual(["attendance / late comers"]);

    const present = composeNovaIntent("who was present today");
    expect(present.interpretedAs).toEqual(["attendance / present"]);

    const punchOut = composeNovaIntent("Punch out time of all staffs");
    expect(punchOut.tools).toEqual(["attendance_late_summary"]);
    expect(punchOut.interpretedAs).toEqual(["attendance / punch out"]);
    expect(punchOut.interpretedAs).not.toContain("attendance / late comers");
    expect(punchOut.interpretedAs).not.toContain("attendance / present");

    const overview = composeNovaIntent("last week attendance");
    expect(overview.tools).toEqual(["attendance_late_summary"]);
    expect(overview.interpretedAs).toEqual(["attendance overview"]);
    expect(overview.interpretedAs).not.toContain("attendance / late comers");

    const bareMonth = composeNovaIntent("attendance this month");
    expect(bareMonth.interpretedAs).toEqual(["attendance overview"]);
  });
});

describe("novaSuggestedPrompts", () => {
  it("omits finance prompts without finance grants", () => {
    const prompts = novaSuggestedPrompts(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read", "task.read.self"] }) as never,
      8
    );
    expect(prompts.some((p) => /task/i.test(p.prompt))).toBe(true);
    expect(prompts.some((p) => /receipt|sales/i.test(p.prompt))).toBe(false);
  });
});

describe("company knowledge", () => {
  it("answers what is empower app without empty tool search", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "what is empower app"
    );
    expect(res.toolsUsed).toContain("company_knowledge");
    expect(res.answer).toMatch(/emPOWER/i);
    expect(res.answer).toMatch(/BPG|Biopower/i);
    expect(res.answer).not.toMatch(/found nothing useful/i);
  });

  it("answers what is nova", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "what is nova"
    );
    expect(res.toolsUsed).toContain("company_knowledge");
    expect(res.answer).toMatch(/read-only/i);
  });
});

describe("chitchat greeting", () => {
  it("greets hi without entity search", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "hi"
    );
    expect(res.toolsUsed).toContain("greeting");
    expect(res.toolsUsed).not.toContain("search_entities");
    expect(res.answer).toMatch(/NOVA/i);
    expect(res.answer).not.toMatch(/search results/i);
    expect(res.answer).toMatch(/Hey /);
  });

  it("greets namaste with a short Hinglish flavor", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "namaste"
    );
    expect(res.toolsUsed).toContain("greeting");
    expect(res.answer).toMatch(/Namaste/);
    expect(res.answer).toMatch(/NOVA/i);
    expect(res.answer).toMatch(/main \*\*NOVA\*\* hoon/);
  });

  it("handles thanks and good morning", async () => {
    const thanks = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "thanks"
    );
    expect(thanks.toolsUsed).toContain("chitchat:thanks");
    expect(thanks.answer).toMatch(/anytime|glad|welcome/i);

    const gm = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "good morning"
    );
    expect(gm.toolsUsed).toContain("greeting");
    expect(gm.answer).toMatch(/NOVA/i);
  });

  it("answers can u chit chat warmly, not as a failed search", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "can u chit chat"
    );
    expect(res.toolsUsed).toContain("chitchat:chat");
    expect(res.answer).not.toMatch(/found nothing useful/i);
    expect(res.answer).not.toMatch(/checked what you can access/i);
    expect(res.answer).toMatch(/friendly|ERP|receipts|sales|tasks/i);
  });

  it("answers who are you / who r u without entity search", async () => {
    for (const q of ["who are you", "who r u", "what are you", "introduce yourself"]) {
      const res = await answerNovaQuery(
        user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
        q
      );
      expect(res.toolsUsed).toContain("chitchat:identity");
      expect(res.toolsUsed).not.toContain("search_entities");
      expect(res.answer).toMatch(/NOVA/i);
      expect(res.answer).toMatch(/read-only|dekh sakte/i);
      expect(res.answer).not.toMatch(/search results/i);
    }
  });

  it("answers what can you do with permission-aware example asks, not search", async () => {
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "task.read.self"],
      }),
      "what can you do"
    );
    expect(res.toolsUsed).toContain("help");
    expect(res.toolsUsed).toContain("permission_prompts");
    expect(res.toolsUsed).toContain("nova_aware");
    expect(res.toolsUsed).not.toContain("search_entities");
    expect(res.answer).toMatch(/NOVA/i);
    expect(res.answer).toMatch(/read-only/i);
    expect(res.answer).toMatch(/plain questions|permission-aware|capability/i);
    expect(res.answer).toMatch(/don['’]t create|nahi karta/i);
    expect(res.answer).not.toMatch(/I can (create|approve|pay)/i);
  });

  it("answers language support through NOVA aware engine, not entity search", async () => {
    for (const q of ["languages support", "what languages do you support"]) {
      const res = await answerNovaQuery(
        user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
        q
      );
      expect(res.toolsUsed).toContain("nova_aware");
      expect(res.toolsUsed).toContain("language_support");
      expect(res.toolsUsed).not.toContain("search_entities");
      expect(res.toolsUsed).not.toContain("clarify");
      expect(res.answer).toMatch(/English/i);
      expect(res.answer).toMatch(/Hindi/i);
      expect(res.answer).toMatch(/Malayalam/i);
      expect(res.answer).toMatch(/Tamil/i);
      expect(res.answer).toMatch(/Spanish/i);
      expect(res.answer).toMatch(/permissioned|server-authoritative/i);
      expect(res.answer).toMatch(/do \*\*not\*\* claim voice/i);
    }
  });

  it("does not treat business queries as chitchat", async () => {
    const { detectNovaChitchat } = await import("@/lib/ai/nova");
    expect(detectNovaChitchat("highest sales")).toBeNull();
    expect(detectNovaChitchat("today receipts")).toBeNull();
    expect(detectNovaChitchat("hi there how are receipts")).toBeNull();
    expect(detectNovaChitchat("can u chit chat")).toBe("chat");
    expect(detectNovaChitchat("who are you")).toBe("identity");
    expect(detectNovaChitchat("who r u")).toBe("identity");
    expect(detectNovaChitchat("who are they")).toBeNull();
  });

  it("answers Hindi/Hinglish language-ability asks without entity search", async () => {
    const phrases = [
      "aapko hindi aata hai",
      "क्या आपको हिंदी आती है",
      "do you speak hindi",
      "can you talk in hinglish",
    ];
    for (const q of phrases) {
      const res = await answerNovaQuery(
        user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
        q
      );
      expect(res.toolsUsed).toContain("chitchat:language");
      expect(res.toolsUsed).not.toContain("search_entities");
      expect(res.toolsUsed).not.toContain("friendly_no_facts");
      expect(res.answer).not.toMatch(/search results|found nothing|No matching records/i);
      expect(res.answer).toMatch(/Hindi|Hinglish|हिंदी/i);
      expect(res.answer).toMatch(/exact|numbers|figures/i);
    }

    const hinglish = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"], name: "Mike" }),
      "aapko hindi aata hai"
    );
    expect(hinglish.answer).toMatch(/Haan Mike/);
    expect(hinglish.answer).toMatch(/Hindi aur Hinglish/);
    expect(hinglish.answer).toMatch(/continue karein/i);
  });

  it("acknowledges talk-in-Hindi preference without falling to chat search", async () => {
    for (const q of ["talk to me in hindi", "hindi mein baat karo"]) {
      const res = await answerNovaQuery(
        user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
        q
      );
      expect(res.toolsUsed).toContain("chitchat:lang_prefer");
      expect(res.toolsUsed).not.toContain("chitchat:chat");
      expect(res.toolsUsed).not.toContain("search_entities");
      expect(res.answer).toMatch(/Hindi\/Hinglish|baat karte/i);
    }
  });

  it("detects language meta intents and ignores business queries", async () => {
    const { detectNovaChitchat } = await import("@/lib/ai/nova");
    const { detectNovaLanguageMeta } = await import("@/lib/ai/nova-language");
    const { detectNovaAwareQuery } = await import("@/lib/ai/nova-aware");
    expect(detectNovaLanguageMeta("aapko hindi aata hai")).toBe("language");
    expect(detectNovaLanguageMeta("do you speak hindi")).toBe("language");
    expect(detectNovaLanguageMeta("can you talk in hinglish")).toBe("language");
    expect(detectNovaLanguageMeta("talk to me in hindi")).toBe("lang_prefer");
    expect(detectNovaLanguageMeta("hindi mein baat karo")).toBe("lang_prefer");
    expect(detectNovaLanguageMeta("do you speak tamil")).toBe("language");
    expect(detectNovaAwareQuery("languages support")).toBe("language_support");
    expect(detectNovaAwareQuery("can you speak Spanish")).toBe("language_support");
    expect(detectNovaAwareQuery("what reports can NOVA generate")).toBe("reports_support");
    expect(detectNovaAwareQuery("can NOVA read documents / use reader")).toBe("reader_support");
    expect(detectNovaLanguageMeta("today receipts")).toBeNull();
    expect(detectNovaChitchat("aapko hindi aata hai")).toBe("language");
    expect(detectNovaChitchat("talk to me in hindi")).toBe("lang_prefer");
    expect(detectNovaChitchat("talk to me")).toBe("chat");
  });
});

describe("answerNovaQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
  });

  it("denies users without ai.assistant.read", async () => {
    const res = await answerNovaQuery(user({ role: "STAFF" }), "help");
    expect(res.toolsUsed).toContain("rbac_deny");
    expect(res.answer).toMatch(/not enabled/i);
  });

  it("allows staff with ai.assistant.read grant", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "help"
    );
    expect(res.toolsUsed).toContain("help");
    expect(res.answer).toMatch(/NOVA/i);
    expect(res.toolsUsed).toContain("permission_prompts");
  });

  it("includes assignees when answering overdue tasks", async () => {
    vi.mocked(prisma.task.count).mockResolvedValue(1);
    const sample = {
      id: "t1",
      taskNo: "TSK-9",
      title: "Follow up",
      status: "TODO",
      priority: "NORMAL",
      dueDate: new Date(2026, 5, 1),
      createdAt: new Date(2026, 4, 1),
      updatedAt: new Date(2026, 5, 2),
      project: { projectId: "PRJ-1", projectName: "Alpha" },
      createdByUser: { name: "Admin" },
      createdByStaff: { fullName: "Admin User", staffCode: "A1" },
      ownerUser: null,
      ownerStaff: null,
      assignees: [
        {
          role: "ASSIGNEE",
          user: { name: "Priya" },
          staff: { fullName: "Priya Nair", staffCode: "STF-22" },
        },
      ],
    };
    vi.mocked(prisma.task.findMany).mockResolvedValue([sample] as never);
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "task.read.self"],
      }),
      "overdue tasks"
    );
    expect(res.answer).toMatch(/Priya Nair/);
    expect(res.answer).not.toMatch(/not mentioned|not available in the data/i);
    expect(res.toolsUsed).toContain("tasks_summary");
  });

  it("denies bank answers without bank.read", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "what is our bank balance and statement status"
    );
    expect(res.toolsUsed).toContain("rbac_deny");
    expect(res.answer.toLowerCase()).toMatch(/bank|permission|don't have permission/i);
  });

  it("hard-denies salary even when sales is also mentioned", async () => {
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "invoice.read"],
      }),
      "show salary and sales this month"
    );
    expect(res.toolsUsed).toContain("rbac_deny");
    expect(res.answer.toLowerCase()).toMatch(/salary|payroll/);
  });

  it("hard-denies profitability with co-keyword escape removed", async () => {
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "project.read"],
      }),
      "project profitability and customer list"
    );
    expect(res.toolsUsed).toContain("rbac_deny");
    expect(res.answer.toLowerCase()).toMatch(/profitab|fund/);
  });

  it("does not block pending approvals as a mutation", async () => {
    vi.mocked(prisma.approvalRequest.findMany).mockResolvedValue([]);
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "approval.read.self"],
      }),
      "pending approvals"
    );
    expect(res.toolsUsed).not.toContain("read_only_guard");
    expect(res.toolsUsed).toContain("approvals_summary");
  });

  it("searches only via permission-gated data search", async () => {
    vi.mocked(searchBusinessData).mockResolvedValueOnce([
      {
        id: "c1",
        href: "/customers/c1",
        title: "Acme",
        kind: "Customer",
      },
    ]);
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "customer.read"],
      }),
      "search Acme"
    );
    expect(searchBusinessData).toHaveBeenCalled();
    expect(res.toolsUsed).toContain("search_entities");
    expect(res.links[0]?.href).toBe("/customers/c1");
  });

  it("clarifies bare party name instead of inventing sales", async () => {
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "customer.read"],
      }),
      "Acme"
    );
    expect(res.toolsUsed).toContain("clarify");
    // Staff without finance aggregates: no sales/receipts/outstanding chips — open-record only
    expect(res.answer).toMatch(/customer \/ project record|what should I look up/i);
    expect(res.answer).not.toMatch(/\*\*sales\*\*/);
    expect(res.toolsUsed).not.toContain("sales_summary");
  });

  it("bare party clarify includes sales chips when finance access exists", async () => {
    const res = await answerNovaQuery(
      user({
        role: "MANAGER",
        grantedPermissions: [
          "ai.assistant.read",
          "customer.read",
          "invoice.read",
          "receipt.read",
          "accounts.reports.read",
        ],
      }),
      "Acme"
    );
    expect(res.toolsUsed).toContain("clarify");
    expect(res.answer).toMatch(/sales|receipts|outstanding/i);
  });

  it("summarises july sales deterministically when money presentation is polished", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(true);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 150000, taxableValue: 127119, totalGst: 22881 },
      _count: 3,
      _avg: {},
      _min: {},
      _max: {},
    } as never);
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(3);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salesReceipt.aggregate).mockResolvedValue({
      _sum: { amount: 0 },
      _count: 0,
      _avg: {},
      _min: {},
      _max: {},
    } as never);
    vi.mocked(prisma.salesReceipt.count).mockResolvedValue(0);
    vi.mocked(prisma.salesReceipt.findMany).mockResolvedValue([]);
    vi.mocked(novaChatCompletion).mockResolvedValue({
      content: "July sales totalled **₹1,50,000** across 3 tax invoices.",
      model: "llama-3.3-70b-versatile",
      provider: "groq",
    });

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "invoice.read", "receipt.read", "accounts.reports.read"],
      }),
      "july sales"
    );

    expect(res.toolsUsed).toContain("sales_summary");
    expect(res.toolsUsed).toContain("deterministic");
    expect(res.answer).toMatch(/1,50,000|150000|sales|₹/i);
    // Money health uses deterministic_polished — do not require LLM paraphrase
    expect(res.toolsUsed).not.toContain("llm");
  });

  it("keeps reply-language rule available for hybrid paths (Hinglish greeting)", async () => {
    const { NOVA_REPLY_LANGUAGE_RULE, prefersHinglishGreeting } = await import("@/lib/ai/nova");
    expect(prefersHinglishGreeting("namaste")).toBe(true);
    expect(prefersHinglishGreeting("hi")).toBe(false);
    expect(NOVA_REPLY_LANGUAGE_RULE).toMatch(/prefer English/i);
    // Receipts money asks stay deterministic; language rule still exported for hybrid modules
    expect(selectNovaTools(normalizeNovaQuery("aaj kitna paisa aaya"))).toContain("receipts_summary");
  });

  it("answers todays reciepts with calendar-day receipts without LLM", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
    vi.mocked(prisma.salesReceipt.aggregate).mockResolvedValue({
      _sum: { amount: 25000 },
      _count: 2,
      _avg: {},
      _min: {},
      _max: {},
    } as never);
    vi.mocked(prisma.salesReceipt.count).mockResolvedValue(2);
    vi.mocked(prisma.salesReceipt.findMany).mockResolvedValue([
      {
        receiptNumber: "R-1",
        receiptDate: new Date(2026, 6, 10),
        amount: 15000,
        customer: { customerName: "Acme" },
      },
    ] as never);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 0, taxableValue: 0, totalGst: 0 },
      _count: 0,
      _avg: {},
      _min: {},
      _max: {},
    } as never);
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(0);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([]);
    vi.mocked(prisma.paymentRequest.count).mockResolvedValue(0);
    vi.mocked(prisma.purchaseBill.count).mockResolvedValue(0);
    vi.mocked(prisma.approvalRequest.count).mockResolvedValue(0);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "receipt.read", "invoice.read", "accounts.reports.read"],
      }),
      "todays reciepts"
    );

    expect(res.toolsUsed).toContain("receipts_summary");
    expect(res.toolsUsed).toContain("deterministic");
    expect(res.answer).toMatch(/25,000|25000|Collections/i);
    expect(res.answer).not.toMatch(/^July 2026$/m);
    // Period label should be a day, not the month name alone
    expect(res.answer).toMatch(/10/);
  });

  it("rechecks project value with history instead of empty search", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(true);
    vi.mocked(prisma.project.count).mockResolvedValue(12);
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      {
        projectId: "C0001-P001",
        projectName: "Big Plant",
        status: "EXECUTION",
        projectValue: 10000000,
        createdAt: new Date(2026, 5, 1),
        customer: { customerName: "Acme" },
      },
      {
        projectId: "ADJ-1",
        projectName: "Fy 25-26 Adjustment",
        status: "EXECUTION",
        projectValue: 24600000,
        createdAt: new Date(2026, 4, 1),
        customer: { customerName: "Internal" },
      },
    ] as never);
    vi.mocked(novaChatCompletion).mockResolvedValue({
      content: "Biggest operational project is **Big Plant** at **₹1,00,00,000** (FY 26-27 scope).",
      model: "test",
      provider: "groq",
    });

    const res = await answerNovaQuery(
      user({
        role: "SUPER_ADMIN",
        grantedPermissions: ["ai.assistant.read"],
        canSeeProjectValue: true,
      }),
      "can u recheck that",
      [
        { role: "user", content: "biggest project" },
        { role: "assistant", content: "Here is a receipt by mistake" },
      ]
    );

    expect(res.toolsUsed).toContain("projects_summary");
    expect(res.toolsUsed).toContain("follow_up");
    expect(res.answer).toMatch(/Big Plant|1,00,00,000|project/i);
    // LLM prompt facts should not rank the adjustment as biggest — verify tool path filtered
    const llmCall = vi.mocked(novaChatCompletion).mock.calls[0]?.[0];
    const userContent = llmCall?.find((m) => m.role === "user")?.content ?? "";
    expect(userContent).toMatch(/Big Plant/);
    expect(userContent).not.toMatch(/"name":"Fy 25-26 Adjustment"/);
  });
});

describe("sanitizeNovaFactsForLlm", () => {
  it("redacts secrets and caps arrays", async () => {
    const { sanitizeNovaFactsForLlm } = await import("@/lib/ai/nova-llm-sanitize");
    const out = sanitizeNovaFactsForLlm([
      {
        tool: "sales_summary",
        ok: true,
        data: {
          accountNumber: "1234567890",
          phone: "9999999999",
          email: "a@b.com",
          gstin: "33ABCDE1234F1Z5",
          accounts: Array.from({ length: 20 }, (_, i) => ({ id: `A${i}`, name: "x".repeat(300) })),
        },
      },
    ]) as Array<{ data: Record<string, unknown> }>;
    expect(out[0].data.accountNumber).toBe("[redacted]");
    expect(out[0].data.phone).toBe("[redacted]");
    expect(out[0].data.email).toBe("[redacted]");
    expect(out[0].data.gstin).toBe("[redacted]");
    expect(out[0].data.accounts).toHaveLength(8);
    expect(String((out[0].data.accounts as { name: string }[])[0].name).length).toBeLessThanOrEqual(160);
  });

  it("keeps raw money numbers and strips denied fact data", async () => {
    const { sanitizeNovaFactsForLlm } = await import("@/lib/ai/nova-llm-sanitize");
    const out = sanitizeNovaFactsForLlm([
      {
        tool: "sales_summary",
        ok: true,
        data: { grandTotal: 637000, grandTotalInr: "₹6,37,000.00", invoiceCount: 9 },
      },
      {
        tool: "salary_summary",
        ok: false,
        denied: true,
        error: "Missing hr.salary.read",
        data: { paidTotal: 999999, samples: [{ amount: 50000 }] },
      },
    ]) as Array<{ tool: string; ok: boolean; denied?: boolean; data?: Record<string, unknown> }>;
    expect(out[0].data?.grandTotal).toBe(637000);
    expect(out[0].data?.grandTotalInr).toBe("₹6,37,000.00");
    expect(out[1].denied).toBe(true);
    expect(out[1].data).toBeUndefined();
  });

  it("applies salary_summary allow-list (no employee samples)", async () => {
    const { sanitizeNovaFactsForLlm } = await import("@/lib/ai/nova-llm-sanitize");
    const out = sanitizeNovaFactsForLlm([
      {
        tool: "salary_summary",
        ok: true,
        data: {
          paidTotal: 100000,
          paidTotalInr: "₹1,00,000.00",
          employeeCount: 3,
          samples: [{ name: "Alice", netPay: 50000, phone: "1" }],
          narration: "payroll run",
        },
      },
    ]) as Array<{ data: Record<string, unknown> }>;
    expect(out[0].data.paidTotal).toBe(100000);
    expect(out[0].data.employeeCount).toBe(3);
    expect(out[0].data.samples).toBeUndefined();
    expect(out[0].data.narration).toBeUndefined();
  });

  it("NOVA-06 expands allow-lists for leave / outstanding / vendors (drops extra keys)", async () => {
    const { sanitizeNovaFactsForLlm, novaToolsWithFieldAllowList } = await import(
      "@/lib/ai/nova-llm-sanitize"
    );
    expect(novaToolsWithFieldAllowList()).toEqual(
      expect.arrayContaining([
        "leave_summary",
        "overtime_summary",
        "regularisation_summary",
        "customer_outstanding",
        "vendors_summary",
        "customers_summary",
        "payment_requests_summary",
        "staff_expense_summary",
        "incentives_summary",
        "search_entities",
      ]),
    );

    const out = sanitizeNovaFactsForLlm([
      {
        tool: "leave_summary",
        ok: true,
        data: {
          pendingCount: 2,
          samples: [{ staff: "Alice", code: "E1", type: "CL", days: 1 }],
          rawMessage: "should drop",
          secretToken: "x",
        },
      },
      {
        tool: "customer_outstanding",
        ok: true,
        data: {
          outstandingTotal: 9000,
          top: [{ customer: "Acme", outstanding: 9000 }],
          bankAccount: "leak",
        },
      },
      {
        tool: "vendors_summary",
        ok: true,
        data: {
          activeCount: 1,
          recentVendors: [{ id: "V1", name: "Steel Co", href: "/vendors/1" }],
          gstin: "33ABCDE1234F1Z5",
        },
      },
    ]) as Array<{ data: Record<string, unknown> }>;

    expect(out[0].data.pendingCount).toBe(2);
    expect(out[0].data.samples).toEqual([{ staff: "Alice", code: "E1", type: "CL", days: 1 }]);
    expect(out[0].data.rawMessage).toBeUndefined();
    expect(out[0].data.secretToken).toBeUndefined();

    expect(out[1].data.outstandingTotal).toBe(9000);
    expect(out[1].data.top).toEqual([{ customer: "Acme", outstanding: 9000 }]);
    expect(out[1].data.bankAccount).toBeUndefined();

    expect(out[2].data.activeCount).toBe(1);
    expect(out[2].data.recentVendors).toEqual([
      { id: "V1", name: "Steel Co", href: "/vendors/1" },
    ]);
    expect(out[2].data.gstin).toBeUndefined();
  });

  it("strips bank account identifiers via bank allow-list", async () => {
    const { sanitizeNovaFactsForLlm } = await import("@/lib/ai/nova-llm-sanitize");
    const out = sanitizeNovaFactsForLlm([
      {
        tool: "bank_accounts_summary",
        ok: true,
        data: {
          accountCount: 2,
          totalBalance: 5000,
          totalBalanceInr: "₹5,000.00",
          accounts: [{ name: "HDFC", accountNumber: "1234", ifsc: "HDFC0001" }],
        },
      },
    ]) as Array<{ data: Record<string, unknown> }>;
    expect(out[0].data.accountCount).toBe(2);
    expect(out[0].data.totalBalance).toBe(5000);
    expect(out[0].data.accounts).toBeUndefined();
  });

  it("keeps attendance late names and punch labels for the LLM", async () => {
    const { sanitizeNovaFactsForLlm } = await import("@/lib/ai/nova-llm-sanitize");
    const out = sanitizeNovaFactsForLlm([
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          period: "12 Jul 2026",
          periodGrain: "day",
          focus: "late",
          peopleWithLate: 1,
          latePeopleCount: 1,
          mostLate: {
            name: "Arun C Michael",
            code: "STF0003",
            lateMinutes: 140,
            punchInLabel: "10:20 am",
          },
          topLateComers: [
            {
              name: "Arun C Michael",
              code: "STF0003",
              lateMinutes: 140,
              punchInLabel: "10:20 am",
            },
          ],
          salary: 999999,
        },
      },
    ]) as Array<{ data: Record<string, unknown> }>;
    expect(out[0].data.period).toBe("12 Jul 2026");
    expect(out[0].data.peopleWithLate).toBe(1);
    expect(out[0].data.salary).toBeUndefined();
    const top = out[0].data.topLateComers as { name: string; punchInLabel: string }[];
    expect(top[0].name).toBe("Arun C Michael");
    expect(top[0].punchInLabel).toBe("10:20 am");
  });

  it("keeps punchOutLabel for punch_out focus (hybrid LLM path)", async () => {
    const { sanitizeNovaFactsForLlm } = await import("@/lib/ai/nova-llm-sanitize");
    const out = sanitizeNovaFactsForLlm([
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          period: "13 Jul 2026",
          periodGrain: "day",
          focus: "punch_out",
          presentPunchDays: 2,
          topPresent: [
            {
              name: "Aalok Jha",
              code: "STF0008",
              punchInLabel: "9:30 am",
              punchOutLabel: "6:00 pm",
              punchOutTime: "2026-07-13T12:30:00.000Z",
              status: "PRESENT",
            },
            {
              name: "Arun C Michael",
              code: "STF0003",
              punchInLabel: "10:20 am",
              punchOutLabel: null,
              punchOutTime: null,
              status: "MISSING_PUNCH_OUT",
            },
          ],
          salary: 999999,
        },
      },
    ]) as Array<{ data: Record<string, unknown> }>;
    expect(out[0].data.focus).toBe("punch_out");
    expect(out[0].data.salary).toBeUndefined();
    const top = out[0].data.topPresent as {
      name: string;
      punchOutLabel: string | null;
      punchOutTime: string | null;
    }[];
    expect(top[0].punchOutLabel).toBe("6:00 pm");
    expect(top[0].punchOutTime).toBe("2026-07-13T12:30:00.000Z");
    expect(top[1].punchOutLabel).toBeNull();
  });
});

describe("nova money consistency", () => {
  it("novaMoney pairs raw + en-IN Inr", async () => {
    const { novaMoney, novaInrDigits, llmPreservesPrimaryMoney } = await import("@/lib/ai/nova-money");
    const m = novaMoney(637000);
    expect(m.value).toBe(637000);
    expect(m.valueInr).toMatch(/6,37,000/);
    expect(novaInrDigits(m.valueInr)).toBe("637000");

    const facts = [
      {
        tool: "sales_summary",
        ok: true,
        data: { grandTotal: 637000, grandTotalInr: m.valueInr, invoiceCount: 9 },
      },
    ];
    expect(llmPreservesPrimaryMoney(`FY sales totalled **${m.valueInr}** across 9 invoices.`, facts)).toBe(
      true
    );
    // Classic Indian-comma misread: 6,37,000 → 63,70,000
    expect(llmPreservesPrimaryMoney("FY sales totalled **₹63,70,000** across 9 invoices.", facts)).toBe(
      false
    );
    // Rs. / INR prefixes count as preserving the amount
    expect(llmPreservesPrimaryMoney("FY sales totalled **Rs. 6,37,000.00** across 9 invoices.", facts)).toBe(
      true
    );
    // Optional space after ₹ must not trip the money guard
    expect(llmPreservesPrimaryMoney("FY sales totalled **₹ 6,37,000.00** across 9 invoices.", facts)).toBe(
      true
    );
  });

  it("money guard catches taxable/GST misreads when present", async () => {
    const { llmPreservesPrimaryMoney } = await import("@/lib/ai/nova-money");
    const facts = [
      {
        tool: "sales_summary",
        ok: true,
        data: {
          grandTotalInr: "₹6,37,000.00",
          taxableTotalInr: "₹6,21,600.00",
          gstTotalInr: "₹15,400.00",
        },
      },
    ];
    expect(
      llmPreservesPrimaryMoney(
        "Sales **₹6,37,000.00**, taxable **₹6,21,600.00**, GST **₹15,400.00**.",
        facts
      )
    ).toBe(true);
    // Taxable 10× misread while grand total looks fine
    expect(
      llmPreservesPrimaryMoney(
        "Sales **₹6,37,000.00**, taxable **₹62,16,000.00**, GST **₹15,400.00**.",
        facts
      )
    ).toBe(false);
  });

  it("formatFactsDeterministic leads with grandTotalInr and notes partial samples", () => {
    const text = formatFactsDeterministic("FY 26-27 sales", [
      {
        tool: "sales_summary",
        ok: true,
        data: {
          period: "FY 26-27",
          invoiceCount: 9,
          sampleCount: 8,
          grandTotal: 637000,
          grandTotalInr: "₹6,37,000.00",
          taxableTotal: 621600,
          taxableTotalInr: "₹6,21,600.00",
          gstTotal: 15400,
          gstTotalInr: "₹15,400.00",
        },
      },
    ]);
    expect(text).toMatch(/₹6,37,000/);
    expect(text).toMatch(/\*\*9\*\* tax invoice/);
    expect(text).toMatch(/Showing 8 of 9/);
    expect(text).toMatch(/Taxable.*₹6,21,600/);
    expect(text).not.toMatch(/63,70,000/);
  });

  it("formatFactsDeterministic names customers on receivables samples", () => {
    const text = formatFactsDeterministic("who are they", [
      {
        tool: "receivables_summary",
        ok: true,
        data: {
          overdueCount: 3,
          overdueTotalInr: "₹1,20,000.00",
          openInvoiceCount: 5,
          openInvoiceTotalInr: "₹2,00,000.00",
          sampleCount: 2,
          samples: [
            { number: "SI-1", customer: "Acme Solar", amountInr: "₹80,000.00", due: "2026-06-01" },
            { number: "SI-2", customer: "Beta Power", amountInr: "₹40,000.00", due: "2026-06-15" },
          ],
        },
      },
    ]);
    expect(text).toMatch(/Acme Solar/);
    expect(text).toMatch(/Beta Power/);
    expect(text).toMatch(/Showing 2 of 3/);
  });
});

describe("novaFirstName", () => {
  it("uses first token and falls back to there", async () => {
    const { novaFirstName } = await import("@/lib/ai/nova");
    expect(novaFirstName({ name: "Mike Arun" })).toBe("Mike");
    expect(novaFirstName({ name: "" })).toBe("there");
    expect(novaFirstName({ name: null })).toBe("there");
  });

  it("greets with first name", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", name: "Priya Nair", grantedPermissions: ["ai.assistant.read"] }),
      "hi"
    );
    expect(res.answer).toMatch(/Priya/);
  });
});

describe("RBAC isolation regressions", () => {
  it("soft-denies order book for staff with only project.read", async () => {
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "project.read"],
      }),
      "order book"
    );
    expect(res.toolsUsed.some((t) => t === "rbac_soft_deny" || t === "rbac_deny")).toBe(true);
    expect(res.toolsUsed).not.toContain("order_book_summary");
  });

  it("scopes payment_requests_summary for STAFF via list where", async () => {
    const { runNovaTools } = await import("@/lib/ai/nova-tools");
    vi.mocked(prisma.paymentRequest.count).mockResolvedValue(1);
    vi.mocked(prisma.paymentRequest.aggregate).mockResolvedValue({
      _sum: { amount: 1000 },
    } as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([
      {
        id: "pr1",
        paymentRequestId: "PR-1",
        status: "SUBMITTED",
        amount: 1000,
        purpose: "Mine",
      },
    ] as never);
    const pack = await runNovaTools(
      user({
        role: "STAFF",
        id: "staff-u1",
        grantedPermissions: ["ai.assistant.read", "paymentrequest.create", "paymentrequest.read"],
      }),
      "payment requests pending",
      ["payment_requests_summary"]
    );
    const call = vi.mocked(prisma.paymentRequest.findMany).mock.calls[0]?.[0] as {
      where?: { AND?: unknown[] };
    };
    expect(JSON.stringify(call?.where)).toMatch(/requestedBy|staffId|requestedForUserId/);
    expect(pack.facts[0]?.data).toMatchObject({ scope: "self" });
  });

  it("payment requests count uses deterministic answer — no inconsistency disclaimer", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(true);
    vi.mocked(novaChatCompletion).mockClear();
    vi.mocked(prisma.paymentRequest.count).mockResolvedValue(10);
    vi.mocked(prisma.paymentRequest.aggregate).mockResolvedValue({
      _sum: { amount: 50000 },
    } as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([
      {
        id: "pr1",
        paymentRequestId: "PR-1",
        status: "SUBMITTED",
        amount: 50000,
        purpose: "Staff advance",
      },
    ] as never);
    vi.mocked(novaChatCompletion).mockResolvedValue({
      content: "There are **₹10** payment requests awaiting (misread count as money).",
      model: "test",
      provider: "groq",
    });

    const { packPrefersDeterministicCounts } = await import("@/lib/ai/nova-money");
    expect(
      packPrefersDeterministicCounts([
        {
          tool: "payment_requests_summary",
          ok: true,
          data: { awaitingActionCount: 10, samples: [{ amountInr: "₹50,000.00" }] },
        },
      ])
    ).toBe(true);

    const { novaSkillPrefersDeterministic } = await import("@/lib/nova/skills/registry");
    // OT is in NOVA_COUNT_FIRST_TOOLS; skill flag also drives preferDeterministic for delivery/GRN.
    expect(
      packPrefersDeterministicCounts([
        { tool: "overtime_summary", ok: true, data: { pendingCount: 3 } },
      ])
    ).toBe(true);
    expect(
      packPrefersDeterministicCounts(
        [{ tool: "overtime_summary", ok: true, data: { pendingCount: 3 } }],
        novaSkillPrefersDeterministic
      )
    ).toBe(true);
    expect(
      packPrefersDeterministicCounts(
        [
          {
            tool: "delivery_summary",
            ok: true,
            data: { deliveryCount: 2, delayedCount: 1, incompleteCount: 1 },
          },
        ],
        novaSkillPrefersDeterministic
      )
    ).toBe(true);
    expect(
      packPrefersDeterministicCounts(
        [{ tool: "grn_summary", ok: true, data: { receiptCount: 4 } }],
        novaSkillPrefersDeterministic
      )
    ).toBe(true);
    expect(
      packPrefersDeterministicCounts(
        [{ tool: "daily_brief", ok: true, data: { role: "manager", sections: [] } }],
        novaSkillPrefersDeterministic
      )
    ).toBe(true);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "paymentrequest.read", "paymentrequest.create"],
      }),
      "payment requests pending"
    );

    expect(res.toolsUsed).toContain("payment_requests_summary");
    expect(res.toolsUsed).toContain("deterministic");
    expect(res.toolsUsed).toContain("count_first");
    expect(res.toolsUsed).toContain("presentation:deterministic_polished");
    expect(res.toolsUsed).not.toContain("llm");
    expect(res.answer).toMatch(/Payment requests/i);
    expect(res.answer).toMatch(/Awaiting action: \*\*10\*\*/i);
    expect(res.answer).not.toMatch(/inconsistently/i);
    expect(res.answer).not.toMatch(/ERP totals/i);
    expect(novaChatCompletion).not.toHaveBeenCalled();
  });

  it("NOVA-05: delivery_summary preferDeterministic skips LLM", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(true);
    vi.mocked(novaChatCompletion).mockClear();
    vi.mocked(novaChatCompletion).mockResolvedValue({
      content: "Invented delivery prose with wrong counts.",
      model: "test",
      provider: "groq",
    });
    vi.mocked(prisma.deliveryRecord.count).mockResolvedValue(3);
    vi.mocked(prisma.deliveryRecord.groupBy).mockResolvedValue([
      { stage: "DISPATCHED", _count: 2 },
      { stage: "DELIVERED", _count: 1 },
    ] as never);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
      {
        id: "d1",
        stage: "DISPATCHED",
        dispatchDate: new Date("2026-06-01"),
        deliveredDate: null,
        updatedAt: new Date("2026-06-10"),
        project: {
          projectName: "Site A",
          projectId: "P-1",
          expectedCompletionDate: new Date("2026-05-01"),
        },
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "MANAGER",
        grantedPermissions: ["ai.assistant.read", "delivery.read"],
      }),
      "delivery delays"
    );

    expect(res.toolsUsed).toContain("delivery_summary");
    expect(res.toolsUsed).toContain("deterministic");
    expect(res.toolsUsed).toContain("prefer_deterministic");
    expect(res.toolsUsed).not.toContain("llm");
    expect(novaChatCompletion).not.toHaveBeenCalled();
    expect(res.answer.length).toBeGreaterThan(20);
  });

  it("delivery delay report intent exposes a savable PDF/chart pack", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(true);
    vi.mocked(novaChatCompletion).mockClear();
    vi.mocked(prisma.deliveryRecord.count).mockResolvedValue(4);
    vi.mocked(prisma.deliveryRecord.groupBy).mockResolvedValue([
      { stage: "DISPATCHED", _count: 2 },
      { stage: "INSTALLATION_PENDING", _count: 2 },
    ] as never);
    vi.mocked(prisma.deliveryRecord.findMany).mockResolvedValue([
      {
        id: "d1",
        stage: "DISPATCHED",
        dispatchDate: new Date("2026-06-01"),
        deliveredDate: null,
        updatedAt: new Date("2026-06-10"),
        engineerInCharge: "Amit",
        project: {
          projectName: "Site Alpha",
          projectId: "P-1",
          expectedCompletionDate: new Date("2026-05-01"),
          customer: { customerName: "Alpha Customer" },
        },
      },
      {
        id: "d2",
        stage: "INSTALLATION_PENDING",
        dispatchDate: new Date("2026-06-15"),
        deliveredDate: null,
        updatedAt: new Date("2026-06-20"),
        engineerInCharge: "Neha",
        project: {
          projectName: "Site Beta",
          projectId: "P-2",
          expectedCompletionDate: new Date("2026-05-20"),
          customer: { customerName: "Beta Customer" },
        },
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "MANAGER",
        grantedPermissions: ["ai.assistant.read", "delivery.read"],
      }),
      "delivery delay reports"
    );

    expect(res.toolsUsed).toContain("delivery_summary");
    expect(res.toolsUsed).toContain("deterministic");
    expect(res.pack?.packId).toBe("delivery_delay_report");
    expect(res.pack?.charts.map((c) => c.title)).toEqual(
      expect.arrayContaining(["Delay days by project", "Status distribution"])
    );
    expect(res.pack?.facts[0]?.data?.topDelayed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          project: "Site Alpha",
          customer: "Alpha Customer",
          engineer: "Amit",
        }),
      ])
    );
    expect(res.answer).toMatch(/Save report/i);
    expect(novaChatCompletion).not.toHaveBeenCalled();
  });

  it("receivables report intent exposes a savable PDF/chart pack", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
    vi.mocked(novaChatCompletion).mockClear();
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(2);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 100000 },
    } as never);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([
      {
        id: "inv1",
        invoiceNumber: "INV-1",
        dueDate: new Date("2026-05-01"),
        grandTotal: 60000,
        status: "OVERDUE",
        customer: { customerName: "Acme Corp" },
      },
      {
        id: "inv2",
        invoiceNumber: "INV-2",
        dueDate: new Date("2026-06-01"),
        grandTotal: 40000,
        status: "SENT",
        customer: { customerName: "Beta Ltd" },
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "DIRECTOR",
        grantedPermissions: ["ai.assistant.read", "invoice.read", "accounts.reports.read"],
      }),
      "receivables report with charts"
    );

    expect(res.toolsUsed).toContain("receivables_summary");
    expect(res.pack?.packId).toBe("receivables_report");
    expect(res.pack?.charts.length).toBeGreaterThan(0);
    expect(res.pack?.tables?.[0]?.title).toMatch(/Overdue/i);
    expect(res.answer).toMatch(/Save report/i);
  });

  it("money guard silent fallback when count pack has no headline ₹", async () => {
    const { llmPreservesPrimaryMoney, factsHaveHeadlineMoney } = await import("@/lib/ai/nova-money");
    const facts = [
      {
        tool: "payment_requests_summary",
        ok: true,
        data: {
          awaitingActionCount: 10,
          samples: [{ amountInr: "₹50,000.00" }],
        },
      },
    ];
    expect(factsHaveHeadlineMoney(facts)).toBe(false);
    // Invented ₹ when no headline money → guard fails (would have triggered disclaimer before)
    expect(llmPreservesPrimaryMoney("Awaiting **₹10** requests.", facts)).toBe(false);
    expect(llmPreservesPrimaryMoney("Payment requests awaiting action: **10**.", facts)).toBe(true);
  });

  it("novaCanRunTool blocks sales without finance aggregates", async () => {
    const { novaCanRunTool } = await import("@/lib/ai/nova-suggest");
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read", "invoice.read"],
        }) as never,
        "sales_summary"
      )
    ).toBe(false);
    expect(
      novaCanRunTool(
        user({
          role: "ACCOUNTANT",
          grantedPermissions: ["ai.assistant.read", "invoice.read", "accounts.reports.read"],
        }) as never,
        "sales_summary"
      )
    ).toBe(true);
  });

  it("novaCanRunTool gates vendor_bank_open on bank.viewfullaccount (POL-1: ops roles stripped)", async () => {
    const { novaCanRunTool } = await import("@/lib/ai/nova-suggest");
    // POL-1: STAFF/MANAGER can never effectively hold bank.viewfullaccount even if granted,
    // so vendor_bank_open must stay denied for them (no re-opened vendor-bank hole).
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read", "bank.viewfullaccount"],
        }) as never,
        "vendor_bank_open"
      )
    ).toBe(false);
    // Non-ops role (ACCOUNTANT) with the grant keeps vendor-bank parity.
    expect(
      novaCanRunTool(
        user({
          role: "ACCOUNTANT",
          grantedPermissions: ["ai.assistant.read", "bank.viewfullaccount"],
        }) as never,
        "vendor_bank_open"
      )
    ).toBe(true);
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read", "vendor.read"],
        }) as never,
        "vendor_bank_open"
      )
    ).toBe(false);
  });

  it("documents lexicon soft-deny uses documents.read not ai.assistant.read alone", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "documents"
    );
    expect(res.toolsUsed).not.toContain("documents_open");
    expect(res.toolsUsed.some((t) => t === "rbac_soft_deny" || t === "rbac_deny")).toBe(true);
  });

  it("E2E money-hide: Staff with invoice.read soft-denies today sales", async () => {
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "invoice.read"],
      }),
      "today sales"
    );
    expect(res.toolsUsed).not.toContain("sales_summary");
    expect(res.toolsUsed.some((t) => t === "rbac_soft_deny" || t === "rbac_deny")).toBe(true);
    expect(res.answer).not.toMatch(/₹|INR|grandTotal/i);
  });

  it("leave_summary preferDeterministic skips LLM and carries provenance", async () => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(true);
    vi.mocked(novaChatCompletion).mockClear();
    vi.mocked(novaChatCompletion).mockResolvedValue({
      content: "Invented leave prose.",
      model: "test",
      provider: "groq",
    });
    vi.mocked(prisma.staffProfile.findFirst).mockResolvedValue({ id: "st1" } as never);
    vi.mocked(prisma.hrLeaveType.findMany).mockResolvedValue([
      { id: "lt1", name: "Casual", paid: true, annualAllowance: 12 },
    ] as never);
    vi.mocked(prisma.hrLeaveRequest.count).mockResolvedValue(0);
    vi.mocked(prisma.hrLeaveRequest.findMany).mockResolvedValue([] as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.leave.create", "hr.leave.read"],
      }),
      "my leave balance"
    );

    expect(res.toolsUsed).toContain("leave_summary");
    expect(res.toolsUsed).toContain("deterministic");
    expect(res.toolsUsed).toContain("prefer_deterministic");
    expect(res.toolsUsed).not.toContain("llm");
    expect(novaChatCompletion).not.toHaveBeenCalled();
    expect(res.periodLabel || res.provenance?.period).toBeTruthy();
    expect(res.provenance?.sources?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("novaOpenApprovalsWhere", () => {
  it("scopes team like self, not org-wide", async () => {
    const { novaOpenApprovalsWhere } = await import("@/lib/ai/nova-approvals");
    const team = novaOpenApprovalsWhere(
      user({ role: "MANAGER", grantedPermissions: ["approval.read.team"] })
    );
    expect(team).toBeTruthy();
    expect(JSON.stringify(team)).toMatch(/submittedByUserId|currentApproverUserId/);
    expect(JSON.stringify(team)).not.toBe(JSON.stringify({ status: { in: ["PENDING_APPROVAL", "SUBMITTED", "ESCALATED"] } }));

    const all = novaOpenApprovalsWhere(
      user({ role: "ADMIN", grantedPermissions: ["approval.read.all"] })
    );
    expect(all).toEqual({ status: { in: ["PENDING_APPROVAL", "SUBMITTED", "ESCALATED"] } });
  });
});

describe("lexicon synonym routing", () => {
  it.each([
    ["today collections", "receipts_summary"],
    ["money in today", "receipts_summary"],
    ["AR aging", "receivables_summary"],
    ["AP creditors", "purchase_bills_summary"],
    ["GST bill July", "sales_summary"],
    ["tax invoice this month", "sales_summary"],
    ["indent pending", "purchase_requests_summary"],
    ["challan this month", "delivery_summary"],
    ["who came late", "attendance_late_summary"],
    ["who punched late", "attendance_late_summary"],
    ["who punched late today", "attendance_late_summary"],
    ["order book", "order_book_summary"],
    ["Target FY 26-27", "order_book_summary"],
    ["FY 26-27 target", "order_book_summary"],
    ["director dashboard", "director_dashboard_summary"],
    ["credit notes this month", "credit_notes_summary"],
    ["grn this month", "grn_summary"],
    // P0 routing phrases
    ["delivery delays", "delivery_summary"],
    ["kpi list", "kpi_summary"],
    ["kiska kpi kam hai", "kpi_summary"],
    ["last payments approved", "payment_requests_summary"],
    ["last payments uproved", "payment_requests_summary"],
    ["todays payment", "payment_requests_summary"],
    ["today's payment", "payment_requests_summary"],
  ] as const)("routes %s → %s", (q, tool) => {
    const nq = normalizeNovaQuery(q);
    expect(selectNovaTools(nq)).toContain(tool);
  });

  it("does not period-clarify bare KPI / list / kiska asks", () => {
    const now = new Date("2026-07-11T09:00:00+05:30");
    for (const q of ["kpi list", "kiska kpi kam hai", "staff kpi", "kpi"]) {
      const nq = normalizeNovaQuery(q);
      expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata"), q).toBeNull();
      expect(selectNovaTools(nq), q).toContain("kpi_summary");
    }
  });

  it("does not bare-entity steal delivery delays or payments", () => {
    const now = new Date("2026-07-11T09:00:00+05:30");
    for (const q of ["delivery delays", "last payments approved", "approved payments"]) {
      const nq = normalizeNovaQuery(q);
      expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata"), q).toBeNull();
    }
  });

  it("todays payment is not bare-period clarify; bare today still clarifies metric", () => {
    const now = new Date("2026-07-11T09:00:00+05:30");
    expect(novaAmbiguityClarification(normalizeNovaQuery("todays payment"), now, "Asia/Kolkata")).toBeNull();
    expect(novaAmbiguityClarification(normalizeNovaQuery("today"), now, "Asia/Kolkata")).toMatch(
      /which metric|sales|receipts/i
    );
  });

  it("normalizes uproved → approved", () => {
    expect(normalizeNovaQuery("last payments uproved")).toMatch(/payment requests/i);
    expect(normalizeNovaQuery("last payments uproved")).toMatch(/approved/i);
  });

  it("answerNovaQuery retrieves P0 phrases instead of clarify/unmatch", async () => {
    const u = user({
      role: "ADMIN",
      grantedPermissions: [
        "ai.assistant.read",
        "delivery.read",
        "kpi.read.all",
        "paymentrequest.read",
        "invoice.read",
        "receipt.read",
        "hr.attendance.team",
      ],
    });
    for (const q of [
      "delivery delays",
      "kpi list",
      "kiska kpi kam hai",
      "last payments approved",
      "last payments uproved",
      "todays payment",
    ]) {
      const res = await answerNovaQuery(u, q);
      expect(res.toolsUsed, q).not.toContain("clarify");
      expect(res.answer, q).not.toMatch(/what should I look up|I'm not sure what to pull|which metric/i);
    }
    // Regression: bare today still clarifies; period+metric still routes
    const bareToday = await answerNovaQuery(u, "today");
    expect(bareToday.toolsUsed).toContain("clarify");
    expect(selectNovaTools(normalizeNovaQuery("today sales"))).toContain("sales_summary");
    expect(selectNovaTools(normalizeNovaQuery("today receipts"))).toContain("receipts_summary");
    expect(selectNovaTools(normalizeNovaQuery("today late comers"))).toContain("attendance_late_summary");
  });

  it("clarifies bare PR / open orders", () => {
    expect(novaAcronymClarification("PR")?.answer).toMatch(/payment request|purchase request/i);
    expect(novaAcronymClarification("open orders")?.answer).toMatch(/sales orders|purchase orders/i);
    expect(novaAcronymClarification("SO")?.answer).toMatch(/sales orders/i);
  });

  it("answerNovaQuery clarifies bare PR", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "PR"
    );
    expect(res.toolsUsed).toContain("clarify_acronym");
  });
});

describe("P1 delivery defaults + delays + suggest chips", () => {
  it("bare delivery / stock are high-confidence intent (default month in tool)", async () => {
    const { composeNovaIntent } = await import("@/lib/ai/nova-intent");
    for (const q of ["delivery", "deliveries", "stock"]) {
      const intent = composeNovaIntent(normalizeNovaQuery(q));
      expect(intent.confidence, q).toBe("high");
      expect(intent.tools, q).toEqual(
        q.startsWith("stock") ? ["stock_summary"] : ["delivery_summary"]
      );
      expect(intent.clarify, q).toBeUndefined();
    }
  });

  it("preserves delay focus on delivery delays (does not collapse to bare delivery)", () => {
    const nq = normalizeNovaQuery("delivery delays");
    expect(nq).toMatch(/delay/i);
    expect(selectNovaTools(nq)).toEqual(["delivery_summary"]);
    expect(novaAmbiguityClarification(nq, new Date("2026-07-11T09:00:00+05:30"), "Asia/Kolkata")).toBeNull();
  });

  it("formats delivery delay facts with top delayed rows", async () => {
    const { formatFactsDeterministic } = await import("@/lib/ai/nova-format");
    const text = formatFactsDeterministic("delivery delays", [
      {
        tool: "delivery_summary",
        ok: true,
        data: {
          period: "open / incomplete",
          focus: "delays",
          incompleteCount: 3,
          delayedCount: 2,
          deliveryCount: 3,
          topDelayed: [
            {
              projectId: "P001",
              project: "Site Alpha",
              stage: "DISPATCHED",
              delayDays: 21,
              dispatch: "2026-06-01",
              dispatchOverdue: true,
              stuckDays: 12,
            },
            {
              projectId: "P002",
              project: "Site Beta",
              stage: "PRODUCTION_STARTED",
              delayDays: 9,
              stuckDays: 9,
            },
          ],
        },
      },
    ]);
    expect(text).toMatch(/Delivery delays/i);
    expect(text).toMatch(/Most delayed/i);
    expect(text).toMatch(/Site Alpha/);
    expect(text).toMatch(/21d/);
  });

  it("formats delivery delay facts for the canonical delivery_delayed focus (bug sweep lock)", async () => {
    // The delivery_summary tool emits focus="delivery_delayed"/"installation_delayed";
    // the formatter must render the "Most delayed" section for those canonical values.
    const { formatFactsDeterministic } = await import("@/lib/ai/nova-format");
    for (const focus of ["delivery_delayed", "installation_delayed", "delays"]) {
      const text = formatFactsDeterministic("delivery delays", [
        {
          tool: "delivery_summary",
          ok: true,
          data: {
            period: "open / incomplete",
            focus,
            incompleteCount: 2,
            delayedCount: 1,
            deliveryCount: 2,
            topDelayed: [
              {
                projectId: "P001",
                project: "Site Alpha",
                stage: "DISPATCHED",
                delayDays: 21,
                dispatch: "2026-06-01",
                dispatchOverdue: true,
                stuckDays: 12,
              },
            ],
          },
        },
      ]);
      const label = /installation/.test(focus) ? /Installation delays/i : /Delivery delays/i;
      expect(text, focus).toMatch(label);
      expect(text, focus).toMatch(/Most delayed/i);
      expect(text, focus).toMatch(/Site Alpha/);
      expect(text, focus).toMatch(/21d/);
    }
  });

  it("suggest chips include payment requests, KPI list, delivery delays when permitted", () => {
    const prompts = novaSuggestedPrompts(
      user({
        role: "ADMIN",
        grantedPermissions: [
          "ai.assistant.read",
          "delivery.read",
          "kpi.read.all",
          "paymentrequest.read",
          "invoice.read",
          "receipt.read",
        ],
      }),
      8
    );
    const texts = prompts.map((p) => p.prompt.toLowerCase()).join(" | ");
    expect(texts).toMatch(/payment request/);
    expect(texts).toMatch(/kpi/);
    expect(texts).toMatch(/delivery/);
  });

  it("Hinglish KPI comparatives still route to kpi_summary", () => {
    for (const q of ["kiska kpi kam hai", "kpi zyada", "zyada kpi", "kpi jyada"]) {
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("kpi_summary");
    }
  });

  it("bare period clarify mentions deliveries / payments / expenses / salary (unfiltered without user)", () => {
    const c = novaAmbiguityClarification("today", new Date("2026-07-11T09:00:00+05:30"), "Asia/Kolkata");
    expect(c).toMatch(/deliveries|payment requests|expenses|salary/i);
  });

  it("bare period clarify RBAC-hides sales for Staff", () => {
    const staff = user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] });
    const c = novaAmbiguityClarification(
      "today",
      new Date("2026-07-11T09:00:00+05:30"),
      "Asia/Kolkata",
      staff
    );
    expect(c).toMatch(/tasks|late comers|deliveries/i);
    expect(c).not.toMatch(/\*\*sales\*\*/);
    expect(c).not.toMatch(/\*\*receipts\*\*/);
  });
});

describe("Phase A/B money guard + Staff depth", () => {
  it("money guard catches nested reports/profitability *Inr 10× misreads", async () => {
    const { llmPreservesPrimaryMoney } = await import("@/lib/ai/nova-money");
    const reportFacts = [
      {
        tool: "reports_snapshot",
        ok: true,
        data: {
          salesTotalInr: "₹12,50,000.00",
          reportSummary: {
            salesTotalInr: "₹12,50,000.00",
            collectionsInr: "₹9,00,000.00",
          },
          receivablesOutstandingInr: "₹3,40,000.00",
        },
      },
    ];
    expect(
      llmPreservesPrimaryMoney("FY sales **₹12,50,000.00**, collections **₹9,00,000.00**.", reportFacts)
    ).toBe(true);
    expect(
      llmPreservesPrimaryMoney("FY sales **₹1,25,00,000.00**, collections **₹9,00,000.00**.", reportFacts)
    ).toBe(false);

    const fundFacts = [
      {
        tool: "profitability_summary",
        ok: true,
        data: {
          netFundsAvailableInr: "₹45,00,000.00",
          fundPosition: {
            netFundsAvailableInr: "₹45,00,000.00",
            cashInHandInr: "₹2,00,000.00",
          },
        },
      },
    ];
    expect(llmPreservesPrimaryMoney("Net funds **₹45,00,000.00** available.", fundFacts)).toBe(true);
    expect(llmPreservesPrimaryMoney("Net funds **₹4,50,00,000.00** available.", fundFacts)).toBe(false);
  });

  it("novaCanRunTool allows attendance for punch.self Staff", async () => {
    const { novaCanRunTool } = await import("@/lib/ai/nova-suggest");
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read", "hr.punch.self"],
        }) as never,
        "attendance_late_summary"
      )
    ).toBe(true);
    expect(
      novaCanRunTool(
        user({
          role: "STAFF",
          grantedPermissions: ["ai.assistant.read", "hr.leave.create"],
        }) as never,
        "leave_summary"
      )
    ).toBe(true);
  });

  it("Staff suggest pack prefers leave/KPI when finance absent", () => {
    const prompts = novaSuggestedPrompts(
      user({
        role: "STAFF",
        grantedPermissions: [
          "ai.assistant.read",
          "hr.leave.create",
          "hr.punch.self",
          "kpi.read.self",
          "task.read.self",
        ],
      }),
      6
    );
    const texts = prompts.map((p) => p.prompt.toLowerCase()).join(" ");
    expect(texts).toMatch(/leave|attendance|kpi|my work|task/);
    expect(texts).not.toMatch(/receipts|fy 26-27 sales/);
  });

  it("punch.self alone does not suggest team late/absent chips", () => {
    const prompts = novaSuggestedPrompts(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.punch.self", "task.read.self"],
      }),
      8
    );
    const texts = prompts.map((p) => p.prompt.toLowerCase()).join(" | ");
    expect(texts).toMatch(/my attendance/);
    expect(texts).not.toMatch(/who was absent|late comers|most late/);
  });

  it("parso and next week parse as date ranges", () => {
    const now = new Date("2026-07-10T12:00:00.000Z");
    const tz = "Asia/Kolkata";
    const parso = parseNovaDateRange(normalizeNovaQuery("parso sales"), now, tz);
    expect(parso?.label).toMatch(/8\s+Jul/i);
    const next = parseNovaDateRange(normalizeNovaQuery("agle hafte leave"), now, tz);
    expect(next).toBeTruthy();
    expect(next!.from.getTime()).toBeGreaterThan(now.getTime());
  });

  it("leave_summary returns usage balances for self Staff", async () => {
    const { runNovaTools } = await import("@/lib/ai/nova-tools");
    vi.mocked(prisma.staffProfile.findFirst).mockResolvedValue({ id: "st1" } as never);
    vi.mocked(prisma.hrLeaveRequest.count).mockResolvedValue(1);
    vi.mocked(prisma.hrLeaveType.findMany).mockResolvedValue([
      { id: "lt1", name: "Casual", paid: true, annualAllowance: 12 },
    ] as never);
    vi.mocked(prisma.hrLeaveRequest.findMany)
      .mockResolvedValueOnce([
        {
          fromDate: new Date("2026-07-01"),
          toDate: new Date("2026-07-02"),
          status: "PENDING",
          reason: "Personal",
          halfDayType: "NONE",
          leaveType: { name: "Casual" },
          staff: { fullName: "Test", staffCode: "T1" },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          fromDate: new Date("2026-06-01"),
          toDate: new Date("2026-06-02"),
          halfDayType: "NONE",
          leaveType: { name: "Casual", paid: true },
          staff: { fullName: "Test", staffCode: "T1" },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          fromDate: new Date("2026-07-20"),
          toDate: new Date("2026-07-21"),
          halfDayType: "NONE",
          leaveType: { name: "Casual" },
          staff: { fullName: "Test", staffCode: "T1" },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          fromDate: new Date("2026-04-01"),
          toDate: new Date("2026-04-02"),
          halfDayType: "NONE",
          leaveTypeId: "lt1",
          leaveType: { name: "Casual", paid: true },
        },
      ] as never);
    const pack = await runNovaTools(
      user({
        role: "STAFF",
        id: "u-staff",
        grantedPermissions: ["ai.assistant.read", "hr.leave.create"],
      }),
      "my leave balance",
      ["leave_summary"]
    );
    expect(pack.facts[0]?.ok).toBe(true);
    expect(pack.facts[0]?.data).toMatchObject({
      scope: "self",
      pendingCount: 1,
    });
    expect(pack.facts[0]?.data?.balancesByType).toBeTruthy();
    expect(pack.facts[0]?.data?.upcomingApproved).toBeTruthy();
  });
});

describe("Phase C/D format + ops rates", () => {
  it.each([
    [
      "sales_summary",
      { period: "Today", invoiceCount: 2, totalInr: "₹1,00,000.00" },
      /Sales|invoice/i,
    ],
    [
      "receipts_summary",
      { period: "Today", receiptCount: 3, totalInr: "₹50,000.00" },
      /Receipt|collection/i,
    ],
    [
      "leave_summary",
      {
        scope: "self",
        period: "FY 26-27",
        pendingCount: 1,
        approvedDaysUsed: 2,
        monthSnapshot: {
          year: 2026,
          month: 7,
          attendanceSummary: {
            presentDays: 10,
            absentDays: 1,
            paidLeaveDays: 2,
            unpaidLeaveDays: 0,
            lateCount: 3,
          },
        },
      },
      /This month attendance|paid leave/i,
    ],
    [
      "bank_recon_summary",
      {
        unreconciledTotal: 4,
        oldestDays: 12,
        oldestSamples: [
          { date: "2026-06-01", bank: "HDFC", direction: "CREDIT", amountInr: "₹1,000.00" },
        ],
        lastStatementUpload: {
          uploadCount: 2,
          accountsWithUpload: 1,
          totalImported: 40,
          totalDuplicates: 1,
          recent: [{ file: "stmt.csv", bank: "HDFC", uploadedAt: "2026-07-01", imported: 20 }],
        },
      },
      /Oldest unreconciled samples|Statement uploads/i,
    ],
    [
      "gstr_snapshot",
      {
        periodKey: "2026-07",
        gstr1: { b2bCount: 2, b2csCount: 1, cdnrCount: 0, taxableInr: "₹10,000.00", totalGstInr: "₹1,800.00" },
        moneyNote: "Copy *Inr fields exactly. Period is calendar month (GST), not Indian FY.",
        note: "GSTR counts/totals for 2026-07 (calendar month).",
      },
      /GSTR-1|calendar month/i,
    ],
  ] as const)("formats %s facts", async (tool, data, re) => {
    const { formatFactsDeterministic } = await import("@/lib/ai/nova-format");
    const text = formatFactsDeterministic("test query", [{ tool, ok: true, data: { ...data } }]);
    expect(text).toMatch(re);
  });

  it("summarizes deny/fallback rates from tool markers", async () => {
    const { summarizeNovaQueryLogRates } = await import("@/lib/ai/nova-unmatched-review");
    const rates = summarizeNovaQueryLogRates([
      { toolsUsed: ["rbac_deny", "lexicon"] },
      { toolsUsed: ["rbac_soft_deny"] },
      { toolsUsed: ["llm_fallback_facts", "unmatched_review"] },
      { toolsUsed: ["sales_summary"] },
    ]);
    expect(rates).toEqual({
      sampleSize: 4,
      rbacDeny: 1,
      rbacSoftDeny: 1,
      llmFallbackFacts: 1,
      llmNotConfigured: 0,
      unmatchedReview: 1,
    });
  });
});

describe("P0/P1 ready-tool steal + stub/expense routing (audit 2.59)", () => {
  const now = new Date("2026-07-11T09:00:00+05:30");

  it.each([
    ["salary this month", "salary_summary"],
    ["payroll this week", "salary_summary"],
    ["incentives this month", "incentives_summary"],
    ["advances this month", "staff_advances_summary"],
    ["bonus this month", "incentives_summary"],
    ["quotations this month", "cbg_quotations_summary"],
    ["tally this month", "tally_status"],
    ["profitability this month", "profitability_summary"],
    ["expenses today", "staff_expense_summary"],
    ["kharcha aaj", "staff_expense_summary"],
  ] as const)("routes %s → %s (not which-metric steal)", (q, tool) => {
    const nq = normalizeNovaQuery(q);
    expect(selectNovaTools(nq), q).toContain(tool);
    expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata"), q).toBeNull();
  });

  it("expense report → staff expenses (not generic reports)", () => {
    const nq = normalizeNovaQuery("expense report");
    expect(selectNovaTools(nq)).toEqual(["staff_expense_summary"]);
    expect(matchNovaTopics(nq).map((t) => t.id)).toEqual(["staff_expenses"]);
    // No explicit day → period ask for expenses is fine (not reports / which-metric)
    expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata")).toMatch(/expenses|period/i);
    expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata")).not.toMatch(/which metric/i);
  });

  it("finance report → clarify menu; bare reports → reports_snapshot (not entity resolve)", async () => {
    const nq = normalizeNovaQuery("finance report");
    expect(selectNovaTools(nq)).toEqual([]);
    expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata")).toMatch(
      /finance|dashboard|expenses|receipts|sales|ERP reports/i
    );
    expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata")).not.toMatch(
      /I'm not sure what to pull/i
    );

    expect(selectNovaTools(normalizeNovaQuery("reports"))).toEqual(
      expect.arrayContaining(["reports_snapshot"])
    );
    expect(selectNovaTools(normalizeNovaQuery("staff expenses"))).toContain(
      "staff_expense_summary"
    );

    const u = user({
      role: "SUPER_ADMIN",
      grantedPermissions: [
        "ai.assistant.read",
        "accounts.dashboard.read",
        "accounts.read",
        "reports.read",
        "director.dashboard",
        "invoice.read",
        "receipt.read",
      ],
    });
    const fin = await answerNovaQuery(u, "finance report");
    expect(fin.toolsUsed).toContain("clarify");
    expect(fin.answer).toMatch(/finance|dashboard|expenses|receipts|sales/i);
    expect(fin.answer).not.toMatch(/I'm not sure what to pull/i);
    expect(fin.toolsUsed).not.toContain("search_entities");

    // Routing only — full reports_snapshot hits report builders; assert tools, not DB body
    expect(selectNovaTools(normalizeNovaQuery("reports"))).toEqual(
      expect.arrayContaining(["reports_snapshot"])
    );
    expect(selectNovaTools(normalizeNovaQuery("reports"))).not.toContain("search_entities");
  });

  it("answerNovaQuery keeps period+domain tools instead of which-metric clarify", async () => {
    const u = user({
      role: "ADMIN",
      grantedPermissions: [
        "ai.assistant.read",
        "hr.salary.read",
        "incentive.read.all",
        "staffadvance.read",
        "cbgquotation.read",
        "tally.dashboard.view",
        "director.dashboard",
        "accounts.dashboard.read",
        "accounts.read",
      ],
    });
    for (const q of [
      "salary this month",
      "incentives this month",
      "advances this month",
      "quotations this month",
      "tally this month",
      "profitability this month",
      "expenses today",
    ]) {
      const res = await answerNovaQuery(u, q);
      expect(res.toolsUsed, q).not.toContain("clarify");
      expect(res.answer, q).not.toMatch(/which metric/i);
    }
    const bareToday = await answerNovaQuery(u, "today");
    expect(bareToday.toolsUsed).toContain("clarify");
    expect(bareToday.answer).toMatch(/which metric|sales|receipts/i);
  });

  it("Phase B plan gate: bare expenses clarify; salary this month runs", async () => {
    const u = user({
      role: "ADMIN",
      grantedPermissions: ["ai.assistant.read", "hr.salary.read", "accounts.dashboard.read", "accounts.read"],
    });
    const expenses = await answerNovaQuery(u, "expenses");
    expect(expenses.toolsUsed).toContain("clarify");
    expect(expenses.answer).toMatch(/expenses|period/i);
    expect(expenses.answer).not.toMatch(/which metric/i);

    const salary = await answerNovaQuery(u, "salary this month");
    expect(salary.toolsUsed).not.toContain("clarify");
    expect(salary.answer).not.toMatch(/which metric/i);
  });

  it("open-module tools are not bare-entity stolen", async () => {
    const u = user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read", "vendorbank.read"] });
    for (const [q, tool] of [
      ["documents", "documents_open"],
      ["settings", "settings_open"],
      ["files", "documents_open"],
      ["beneficiary", "vendor_bank_open"],
    ] as const) {
      expect(extractNovaBareEntityCandidate(normalizeNovaQuery(q)), q).toBeNull();
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain(tool);
      const res = await answerNovaQuery(u, q);
      expect(res.toolsUsed, q).toContain(tool);
      expect(res.toolsUsed, q).not.toContain("lexicon_stub");
      expect(res.toolsUsed, q).not.toContain("clarify");
      expect(res.answer, q).not.toMatch(/what should I look up/i);
      expect(res.links?.some((l) => l.href.startsWith("/")), q).toBe(true);
    }
  });

  it("vendor bank prefers vendor_bank_open over vendors_summary", async () => {
    const res = await answerNovaQuery(
      user({
        role: "ADMIN",
        grantedPermissions: ["ai.assistant.read", "vendorbank.read", "vendor.read"],
      }),
      "vendor bank"
    );
    expect(res.toolsUsed).toContain("vendor_bank_open");
    expect(res.toolsUsed).not.toContain("vendors_summary");
    expect(res.toolsUsed).not.toContain("lexicon_stub");
    expect(res.answer).toMatch(/Vendor bank|beneficiary|Vendors/i);
    expect(res.links?.some((l) => l.href === "/vendors")).toBe(true);
  });

  it("bare expenses / kharcha route to staff expenses (period clarify when no day)", () => {
    for (const q of ["expense", "expenses", "kharcha"]) {
      const nq = normalizeNovaQuery(q);
      expect(selectNovaTools(nq), q).toContain("staff_expense_summary");
      expect(matchNovaTopics(nq).some((t) => t.id === "staff_expenses"), q).toBe(true);
    }
    // Bare expense without period still asks for period (not unmatched / entity)
    expect(novaAmbiguityClarification(normalizeNovaQuery("expenses"), now, "Asia/Kolkata")).toMatch(
      /expenses|period/i
    );
  });

  it("leave balance chip does not period-clarify", () => {
    expect(novaAmbiguityClarification(normalizeNovaQuery("leave balance"), now, "Asia/Kolkata")).toBeNull();
    expect(novaAmbiguityClarification(normalizeNovaQuery("my leave balance"), now, "Asia/Kolkata")).toBeNull();
    expect(selectNovaTools(normalizeNovaQuery("leave balance"))).toContain("leave_summary");
    const chips = novaSuggestedPrompts(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.leave.create", "task.read.self"],
      }),
      8
    );
    expect(chips.some((p) => p.prompt === "my leave balance")).toBe(true);
    expect(chips.some((p) => p.prompt === "leave balance")).toBe(false);
  });
});

describe("2.62 unmatched synonym feed + catalog suggest", () => {
  it("suggests near catalog phrases for typos / near-misses", async () => {
    const {
      suggestNovaCatalogPhrases,
      aggregateNovaSynonymFeed,
      formatNovaCatalogTryLine,
      formatNovaCatalogDidYouMean,
    } = await import("@/lib/ai/nova-catalog-suggest");
    const hits = suggestNovaCatalogPhrases("leave balans", { limit: 3, minScore: 0.3 });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => /leave/i.test(h.phrase))).toBe(true);
    expect(formatNovaCatalogTryLine(hits)?.toLowerCase()).toMatch(/closer catalog|try/);
    expect(formatNovaCatalogDidYouMean("leave balans", hits)).toMatch(/Did you mean/i);

    const feed = aggregateNovaSynonymFeed(
      [
        {
          query: "leave balans",
          createdAt: new Date("2026-07-11T10:00:00Z"),
          toolsUsed: ["friendly_no_facts", "unmatched_review"],
        },
        {
          query: "leave balans",
          createdAt: new Date("2026-07-11T11:00:00Z"),
          toolsUsed: ["llm_no_facts"],
        },
        {
          query: "xyzzy unknown",
          createdAt: new Date("2026-07-11T12:00:00Z"),
          toolsUsed: ["search_entities"],
        },
      ],
      10
    );
    expect(feed[0]?.query).toMatch(/leave balans/i);
    expect(feed[0]?.count).toBe(2);
    expect(feed[0]?.lexiconHint).toMatch(/synonym|topic/i);
  });

  it("open-module tools stay specific (not bare-entity steal)", async () => {
    for (const [q, tool, re] of [
      ["documents", "documents_open", /Document|Documents/i],
      ["settings", "settings_open", /Settings/i],
      ["files", "documents_open", /Document|Documents/i],
      ["beneficiary", "vendor_bank_open", /Vendor|beneficiary/i],
    ] as const) {
      const res = await answerNovaQuery(
        user({
          role: "ADMIN",
          grantedPermissions: ["ai.assistant.read", "vendorbank.read"],
        }),
        q
      );
      expect(res.toolsUsed, q).toContain(tool);
      expect(res.toolsUsed, q).not.toContain("lexicon_stub");
      expect(res.answer, q).not.toMatch(/which customer|entity|project name/i);
      expect(res.answer, q).toMatch(re);
    }
  });

  it("Phase B/C ready tools still skip clarify steal", () => {
    const now = new Date("2026-07-11T09:00:00+05:30");
    for (const q of [
      "delivery delays",
      "kpi list",
      "payment requests pending",
      "my leave balance",
      "salary this month",
      "expenses today",
    ]) {
      const nq = normalizeNovaQuery(q);
      expect(selectNovaTools(nq).length, q).toBeGreaterThan(0);
      expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata"), q).toBeNull();
    }
  });
});

describe("Phase E eval matrix — B/C/D phrases + open modules", () => {
  const now = new Date("2026-07-11T09:00:00+05:30");
  const admin = () =>
    user({
      role: "ADMIN",
      grantedPermissions: [
        "ai.assistant.read",
        "hr.salary.read",
        "incentive.read.all",
        "staffadvance.read",
        "accounts.dashboard.read",
        "accounts.read",
        "delivery.read",
        "kpi.read.all",
        "paymentrequest.read",
        "invoice.read",
        "receipt.read",
        "hr.leave.create",
        "hr.leave.read",
        "vendorbank.read",
        "vendor.read",
        "whatsapp.read",
        "portal.read",
        "automation.read",
        "links.read",
        "bank.sms.read",
      ],
    });

  it.each([
    ["salary this month", "salary_summary"],
    ["incentives this month", "incentives_summary"],
    ["advances this month", "staff_advances_summary"],
    ["documents", "documents_open"],
    ["settings", "settings_open"],
    ["vendor bank", "vendor_bank_open"],
    ["files", "documents_open"],
    ["beneficiary", "vendor_bank_open"],
    ["expenses today", "staff_expense_summary"],
    ["kharcha aaj", "staff_expense_summary"],
    ["delivery delays", "delivery_summary"],
    ["kpi list", "kpi_summary"],
    ["todays payment", "payment_requests_summary"],
    ["leave balance", "leave_summary"],
    ["my leave balance", "leave_summary"],
    // 2.102 broader golden matrix
    ["late comers today", "attendance_late_summary"],
    ["who was late today", "attendance_late_summary"],
    ["who was absent today", "attendance_late_summary"],
    ["was anyone present today", "attendance_late_summary"],
    ["my tasks", "tasks_summary"],
    ["overdue tasks", "tasks_summary"],
    ["my work", "my_work_summary"],
    ["stock summary", "stock_summary"],
    ["low stock", "stock_summary"],
    ["receivables", "receivables_summary"],
    ["overdue invoices", "overdue_invoices"],
    ["bank reconciliation", "bank_recon_summary"],
    // 2.134.16 unmatched→synonym accuracy loop (ship 3)
    ["who was absent", "attendance_late_summary"],
    ["kaun absent", "attendance_late_summary"],
    ["no show today", "attendance_late_summary"],
    ["commission this month", "incentives_summary"],
    ["wage this month", "salary_summary"],
    ["net pay this month", "salary_summary"],
    ["goods received note this month", "grn_summary"],
    ["pnl", "profitability_summary"],
    ["out of stock", "stock_summary"],
    ["approval queue", "approvals_summary"],
    ["ur capabilities", null],
    ["what can you do", null],
  ] as const)("routes %s → %s (no steal)", (q, tool) => {
    const nq = normalizeNovaQuery(q);
    if (tool === null) {
      // Meta capabilities — inference / help, not a sticky ERP tool steal
      const planTools = selectNovaTools(nq);
      expect(planTools.some((t) => ["sales_summary", "attendance_late_summary"].includes(t)), q).toBe(
        false
      );
      return;
    }
    expect(selectNovaTools(nq), q).toContain(tool);
    expect(novaAmbiguityClarification(nq, now, "Asia/Kolkata"), q).toBeNull();
  });

  it("answerNovaQuery: present / late / meta golden paths", async () => {
    const u = admin();
    const present = await answerNovaQuery(u, "who was present today");
    expect(present.toolsUsed).toContain("attendance_late_summary");
    expect(present.toolsUsed).not.toContain("clarify");

    const salary = await answerNovaQuery(u, "salary this month");
    expect(salary.toolsUsed).toContain("salary_summary");

    const delays = await answerNovaQuery(u, "delivery delays");
    expect(delays.toolsUsed).toContain("delivery_summary");

    const caps = await answerNovaQuery(u, "ur capabilities");
    expect(caps.toolsUsed.some((t) => t === "help" || t === "meta" || t.includes("help"))).toBe(true);
    expect(caps.answer.toLowerCase()).toMatch(/can|help|ask|nova/i);
  });

  it("bare today clarifies; period≠money default", async () => {
    const bare = await answerNovaQuery(admin(), "today");
    expect(bare.toolsUsed).toContain("clarify");
    expect(bare.answer).toMatch(/which metric|sales|receipts/i);
    expect(novaAmbiguityClarification(normalizeNovaQuery("expenses"), now, "Asia/Kolkata")).toMatch(
      /expenses|period/i
    );
  });

  it("entity follow-up swaps without ₹ prose bleed", () => {
    const r = resolveNovaFollowUp("avaada", [
      { role: "user", content: "tata steels sales this month" },
      { role: "assistant", content: "Tata Steels Sales\n₹1,23,000.00 from 3 invoices." },
    ]);
    expect(r.isFollowUp).toBe(true);
    expect(r.plan?.entity?.toLowerCase()).toMatch(/avaada/);
    expect(r.plan?.tools).toContain("sales_summary");
    expect(r.query).not.toMatch(/₹/);
  });

  it("answerNovaQuery runs Phase E open tools with ERP links", async () => {
    const u = admin();
    for (const [q, tool, href] of [
      ["documents", "documents_open", "/documents"],
      ["settings", "settings_open", "/settings"],
      ["vendor bank", "vendor_bank_open", "/vendors"],
      ["notifications", "notifications_open", "/notifications"],
      ["whatsapp", "whatsapp_open", "/whatsapp"],
      ["bank details", "vendor_bank_open", "/vendors"],
    ] as const) {
      const res = await answerNovaQuery(u, q);
      expect(res.toolsUsed, q).toContain(tool);
      expect(res.toolsUsed, q).not.toContain("clarify");
      expect(res.links?.some((l) => l.href === href), q).toBe(true);
      expect(res.answer, q).not.toMatch(/₹\d/);
    }
  });

  it("vendor_bank_open RBAC denies without vendorbank.read", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read", "vendor.read"] }),
      "vendor bank"
    );
    // Soft deny or no bank open — must not leak bank guidance as if permitted
    expect(res.toolsUsed).not.toContain("vendor_bank_open");
    expect(res.answer).not.toMatch(/account number|IFSC|₹\d/i);
  });

  it("formats open-module facts deterministically", () => {
    expect(
      formatFactsDeterministic("documents", [
        {
          tool: "documents_open",
          ok: true,
          data: {
            screen: "Documents",
            href: "/documents",
            totalCount: 3,
            byModule: [
              { module: "INVOICE", count: 2 },
              { module: "VENDOR", count: 1 },
            ],
            empty: false,
            note: "Document vault: 3 active file(s).",
          },
        },
      ])
    ).toMatch(/Documents|INVOICE/i);
    expect(
      formatFactsDeterministic("documents empty", [
        {
          tool: "documents_open",
          ok: true,
          data: {
            screen: "Documents",
            href: "/documents",
            totalCount: 0,
            byModule: [],
            empty: true,
            note: "No documents on file yet.",
          },
        },
      ])
    ).toMatch(/No documents/i);
    expect(
      formatFactsDeterministic("settings", [
        {
          tool: "settings_open",
          ok: true,
          data: {
            screen: "Settings",
            href: "/settings",
            note: "Open Settings.",
            related: [{ title: "Company", href: "/settings/company" }],
          },
        },
      ])
    ).toMatch(/Settings|Company/i);
    expect(
      formatFactsDeterministic("vendor bank", [
        {
          tool: "vendor_bank_open",
          ok: true,
          data: {
            screen: "Vendors",
            href: "/vendors",
            activeVendorCount: 10,
            withBankDetails: 7,
            missingBankDetails: 3,
            note: "Presence counts only — open Vendors for beneficiary details.",
          },
        },
      ])
    ).toMatch(/7 of 10|Vendor/i);
  });

  it("leave balance chip path stays leave_summary", () => {
    expect(selectNovaTools(normalizeNovaQuery("leave balance"))).toContain("leave_summary");
    const chips = novaSuggestedPrompts(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.leave.create", "task.read.self"],
      }),
      8
    );
    expect(chips.some((p) => p.prompt === "my leave balance")).toBe(true);
  });
});

describe("Phase I — thin→summary (vendor bank / documents / accounts / tally)", () => {
  beforeEach(() => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
    vi.mocked(prisma.vendor.count).mockReset().mockResolvedValue(0);
    vi.mocked(prisma.document.count).mockReset().mockResolvedValue(0);
    vi.mocked(prisma.document.groupBy).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.journalVoucher.count).mockReset().mockResolvedValue(0);
    vi.mocked(prisma.journalVoucher.groupBy).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.ledgerAccount.count).mockReset().mockResolvedValue(0);
    vi.mocked(prisma.tallyConnection.count).mockReset().mockResolvedValue(0);
    vi.mocked(prisma.tallyConnection.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.tallySyncJob.findMany).mockReset().mockResolvedValue([]);
  });

  it("vendor bank returns presence counts without secrets", async () => {
    vi.mocked(prisma.vendor.count)
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8);
    const res = await answerNovaQuery(
      user({
        role: "ADMIN",
        grantedPermissions: ["ai.assistant.read", "vendorbank.read", "vendor.read"],
      }),
      "vendor bank"
    );
    expect(res.toolsUsed).toContain("vendor_bank_open");
    expect(res.answer).toMatch(/8 of 12|8.*12/i);
    expect(res.answer).not.toMatch(/\b\d{9,18}\b|₹\d/);
    expect(res.answer).not.toMatch(/\b[A-Z]{4}0[A-Z0-9]{6}\b/);
    expect(res.links?.some((l) => l.href === "/vendors")).toBe(true);
  });

  it("documents returns module counts when present", async () => {
    vi.mocked(prisma.document.count)
      .mockResolvedValueOnce(5) // active
      .mockResolvedValueOnce(1) // archived
      .mockResolvedValueOnce(2); // recent 7d
    vi.mocked(prisma.document.groupBy).mockResolvedValue([
      { module: "INVOICE", _count: { _all: 3 } },
      { module: "VENDOR", _count: { _all: 2 } },
    ] as never);
    const res = await answerNovaQuery(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read"] }),
      "documents"
    );
    expect(res.toolsUsed).toContain("documents_open");
    expect(res.answer).toMatch(/5|INVOICE|VENDOR/i);
    expect(res.answer).toMatch(/7 days|archived|2/i);
    expect(res.answer).not.toMatch(/₹\d/);
    expect(res.links?.some((l) => l.href === "/documents")).toBe(true);
  });

  it("documents honest empty when vault is empty", async () => {
    vi.mocked(prisma.document.count).mockResolvedValue(0);
    vi.mocked(prisma.document.groupBy).mockResolvedValue([]);
    const res = await answerNovaQuery(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read"] }),
      "files"
    );
    expect(res.toolsUsed).toContain("documents_open");
    expect(res.answer).toMatch(/No documents|not.*on file|empty|No active/i);
    expect(res.links?.some((l) => l.href === "/documents")).toBe(true);
  });

  it("settings_open returns safe company meta (no bank secrets)", async () => {
    vi.mocked(prisma.companyProfile.findFirst).mockResolvedValue({
      name: "BPG Renewables",
      brandName: "Biopower",
      timezone: "Asia/Kolkata",
    } as never);
    vi.mocked(prisma.user.count).mockResolvedValue(14);
    const res = await answerNovaQuery(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read", "settings.write"] }),
      "company settings"
    );
    expect(res.toolsUsed).toContain("settings_open");
    expect(res.answer).toMatch(/BPG|Biopower|Asia\/Kolkata|14/i);
    expect(res.answer).not.toMatch(/\bIFSC\b|[A-Z]{4}0[A-Z0-9]{6}|\b\d{9,18}\b/i);
    expect(res.links?.some((l) => l.href === "/settings/company")).toBe(true);
  });

  it("notifications_open reports unread count", async () => {
    vi.mocked(prisma.notification.count).mockResolvedValue(3);
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "notifications"
    );
    expect(res.toolsUsed).toContain("notifications_open");
    expect(res.answer).toMatch(/3.*unread|unread.*3/i);
  });

  it("dark theme / document vault lexicon expand", async () => {
    const theme = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "dark theme"
    );
    expect(theme.toolsUsed).toContain("appearance_open");
    const vault = await answerNovaQuery(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read"] }),
      "document vault"
    );
    expect(vault.toolsUsed).toContain("documents_open");
  });

  it("accounts snapshot is structural + sub-links, no fake TB", async () => {
    vi.mocked(prisma.journalVoucher.count).mockResolvedValue(40);
    vi.mocked(prisma.journalVoucher.groupBy).mockResolvedValue([
      { status: "POSTED", _count: { _all: 30 } },
      { status: "DRAFT", _count: { _all: 10 } },
    ] as never);
    vi.mocked(prisma.ledgerAccount.count)
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(90);
    const res = await answerNovaQuery(
      user({
        role: "ADMIN",
        grantedPermissions: ["ai.assistant.read", "accounts.dashboard.read", "accounts.reports.read"],
      }),
      "accounts ledger"
    );
    expect(res.toolsUsed).toContain("accounts_snapshot");
    expect(res.answer).toMatch(/journal|ledger/i);
    expect(res.answer).not.toMatch(/trial balance.*(₹|Rs\.?\s*\d)/i);
    expect(res.links?.some((l) => l.href === "/accounts/trial-balance")).toBe(true);
    expect(res.links?.some((l) => l.href === "/accounts/cash-book")).toBe(true);
  });

  it("tally status includes connection snapshot without invented balances", async () => {
    vi.mocked(prisma.tallyConnection.count)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);
    vi.mocked(prisma.tallyConnection.findMany).mockResolvedValue([
      {
        name: "Main",
        active: true,
        lastSyncAt: new Date("2026-07-10T10:00:00Z"),
        lastSyncStatus: "SUCCESS",
        lastHeartbeatAt: new Date("2026-07-11T08:00:00Z"),
        syncDirection: "TALLY_TO_EMPOWER",
        mode: "LOCAL_AGENT",
      },
    ] as never);
    vi.mocked(prisma.tallySyncJob.findMany).mockResolvedValue([
      {
        id: "j1",
        status: "SUCCESS",
        direction: "IMPORT",
        requestedAt: new Date("2026-07-10T10:00:00Z"),
        errorMessage: null,
      },
    ] as never);
    const res = await answerNovaQuery(
      user({
        role: "ADMIN",
        grantedPermissions: ["ai.assistant.read", "tally.dashboard.view"],
      }),
      "tally"
    );
    expect(res.toolsUsed).toContain("tally_status");
    expect(res.answer).toMatch(/Tally|connection|Main|SUCCESS/i);
    expect(res.answer).not.toMatch(/₹\d|trial balance.*\d{3,}/i);
    expect(res.links?.some((l) => l.href === "/tally")).toBe(true);
  });

  it("formats accounts / tally Phase I facts", () => {
    expect(
      formatFactsDeterministic("accounts", [
        {
          tool: "accounts_snapshot",
          ok: true,
          data: {
            journalVoucherCount: 40,
            postedJournalCount: 30,
            draftJournalCount: 10,
            ledgerAccountCount: 100,
            activeLedgerAccountCount: 90,
            balancesVisible: false,
            related: [{ title: "Trial balance", href: "/accounts/trial-balance" }],
            note: "Structural counts only.",
          },
        },
      ])
    ).toMatch(/40|90|Trial balance/i);
    expect(
      formatFactsDeterministic("tally", [
        {
          tool: "tally_status",
          ok: true,
          data: {
            connectionCount: 2,
            activeConnectionCount: 1,
            connections: [{ name: "Main", active: true, lastSyncStatus: "SUCCESS" }],
            recentSyncJobs: [{ status: "SUCCESS", direction: "IMPORT" }],
            note: "No invented TB.",
          },
        },
      ])
    ).toMatch(/Tally|Main|SUCCESS/i);
  });
});

describe("Admin open tools + bridge smoke matrix", () => {
  const superAdmin = () =>
    user({
      role: "SUPER_ADMIN",
      grantedPermissions: ["ai.assistant.read", "audit.read", "director.dashboard"],
    });

  it.each([
    ["backup", "backup_open", "/system/backup"],
    ["system backup", "backup_open", "/system/backup"],
    ["system tools", "system_tools_open", "/system/tools"],
    ["audit log", "audit_log_open", "/system/audit-log"],
  ] as const)("admin open %s → %s", async (q, tool, href) => {
    const nq = normalizeNovaQuery(q);
    expect(selectNovaTools(nq), q).toContain(tool);
    const res = await answerNovaQuery(superAdmin(), q);
    expect(res.toolsUsed, q).toContain(tool);
    expect(res.toolsUsed, q).not.toContain("clarify");
    expect(res.toolsUsed, q).not.toContain("lexicon_stub");
    expect(res.links?.some((l) => l.href === href), q).toBe(true);
    expect(res.answer, q).not.toMatch(/₹\d/);
  });

  it("backup_open RBAC denies without backup history access", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "system backup"
    );
    expect(res.toolsUsed).not.toContain("backup_open");
    expect(res.toolsUsed.some((t) => t === "rbac_deny" || t.startsWith("deny:"))).toBe(true);
  });

  it("audit_log_open RBAC denies without audit.read", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "audit log"
    );
    expect(res.toolsUsed).not.toContain("audit_log_open");
    expect(res.toolsUsed.some((t) => t === "rbac_deny" || t.startsWith("deny:"))).toBe(true);
  });

  it("ADMIN can open system tools but not backup by default", async () => {
    const adminUser = user({
      role: "ADMIN",
      grantedPermissions: ["ai.assistant.read", "director.dashboard", "audit.read"],
    });
    const tools = await answerNovaQuery(adminUser, "system tools");
    expect(tools.toolsUsed).toContain("system_tools_open");
    expect(tools.links?.some((l) => l.href === "/system/tools")).toBe(true);

    const backup = await answerNovaQuery(adminUser, "system backup");
    expect(backup.toolsUsed).not.toContain("backup_open");
  });

  const bridgeCases = novaBridgeSmokeCases();

  it("bridge smoke catalog covers high-traffic + opens", () => {
    expect(bridgeCases.length).toBeGreaterThan(10);
    expect(bridgeCases.some((c) => c.phrase === "system tools")).toBe(true);
    expect(bridgeCases.some((c) => c.phrase === "audit log")).toBe(true);
    expect(bridgeCases.some((c) => c.phrase === "backup")).toBe(true);
    expect(bridgeCases.some((c) => c.phrase === "sales this month")).toBe(true);
  });

  it.each(
    bridgeCases.map((c) => [c.phrase, c.toolMode, c.href] as const)
  )("bridge smoke %s (%s)", async (phrase, toolMode, href) => {
    const nq = normalizeNovaQuery(phrase);
    const tools = selectNovaTools(nq);
    expect(tools.length, phrase).toBeGreaterThan(0);
    expect(
      novaAmbiguityClarification(nq, new Date("2026-07-11T09:00:00+05:30"), "Asia/Kolkata"),
      phrase
    ).toBeNull();

    if (toolMode === "open") {
      const openTool = tools.find((t) => t.endsWith("_open"));
      expect(openTool, phrase).toBeTruthy();
      const res = await answerNovaQuery(superAdmin(), phrase);
      expect(res.toolsUsed, phrase).toContain(openTool!);
      expect(
        res.links?.some((l) => l.href === href || l.href.startsWith(href)),
        phrase
      ).toBe(true);
    }
  });
});

describe("Phase clarify — entity disambiguation", () => {
  beforeEach(() => {
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
    vi.mocked(prisma.customer.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.vendor.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.project.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.staffProfile.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.user.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.salesInvoice.aggregate).mockClear();
    vi.mocked(prisma.salesInvoice.findMany).mockClear();
    vi.mocked(prisma.salesInvoice.count).mockClear();
  });

  it("ambiguous name → clarify options, no wrong sales totals", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "c1",
        customerId: "C001",
        customerName: "Acme Solar",
        companyName: "Acme Solar Pvt",
      },
      {
        id: "c2",
        customerId: "C002",
        customerName: "Acme Power",
        companyName: "Acme Power Ltd",
      },
    ] as never);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 999999, taxableValue: 0, totalGst: 0 },
      _count: 9,
      _avg: {},
      _min: {},
      _max: {},
    } as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "customer.read", "invoice.read", "accounts.reports.read"],
      }),
      "Acme sales this month"
    );

    expect(res.toolsUsed).toContain("clarify");
    expect(res.toolsUsed).toContain("entity_resolve");
    expect(res.toolsUsed).not.toContain("sales_summary");
    expect(res.answer).toMatch(/Did you mean/i);
    expect(res.answer).toMatch(/1\.\s+\*\*Acme Solar\*\*/);
    expect(res.answer).toMatch(/2\.\s+\*\*Acme Power\*\*/);
    expect(res.answer).not.toMatch(/999|9,99/);
    expect(prisma.salesInvoice.aggregate).not.toHaveBeenCalled();
  });

  it("unique match → no clarify, runs sales", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "c1",
        customerId: "C001",
        customerName: "Acme Solar",
        companyName: "Acme Solar",
      },
    ] as never);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 50000, taxableValue: 0, totalGst: 0 },
      _count: 2,
      _avg: {},
      _min: {},
      _max: {},
    } as never);
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(2);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([]);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "customer.read", "invoice.read", "accounts.reports.read"],
      }),
      "Acme Solar sales this month"
    );

    expect(res.toolsUsed).toContain("sales_summary");
    expect(res.toolsUsed).not.toContain("clarify");
    expect(res.answer).toMatch(/50,000|50000/);
  });

  it("user replies 1 or exact label → merges entity and runs tool", async () => {
    const clarifyMsg = [
      'Did you mean one of these for “Acme”?',
      "",
      "1. **Acme Solar** (customer · C001)",
      "2. **Acme Power** (customer · C002)",
      "",
      "Reply with the number (e.g. **1**) or the full name/code.",
    ].join("\n");

    const hist = [
      { role: "user" as const, content: "Acme sales this month" },
      { role: "assistant" as const, content: clarifyMsg },
    ];

    const pick = resolveNovaFollowUp("1", hist);
    expect(pick.isFollowUp).toBe(true);
    expect(pick.query).toMatch(/Acme Solar/i);
    expect(pick.forcedTools ?? []).toContain("sales_summary");

    const byLabel = resolveNovaFollowUp("Acme Power", hist);
    expect(byLabel.query).toMatch(/Acme Power/i);

    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "c1",
        customerId: "C001",
        customerName: "Acme Solar",
        companyName: "Acme Solar",
      },
    ] as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: "c1",
      customerId: "C001",
      customerName: "Acme Solar",
      companyName: "Acme Solar",
    } as never);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 12000, taxableValue: 0, totalGst: 0 },
      _count: 1,
      _avg: {},
      _min: {},
      _max: {},
    } as never);
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(1);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([]);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "customer.read", "invoice.read", "accounts.reports.read"],
      }),
      "1",
      hist
    );
    expect(res.toolsUsed).toContain("sales_summary");
    expect(res.toolsUsed).not.toContain("clarify");
    expect(res.answer).toMatch(/12,000|12000/);
  });

  it("RBAC hides vendor options the user cannot see", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "c1",
        customerId: "C001",
        customerName: "Acme Solar",
        companyName: "Acme",
      },
    ] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([
      { id: "v1", vendorId: "V001", vendorName: "Acme Supplies" },
    ] as never);

    const { resolveNovaEntityHint } = await import("@/lib/ai/nova-tools");
    // ACCOUNTANT matrix lacks vendor/customer/project; grant only customer.read
    const resolved = await resolveNovaEntityHint(
      "Acme",
      user({
        role: "ACCOUNTANT",
        grantedPermissions: ["ai.assistant.read", "customer.read"],
      })
    );
    // Unique customer after RBAC filter (vendor hidden) → ok, not ambiguous
    expect(resolved.kind).toBe("ok");
    if (resolved.kind === "ok") {
      expect(resolved.entity.name).toMatch(/Acme Solar/i);
      expect(resolved.entity.type).toBe("customer");
    }
    expect(prisma.vendor.findMany).not.toHaveBeenCalled();
  });

  it("meta / who punched late still not person clarify", async () => {
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      { id: "s1", fullName: "Who Late", staffCode: "W1", userId: "u9" },
      { id: "s2", fullName: "Who Else", staffCode: "W2", userId: "u8" },
    ] as never);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([]);
    vi.mocked(prisma.hrAttendanceDaily.count).mockResolvedValue(0);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.team", "hr.attendance.read"],
      }),
      "who punched late"
    );
    expect(res.toolsUsed).not.toContain("person_resolve");
    expect(res.answer).not.toMatch(/Did you mean one of these people/i);
  });

  it("bare today → metric clarify RBAC-filtered for Staff", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "today"
    );
    expect(res.toolsUsed).toContain("clarify");
    expect(res.clarifyKind).toBe("metric");
    const labels = res.options?.map((o) => o.label) ?? [];
    // Staff matrix: tasks / late / deliveries / payments — not org sales/receipts/expenses
    expect(labels).toEqual(expect.arrayContaining(["tasks", "late comers"]));
    expect(labels).not.toContain("sales");
    expect(labels).not.toContain("receipts");
    expect(labels).not.toContain("expenses");
    expect(labels.some((l) => l === "salary" || l === "my payslip")).toBe(true);
    expect(res.answer).not.toMatch(/1\.\s+\*\*sales\*\*/);
  });

  it("documents_open RBAC denies Staff without documents.read", async () => {
    vi.mocked(prisma.document.count).mockResolvedValue(99);
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "documents"
    );
    expect(res.toolsUsed).not.toContain("documents_open");
    expect(res.toolsUsed.some((t) => t === "rbac_soft_deny" || t === "rbac_deny")).toBe(true);
    expect(res.answer).toMatch(/Documents|vault|menu|role/i);
    expect(res.answer).not.toMatch(/99|INVOICE/);
  });

  it("documents_open allows Staff with documents.read grant", async () => {
    vi.mocked(prisma.document.count).mockResolvedValue(0);
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "documents.read"],
      }),
      "documents"
    );
    expect(res.toolsUsed).toContain("documents_open");
    expect(res.links?.some((l) => l.href === "/documents")).toBe(true);
  });

  it("Staff settings / theme opens appearance only (not Users/Company)", async () => {
    const staff = user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] });
    for (const q of ["settings", "theme", "appearance"] as const) {
      const res = await answerNovaQuery(staff, q);
      expect(res.toolsUsed, q).toContain("appearance_open");
      expect(res.toolsUsed, q).not.toContain("settings_open");
      expect(res.toolsUsed, q).not.toContain("rbac_soft_deny");
      expect(res.links?.some((l) => l.href === "/settings/appearance"), q).toBe(true);
      expect(res.links?.some((l) => l.href === "/settings/users"), q).toBeFalsy();
      expect(res.links?.some((l) => l.href === "/settings/company"), q).toBeFalsy();
      expect(res.answer, q).toMatch(/Appearance|theme/i);
    }
  });

  it("Staff company settings still soft-denies (needs settings.write)", async () => {
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "company settings"
    );
    expect(res.toolsUsed).not.toContain("settings_open");
    expect(res.toolsUsed).not.toContain("appearance_open");
    expect(res.toolsUsed.some((t) => t === "rbac_soft_deny" || t === "rbac_deny")).toBe(true);
    expect(res.links?.some((l) => l.href === "/settings/users")).toBeFalsy();
  });

  it("Admin settings_open still requires settings.write (role grants it)", async () => {
    // ADMIN/SUPER_ADMIN: can() is always true — settings_open must run, not appearance fallback
    const settings = await answerNovaQuery(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read"] }),
      "company settings"
    );
    expect(settings.toolsUsed).toContain("settings_open");
    expect(settings.toolsUsed).not.toContain("appearance_open");
    expect(settings.links?.some((l) => l.href === "/settings/company" || l.href === "/settings")).toBe(
      true
    );

    // Non-admin without settings.write: company settings soft-denies (no Users leak)
    const staff = await answerNovaQuery(
      user({ role: "MANAGER", grantedPermissions: ["ai.assistant.read"] }),
      "company settings"
    );
    expect(staff.toolsUsed).not.toContain("settings_open");
    expect(staff.toolsUsed.some((t) => t === "rbac_soft_deny" || t === "rbac_deny")).toBe(true);
    expect(staff.links?.some((l) => l.href === "/settings/users")).toBeFalsy();
  });

  it("Admin still opens documents and settings", async () => {
    vi.mocked(prisma.document.count).mockResolvedValue(2);
    vi.mocked(prisma.document.groupBy).mockResolvedValue([
      { module: "INVOICE", _count: { _all: 2 } },
    ] as never);
    const docs = await answerNovaQuery(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read"] }),
      "documents"
    );
    expect(docs.toolsUsed).toContain("documents_open");
    const settings = await answerNovaQuery(
      user({ role: "ADMIN", grantedPermissions: ["ai.assistant.read"] }),
      "company settings"
    );
    expect(settings.toolsUsed).toContain("settings_open");
  });
});

describe("P0 Madhu attendance — no cross-day punch bleed", () => {
  const tz = "Asia/Kolkata";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00+05:30"));
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
    vi.mocked(prisma.staffProfile.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("single-day late list excludes yesterday punch attributed via wrong DATE cast", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    // Calendar today 11 Jul 2026 IST
    const todayStorage = prismaDateFromCalendar({ year: 2026, month: 7, day: 11 });
    const yesterdayStorage = prismaDateFromCalendar({ year: 2026, month: 7, day: 10 });
    // Yesterday punch ~10:11 IST on 10 Jul
    const yesterdayPunch = new Date("2026-07-10T04:41:00.000Z"); // 10:11 IST

    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([]);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockImplementation(async (args: unknown) => {
      const where = (args as { where?: { date?: { in?: Date[] } } })?.where;
      const dates = where?.date?.in ?? [];
      const rows = [
        // Yesterday late (correct storage) — must never appear in “today”
        {
          staffId: "madhu",
          date: yesterdayStorage,
          status: "LATE",
          lateMinutes: 12,
          earlyMinutes: 0,
          overtimeMinutes: 0,
          punchInTime: yesterdayPunch,
          punchOutTime: null,
          staff: { staffCode: "STF0010", fullName: "Madhu M", department: null },
        },
        // Today: missing punch in (register source of truth)
        {
          staffId: "madhu",
          date: todayStorage,
          status: "MISSING_PUNCH_IN",
          lateMinutes: 0,
          earlyMinutes: 0,
          overtimeMinutes: 0,
          punchInTime: null,
          punchOutTime: null,
          staff: { staffCode: "STF0010", fullName: "Madhu M", department: null },
        },
        // Someone actually late today
        {
          staffId: "arun",
          date: todayStorage,
          status: "LATE",
          lateMinutes: 140,
          earlyMinutes: 0,
          overtimeMinutes: 0,
          punchInTime: new Date("2026-07-11T06:49:00.000Z"),
          punchOutTime: null,
          staff: { staffCode: "STF0003", fullName: "Arun C Michael", department: null },
        },
      ];
      if (!dates.length) return rows as never;
      const wanted = new Set(dates.map((d) => d.toISOString().slice(0, 10)));
      return rows.filter((r) => wanted.has(r.date.toISOString().slice(0, 10))) as never;
    });

    // Use “today” (single-day) — bare “11 july” parses as the whole month
    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "late comers today"
    );

    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.answer).toMatch(/Arun C Michael/i);
    expect(res.answer).not.toMatch(/Madhu/i);
    expect(res.answer).not.toMatch(/10:11/);
  });

  it("was Madhu present today? with MISSING_PUNCH_IN → not present", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const todayStorage = prismaDateFromCalendar({ year: 2026, month: 7, day: 11 });
    const yesterdayPunch = new Date("2026-07-10T04:41:00.000Z");

    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      { id: "madhu", fullName: "Madhu M", staffCode: "STF0010", userId: "u-madhu" },
    ] as never);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "madhu",
        date: todayStorage,
        status: "MISSING_PUNCH_IN",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: null,
        punchOutTime: null,
        staff: { staffCode: "STF0010", fullName: "Madhu M", department: null },
      },
      // Wrong-day bleed candidate (should not flip present)
      {
        staffId: "madhu",
        date: prismaDateFromCalendar({ year: 2026, month: 7, day: 10 }),
        status: "LATE",
        lateMinutes: 12,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: yesterdayPunch,
        punchOutTime: null,
        staff: { staffCode: "STF0010", fullName: "Madhu M", department: null },
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "was madhu present today"
    );

    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.answer).toMatch(/not present|missing punch in/i);
    // Lead-in is “Here’s who was present:” — assert the subject line is not a false present claim.
    expect(res.answer).not.toMatch(/\*\*Madhu M\*\* was \*\*present\*\*/i);
    expect(res.answer).toMatch(/\*\*Madhu M\*\* was \*\*not present\*\*/i);
    expect(llmPreservesAttendancePresence(res.answer, [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          subjectAttendance: { name: "Madhu M", isPresent: false, status: "MISSING_PUNCH_IN" },
        },
      },
    ])).toBe(true);
    expect(
      llmPreservesAttendancePresence("Madhu M was present today", [
        {
          tool: "attendance_late_summary",
          ok: true,
          data: {
            subjectAttendance: { name: "Madhu M", isPresent: false, status: "MISSING_PUNCH_IN" },
          },
        },
      ])
    ).toBe(false);
  });

  it("did Madhu punch in today? with MISSING_PUNCH_IN → not present (not late list)", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const todayStorage = prismaDateFromCalendar({ year: 2026, month: 7, day: 11 });

    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      { id: "madhu", fullName: "Madhu M", staffCode: "STF0010", userId: "u-madhu" },
    ] as never);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "madhu",
        date: todayStorage,
        status: "MISSING_PUNCH_IN",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: null,
        punchOutTime: null,
        staff: { staffCode: "STF0010", fullName: "Madhu M", department: null },
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "did madhu punch in today"
    );

    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.answer).toMatch(/not present|missing punch in|did\s+\*\*not\*\*\s+punch|no attendance row|no IN punch/i);
    expect(res.answer).not.toMatch(/\*\*Late comers\*\*/i);
    expect(res.answer).not.toMatch(/0 people late/i);
  });

  it("who didn't punch today → absentees path (MISSING_PUNCH_IN), not late comers", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const todayStorage = prismaDateFromCalendar({ year: 2026, month: 7, day: 11 });

    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      { id: "madhu", fullName: "Madhu M", staffCode: "STF0010", userId: "u-madhu", department: null },
      { id: "arun", fullName: "Arun C Michael", staffCode: "STF0003", userId: "u-arun", department: null },
    ] as never);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "madhu",
        date: todayStorage,
        status: "MISSING_PUNCH_IN",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: null,
        punchOutTime: null,
        staff: { staffCode: "STF0010", fullName: "Madhu M", department: null },
      },
      {
        staffId: "arun",
        date: todayStorage,
        status: "LATE",
        lateMinutes: 40,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-11T06:49:00.000Z"),
        punchOutTime: null,
        staff: { staffCode: "STF0003", fullName: "Arun C Michael", department: null },
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "who didn't punch today"
    );

    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.answer).toMatch(/absent|didn.?t punch|missing punch/i);
    expect(res.answer).toMatch(/Madhu/i);
    expect(res.answer).not.toMatch(/\*\*Late comers\*\*/i);
  });

  it("Madhu attendance today with MISSING_PUNCH_IN → status, not 0 late", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const todayStorage = prismaDateFromCalendar({ year: 2026, month: 7, day: 11 });

    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      { id: "madhu", fullName: "Madhu M", staffCode: "STF0010", userId: "u-madhu" },
    ] as never);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "madhu",
        date: todayStorage,
        status: "MISSING_PUNCH_IN",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: null,
        punchOutTime: null,
        staff: { staffCode: "STF0010", fullName: "Madhu M", department: null },
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "Madhu attendance today"
    );

    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.answer).toMatch(/not present|missing punch in|no attendance row|did\s+\*\*not\*\*\s+punch/i);
    expect(res.answer).not.toMatch(/0 people late/i);
  });

  it("llmPreservesAttendancePresence rejects punched-in claim on MISSING_PUNCH_IN", () => {
    expect(
      llmPreservesAttendancePresence("Madhu punched in at 10:11", [
        {
          tool: "attendance_late_summary",
          ok: true,
          data: {
            subjectAttendance: {
              name: "Madhu M",
              isPresent: false,
              status: "MISSING_PUNCH_IN",
              punchInTime: null,
            },
          },
        },
      ])
    ).toBe(false);
  });
});

describe("attendance this month — present/late aggregation (July 2026)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-12T12:00:00+05:30"));
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
    vi.mocked(prisma.staffProfile.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes attendance this month phrases to attendance_month pack + July period", () => {
    const now = new Date();
    for (const q of [
      "attendance this month",
      "this month attendance",
      "my attendance this month",
      "late comers this month",
    ]) {
      const nq = normalizeNovaQuery(q);
      const tools = selectNovaTools(nq);
      if (/late comers/i.test(q)) {
        expect(tools, q).toContain("attendance_late_summary");
      } else {
        expect(tools, q).toContain("attendance_month");
      }
      const range = parseNovaDateRange(nq, now, "Asia/Kolkata");
      expect(range?.label, q).toMatch(/July 2026|This month/i);
    }
  });

  it("formatFactsDeterministic month grain: late ⊆ present headline", () => {
    const text = formatFactsDeterministic("late comers this month", [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          period: "July 2026",
          periodGrain: "month",
          focus: "late",
          peopleWithLate: 2,
          lateDayCount: 2,
          presentPunchDays: 4,
          absentDays: 1,
          mostLate: {
            name: "Arun",
            code: "STF1",
            lateDays: 1,
            totalLateMinutes: 30,
          },
          topLateComers: [
            { name: "Arun", code: "STF1", lateDays: 1, totalLateMinutes: 30 },
            { name: "Deepa", code: "STF4", lateDays: 1, totalLateMinutes: 15 },
          ],
        },
      },
    ]);
    expect(text).toMatch(/Here’s the late list/i);
    expect(text).toMatch(/\*\*2\*\* people late across \*\*2\*\* late day/i);
    expect(text).toMatch(/\*\*4\*\* recorded employee present-days/i);
    expect(text).toMatch(/Arun/);
    expect(text).toMatch(/Deepa/);
    expect(text).toMatch(/^- /m);
  });

  it("formatFactsDeterministic overview for bare attendance + period (not late list)", () => {
    const text = formatFactsDeterministic("last week attendance", [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          period: "29 Jun – 5 Jul 2026",
          periodGrain: "week",
          scope: "all_staff",
          focus: "overview",
          peopleWithLate: 1,
          lateDayCount: 2,
          presentPunchDays: 12,
          absentDays: 3,
          topLateComers: [
            { name: "Arun", code: "STF1", lateDays: 2, totalLateMinutes: 45 },
          ],
          topPresent: [{ name: "Deepa", code: "STF4", presentDays: 5 }],
          topAbsent: [{ name: "Farah", code: "STF6", absentDays: 2 }],
        },
      },
    ]);
    expect(text).toMatch(/Here’s the attendance summary/i);
    expect(text).not.toMatch(/Here’s the late list/i);
    expect(text).toMatch(/\*\*Attendance\*\*/i);
    expect(text).not.toMatch(/Attendance \/ late/i);
    expect(text).toMatch(/\*\*12\*\* recorded employee present-days/i);
    expect(text).toMatch(/\*\*3\*\* recorded absence entries/i);
    expect(text).toMatch(/\*\*1\*\* people late/i);
    expect(text).toMatch(/All staff/);
    expect(text).not.toMatch(/all_staff/);
    expect(text).toMatch(/not counted as absent/i);
    expect(text).toMatch(/Arun/);
    expect(text).toMatch(/Deepa/);
    expect(text).toMatch(/Farah/);
    expect(text).toMatch(/^- /m);
  });

  it("answerNovaQuery: late ⊆ present; open MPO late counts; HALF_DAY + stale lateMinutes excluded", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const d = (day: number) => prismaDateFromCalendar({ year: 2026, month: 7, day });
    const staff = (name: string, code: string) => ({
      staffCode: code,
      fullName: name,
      department: null,
    });

    // Present-like: LATE(30), MPO(200), LATE(900 stale), GEO_EXCEPTION, PRESENT → 5
    // Credible late: LATE(30), MPO(200), GEO → 3 days / 3 people
    // Not late: HALF_DAY residual, stale >8h
    // Absent: MISSING_PUNCH_IN → 1
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "a",
        date: d(1),
        status: "LATE",
        lateMinutes: 30,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-01T04:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Arun", "STF1"),
      },
      {
        staffId: "a",
        date: d(2),
        status: "HALF_DAY",
        lateMinutes: 90,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-02T04:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Arun", "STF1"),
      },
      {
        staffId: "b",
        date: d(3),
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 200,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-03T04:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Bala", "STF2"),
      },
      {
        staffId: "c",
        date: d(4),
        status: "LATE",
        lateMinutes: 900,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-04T04:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Chetan", "STF3"),
      },
      {
        staffId: "d",
        date: d(5),
        status: "GEO_EXCEPTION",
        lateMinutes: 15,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-05T04:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Deepa", "STF4"),
      },
      {
        staffId: "e",
        date: d(6),
        status: "PRESENT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-06T03:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Esha", "STF5"),
      },
      {
        staffId: "f",
        date: d(7),
        status: "MISSING_PUNCH_IN",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: null,
        punchOutTime: null,
        staff: staff("Farah", "STF6"),
      },
    ] as never);

    const lateRes = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "late comers this month"
    );

    expect(lateRes.toolsUsed).toContain("attendance_late_summary");
    expect(lateRes.answer).toMatch(/Here’s the late list/i);
    expect(lateRes.answer).toMatch(/July 2026|This month/i);
    expect(lateRes.answer).toMatch(/\*\*3\*\* people late across \*\*3\*\* late day/i);
    expect(lateRes.answer).toMatch(/\*\*5\*\* recorded employee present-days/i);
    expect(lateRes.answer).toMatch(/\*\*1\*\* recorded absence entries/i);
    expect(lateRes.answer).toMatch(/Arun/);
    expect(lateRes.answer).toMatch(/Deepa/);
    expect(lateRes.answer).toMatch(/Bala/); // open MPO with late minutes counts
    expect(lateRes.answer).not.toMatch(/Chetan/); // stale lateMinutes excluded from late list
    expect(lateRes.answer).not.toMatch(/Farah/); // absent, not late

    const overviewRes = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "attendance this month"
    );
    expect(overviewRes.answer).toMatch(/Here’s the attendance summary/i);
    expect(overviewRes.answer).not.toMatch(/Here’s the late list/i);
    expect(overviewRes.answer).toMatch(/\*\*5\*\* recorded employee present-days/i);
    expect(overviewRes.answer).toMatch(/\*\*1\*\* recorded absence entries/i);
    expect(overviewRes.answer).toMatch(/\*\*3\*\* people late/i);
    expect(overviewRes.interpretedAs ?? []).toContain("attendance overview");
  });

  it("answerNovaQuery: last week attendance is overview (not late list)", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const d = (day: number, month = 6) =>
      prismaDateFromCalendar({ year: 2026, month, day });
    const staff = (name: string, code: string) => ({
      staffCode: code,
      fullName: name,
      department: null,
    });

    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "a",
        date: d(30),
        status: "LATE",
        lateMinutes: 20,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-06-30T04:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Arun", "STF1"),
      },
      {
        staffId: "a",
        date: d(1, 7),
        status: "PRESENT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-01T03:30:00.000Z"),
        punchOutTime: null,
        staff: staff("Arun", "STF1"),
      },
      {
        staffId: "f",
        date: d(2, 7),
        status: "MISSING_PUNCH_IN",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: null,
        punchOutTime: null,
        staff: staff("Farah", "STF6"),
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "last week attendance"
    );

    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.answer).toMatch(/Here’s the attendance summary/i);
    expect(res.answer).not.toMatch(/Here’s the late list/i);
    expect(res.answer).toMatch(/29|Jun|5|Jul/i);
    expect(res.answer).toMatch(/\*\*2\*\* recorded employee present-days/i);
    expect(res.answer).toMatch(/\*\*1\*\* recorded absence entries/i);
    expect(res.answer).toMatch(/\*\*1\*\* people late/i);
    expect(res.answer).toMatch(/not counted as absent/i);
    expect(res.interpretedAs ?? []).toEqual(expect.arrayContaining(["attendance overview"]));
    expect(res.interpretedAs ?? []).not.toContain("attendance / late comers");
  });

  it("answerNovaQuery: todays attendance returns full day register summary, not Trend late-only", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const day = prismaDateFromCalendar({ year: 2026, month: 7, day: 12 });
    const staff = (name: string, code: string) => ({
      staffCode: code,
      fullName: name,
      department: null,
    });

    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "a",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 7,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-12T04:07:00.000Z"),
        punchOutTime: null,
        staff: staff("MD Arif Ansari", "STF1"),
      },
      {
        staffId: "b",
        date: day,
        status: "PRESENT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-12T03:55:00.000Z"),
        punchOutTime: new Date("2026-07-12T12:30:00.000Z"),
        staff: staff("Neha Shah", "STF2"),
      },
      {
        staffId: "c",
        date: day,
        status: "MISSING_PUNCH_IN",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: null,
        punchOutTime: null,
        staff: staff("Farah Khan", "STF3"),
      },
    ] as never);

    const res = await answerNovaQuery(
      user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
      }),
      "todays attendance"
    );

    expect(res.toolsUsed).toContain("attendance_late_summary");
    expect(res.toolsUsed).not.toContain("nova_trend");
    expect(res.answer).toMatch(/Here’s the attendance summary/i);
    expect(res.answer).not.toMatch(/Here’s the late list/i);
    expect(res.answer).toMatch(/\*\*2\*\* punched in/i);
    expect(res.answer).toMatch(/\*\*1\*\* absent/i);
    expect(res.answer).toMatch(/\*\*1\*\* late/i);
    expect(res.answer).toMatch(/Punched in/i);
    expect(res.answer).toMatch(/Absent/i);
    expect(res.answer).toMatch(/Late/i);
    expect(res.answer).toMatch(/MD Arif Ansari/i);
    expect(res.answer).toMatch(/Farah Khan/i);
    expect(res.interpretedAs ?? []).toEqual(expect.arrayContaining(["attendance overview"]));
    expect(res.interpretedAs ?? []).not.toContain("attendance / late comers");
  });
});

describe("mid-day open MPO attendance (13 Jul 2026 register regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00+05:30"));
    vi.mocked(isNovaLlmConfigured).mockReturnValue(false);
    vi.mocked(prisma.staffProfile.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("answerNovaQuery: punch-in + late lists match open MISSING_PUNCH_OUT register (not 0 late)", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const day = prismaDateFromCalendar({ year: 2026, month: 7, day: 13 });
    const staff = (name: string, code: string) => ({
      staffCode: code,
      fullName: name,
      department: null,
    });
    // Mirror prod 13 Jul 2026 register: everyone still MISSING_PUNCH_OUT mid-day.
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "a",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:27:00.000Z"), // 9:57 IST
        punchOutTime: null,
        staff: staff("Aalok Jha", "STF0008"),
      },
      {
        staffId: "b",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 91,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T06:00:00.000Z"), // 11:30 IST
        punchOutTime: null,
        staff: staff("Arun C Michael", "STF0003"),
      },
      {
        staffId: "c",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 1,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:31:00.000Z"),
        punchOutTime: null,
        staff: staff("Faiyaz Khan", "STF0009"),
      },
      {
        staffId: "d",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 5,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:34:00.000Z"),
        punchOutTime: null,
        staff: staff("Kokila G", "STF0006"),
      },
      {
        staffId: "e",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:29:00.000Z"),
        punchOutTime: null,
        staff: staff("Madhu M", "STF0010"),
      },
      {
        staffId: "f",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 34,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T05:03:00.000Z"),
        punchOutTime: null,
        staff: staff("MD Arif Ansari", "STF0007"),
      },
      {
        staffId: "g",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 51,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T05:21:00.000Z"),
        punchOutTime: null,
        staff: staff("MD Shahzada Shah", "STF0005"),
      },
    ] as never);

    const adminUser = user({
      role: "ADMIN",
      grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
    });

    const lateRes = await answerNovaQuery(adminUser, "who was late today");
    expect(lateRes.toolsUsed).toContain("attendance_late_summary");
    expect(lateRes.answer).toMatch(/Here’s the late list/i);
    expect(lateRes.answer).toMatch(/\*\*5\*\* people late/i);
    expect(lateRes.answer).toMatch(/Arun C Michael/);
    expect(lateRes.answer).toMatch(/MD Shahzada Shah/);
    expect(lateRes.answer).toMatch(/91 min|51 min|34 min/i);
    expect(lateRes.answer).not.toMatch(/No one was late/i);
    expect(lateRes.answer).not.toMatch(/\*\*0\*\* people late/);

    const punchRes = await answerNovaQuery(adminUser, "who punched in today");
    expect(punchRes.toolsUsed).toContain("attendance_late_summary");
    expect(punchRes.answer).toMatch(/Here’s who was present|Punched in/i);
    expect(punchRes.answer).toMatch(/\*\*7\*\* people punched in/i);
    expect(punchRes.answer).toMatch(/Aalok Jha/);
    expect(punchRes.answer).toMatch(/Madhu M/);
    expect(punchRes.answer).toMatch(/9:57|11:30|10:51/i);
    expect(punchRes.answer).not.toMatch(/Here’s the late list/i);
    expect(punchRes.answer).not.toMatch(/No one was late/i);

    const timesRes = await answerNovaQuery(adminUser, "punch in times");
    expect(timesRes.toolsUsed).toContain("attendance_late_summary");
    expect(timesRes.answer).toMatch(/Punched in|Here’s who was present/i);
    expect(timesRes.answer).toMatch(/Arun C Michael/);
    expect(timesRes.answer).not.toMatch(/\*\*0\*\* people late/);

    const outRes = await answerNovaQuery(adminUser, "Punch out time of all staffs");
    expect(outRes.toolsUsed).toContain("attendance_late_summary");
    expect(outRes.interpretedAs).toEqual(expect.arrayContaining(["attendance / punch out"]));
    expect(outRes.answer).toMatch(/Here’s the punch-out list/i);
    expect(outRes.answer).toMatch(/no punch out yet/i);
    expect(outRes.answer).toMatch(/Aalok Jha/);
    expect(outRes.answer).toMatch(/IN 9:57|9:57/i);
    expect(outRes.answer).not.toMatch(/Here’s the late list/i);
    expect(outRes.answer).not.toMatch(/min late/i);
  });

  it("llmPreservesPunchOutFocus rejects late rewrite and empty out answers", () => {
    const facts = [
      {
        tool: "attendance_late_summary",
        ok: true,
        data: {
          focus: "punch_out",
          periodGrain: "day",
          presentPunchDays: 2,
          topPresent: [
            { name: "Aalok Jha", punchOutLabel: "6:00 pm", punchInLabel: "9:30 am" },
            { name: "Arun C Michael", punchOutLabel: null, punchInLabel: "10:20 am" },
          ],
        },
      },
    ];
    expect(llmPreservesPunchOutFocus("Here’s the late list:\n- Aalok — 30 min late", facts)).toBe(
      false
    );
    expect(llmPreservesPunchOutFocus("Here’s who was present:\n- Aalok Jha — 9:30 am", facts)).toBe(
      false
    );
    expect(
      llmPreservesPunchOutFocus(
        "Here’s the punch-out list:\n- Aalok Jha — OUT 6:00 pm\n- Arun — no punch out yet",
        facts
      )
    ).toBe(true);
  });
});
