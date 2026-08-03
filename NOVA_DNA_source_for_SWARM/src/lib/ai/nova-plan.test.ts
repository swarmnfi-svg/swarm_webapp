import { describe, expect, it } from "vitest";
import {
  applyNovaPlanPeriodDefault,
  buildNovaPlan,
  buildNovaPlanFromIntent,
  finalizeNovaPlan,
  getNovaModuleContract,
  mergeNovaPlanSlots,
  novaPlanFollowUpPatch,
  novaPlanHasReadyTools,
  novaPlanMissingRequired,
  priorNovaPlanForFollowUp,
  shouldClarifyNovaPlan,
  summarizeNovaPlan,
  withNovaPlanTools,
  type NovaPlan,
} from "@/lib/ai/nova-plan";
import type { NovaIntent } from "@/lib/ai/nova-intent";
import { novaAmbiguityClarification } from "@/lib/ai/nova-dates";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { selectNovaTools } from "@/lib/ai/nova-tools";

describe("NovaPlan module contracts", () => {
  it("defaults KPI to latest and delivery to current_month", () => {
    expect(getNovaModuleContract("kpi")?.periodDefault).toBe("latest");
    expect(getNovaModuleContract("delivery")?.periodDefault).toBe("current_month");
    expect(getNovaModuleContract("receipts")?.periodDefault).toBe("none");
    expect(getNovaModuleContract("bank_recon")?.periodDefault).toBe("current_month");
    expect(getNovaModuleContract("receivables")?.periodDefault).toBe("open_queue");
    expect(getNovaModuleContract("reports")?.periodDefault).toBe("current_month");
    expect(getNovaModuleContract("gst_docs")?.periodDefault).toBe("current_month");
  });

  it("requires period for expenses and GRN (no silent month)", () => {
    expect(getNovaModuleContract("staff_expenses")?.periodDefault).toBe("none");
    expect(getNovaModuleContract("staff_expenses")?.required).toContain("period");
    expect(getNovaModuleContract("grn")?.periodDefault).toBe("none");
    expect(getNovaModuleContract("grn")?.required).toContain("period");
  });
});

describe("buildNovaPlanFromIntent", () => {
  it("maps decisive tools + clarify into a plan", () => {
    const intent: NovaIntent = {
      slots: [{ kind: "metric", topicId: "delivery" }],
      tools: ["delivery_summary"],
      confidence: "high",
      interpretedAs: ["deliveries"],
    };
    const plan = buildNovaPlanFromIntent("delivery", intent);
    expect(plan.module).toBe("delivery");
    expect(plan.tools).toEqual(["delivery_summary"]);
    expect(plan.period?.source).toBe("default");
    expect(plan.periodDefaultApplied).toBe("current_month");
    expect(shouldClarifyNovaPlan(plan)).toBe(false);
  });

  it("never clarifies when ready tools are selected", () => {
    const intent: NovaIntent = {
      slots: [
        { kind: "metric", topicId: "salary" },
        { kind: "period", grain: "month", raw: "this month" },
      ],
      tools: ["salary_summary"],
      confidence: "high",
      interpretedAs: ["salary"],
      clarify: "should be ignored when tools ready",
    };
    const plan = buildNovaPlanFromIntent("salary this month", intent);
    // Intent carried a spurious clarify — ready tools win
    expect(novaPlanHasReadyTools(plan)).toBe(true);
    expect(shouldClarifyNovaPlan(plan)).toBe(false);
  });

  it("clarifies when no tools and clarifyReason set", () => {
    const intent: NovaIntent = {
      slots: [{ kind: "period", grain: "day", raw: "today" }],
      tools: [],
      confidence: "high",
      clarify: "For **today**, which metric — **sales**, **receipts**, …?",
    };
    const plan = buildNovaPlanFromIntent("today", intent);
    expect(shouldClarifyNovaPlan(plan)).toBe(true);
    expect(plan.clarifyReason).toMatch(/metric/i);
  });
});

describe("applyNovaPlanPeriodDefault", () => {
  it("fills KPI latest when period missing", () => {
    const plan: NovaPlan = {
      query: "kpi",
      module: "kpi",
      tools: ["kpi_summary"],
      confidence: "high",
      source: "compose",
    };
    const next = applyNovaPlanPeriodDefault(plan);
    expect(next.period).toEqual({
      grain: "latest",
      label: "latest period",
      source: "default",
    });
    expect(next.periodDefaultApplied).toBe("latest");
  });

  it("does not invent a period for money modules", () => {
    const plan: NovaPlan = {
      query: "sales",
      module: "sales_invoices",
      tools: [],
      confidence: "low",
      source: "compose",
    };
    expect(applyNovaPlanPeriodDefault(plan).period).toBeUndefined();
    expect(novaPlanMissingRequired(plan)).toContain("period");
  });
});

describe("mergeNovaPlanSlots (follow-ups)", () => {
  it("swaps entity while keeping module/tools", () => {
    const base: NovaPlan = {
      query: "sales this month",
      module: "sales_invoices",
      period: { grain: "month", label: "this month", source: "explicit" },
      tools: ["sales_summary"],
      confidence: "high",
      source: "compose",
    };
    const follow = buildNovaPlanFromIntent("avaada", {
      slots: [{ kind: "entity", name: "avaada" }],
      tools: [],
      confidence: "low",
    });
    const patch = novaPlanFollowUpPatch(follow);
    const merged = mergeNovaPlanSlots(base, patch);
    expect(merged.entity).toBe("avaada");
    expect(merged.module).toBe("sales_invoices");
    expect(merged.tools).toEqual(["sales_summary"]);
    expect(merged.period?.label).toBe("this month");
    expect(merged.source).toBe("merged");
    expect(merged.query.toLowerCase()).toMatch(/avaada/);
    expect(merged.query.toLowerCase()).toMatch(/sales/);
    expect(merged.query.toLowerCase()).not.toMatch(/₹/);
  });

  it("merges period follow-up onto prior money plan", () => {
    const base: NovaPlan = {
      query: "sales",
      module: "sales_invoices",
      metric: "sales",
      tools: ["sales_summary"],
      confidence: "high",
      source: "compose",
    };
    const merged = mergeNovaPlanSlots(base, {
      period: { grain: "fy", label: "26-27", source: "follow_up" },
    });
    expect(merged.tools).toEqual(["sales_summary"]);
    expect(merged.period?.label).toBe("26-27");
    expect(merged.query).toMatch(/sales/i);
    expect(merged.query).toMatch(/26-27/);
  });
});

describe("Phase C priorNovaPlanForFollowUp", () => {
  it("infers sales tools from money narrative without copying ₹ into query", async () => {
    const { extractNovaBareEntityCandidate } = await import("@/lib/ai/nova-lexicon");
    const plan = priorNovaPlanForFollowUp(
      "tata steels",
      "Tata Steels Sales in July 2026\n₹1,23,000.00 from 3 sales invoices.",
      {
        selectTools: selectNovaTools,
        bareEntity: extractNovaBareEntityCandidate,
      }
    );
    expect(plan.tools).toContain("sales_summary");
    expect(plan.module).toBe("sales_invoices");
    expect(plan.entity?.toLowerCase()).toMatch(/tata/);
    expect(plan.query).not.toMatch(/₹/);
  });
});

describe("buildNovaPlan via compose bridge", () => {
  it("bare delivery gets a runnable plan with month default", () => {
    const plan = buildNovaPlan("delivery");
    expect(plan.tools).toContain("delivery_summary");
    expect(shouldClarifyNovaPlan(plan)).toBe(false);
    expect(plan.periodDefaultApplied === "current_month" || plan.period?.source === "default").toBe(
      true
    );
  });

  it("bare today clarifies metric (incomplete plan)", () => {
    const plan = buildNovaPlan("today");
    expect(plan.tools).toEqual([]);
    expect(shouldClarifyNovaPlan(plan)).toBe(true);
  });

  it("summarizeNovaPlan is stable for evals", () => {
    const plan = buildNovaPlanFromIntent("kpi", {
      slots: [{ kind: "metric", topicId: "kpi" }],
      tools: ["kpi_summary"],
      confidence: "high",
      interpretedAs: ["KPI"],
    });
    expect(summarizeNovaPlan(plan)).toMatch(/module=kpi/);
    expect(summarizeNovaPlan(plan)).toMatch(/tools=\[kpi_summary\]/);
  });
});

describe("Phase B finalizeNovaPlan gate", () => {
  const now = new Date("2026-07-11T09:00:00+05:30");

  function resolvePlan(q: string): NovaPlan {
    const nq = normalizeNovaQuery(q);
    let plan = buildNovaPlan(nq, now, "Asia/Kolkata");
    if (!novaPlanHasReadyTools(plan)) {
      const tools = selectNovaTools(nq).filter((t) => t !== "search_entities");
      if (tools.length) plan = withNovaPlanTools(plan, tools);
    }
    return finalizeNovaPlan(plan, {
      ambiguityClarify: novaAmbiguityClarification(nq, now, "Asia/Kolkata"),
    });
  }

  it.each([
    ["salary this month", "salary_summary"],
    ["incentives this month", "incentives_summary"],
    ["expenses today", "staff_expense_summary"],
    ["kpi", "kpi_summary"],
    ["delivery", "delivery_summary"],
  ] as const)("%s → ready %s (no clarify steal)", (q, tool) => {
    const plan = resolvePlan(q);
    expect(plan.tools).toContain(tool);
    expect(shouldClarifyNovaPlan(plan)).toBe(false);
  });

  it("bare today still clarifies", () => {
    const plan = resolvePlan("today");
    expect(shouldClarifyNovaPlan(plan)).toBe(true);
    expect(plan.clarifyReason).toMatch(/metric|sales|receipts/i);
  });

  it("bare expenses period-clarifies (required period)", () => {
    const plan = resolvePlan("expenses");
    expect(shouldClarifyNovaPlan(plan)).toBe(true);
    expect(plan.clarifyReason).toMatch(/expenses|period/i);
    expect(plan.tools).toEqual([]);
  });

  it("bare sales period-clarifies (money)", () => {
    const plan = resolvePlan("sales");
    expect(shouldClarifyNovaPlan(plan)).toBe(true);
    expect(plan.clarifyReason).toMatch(/period|FY|month|today/i);
  });

  it("does not bind temporal / module / FY tokens as a plan entity (bug sweep #2)", () => {
    // "outstanding" is a metric word — must not become entity=outstanding.
    expect(buildNovaPlan("outstanding receivables").entity).toBeUndefined();
    // Bare quarter token must not become entity=q1.
    expect(buildNovaPlan("q1 sales").entity).toBeUndefined();
    // FY period must parse as a period, never a fake "fy 25-26" party.
    const fy = buildNovaPlan("fy 25-26 receipts");
    expect(fy.entity).toBeUndefined();
    expect(fy.period?.label ?? "").toMatch(/25-?26|FY/i);
    // Real parties still bind.
    expect(buildNovaPlan("tata steel sales").entity).toMatch(/tata/i);
    expect(buildNovaPlan("acme outstanding").entity).toMatch(/acme/i);
  });

  it("withNovaPlanTools keeps search_engine when attaching search_entities onto empty plan", () => {
    const empty: NovaPlan = {
      query: "SRI RAMA MODERN AND PARA BOILED RICE MILL",
      tools: [],
      confidence: "low",
      source: "compose",
    };
    const next = withNovaPlanTools(
      { ...empty, source: "search_engine" },
      ["search_entities"]
    );
    expect(next.source).toBe("search_engine");
    expect(next.tools).toEqual(["search_entities"]);
    expect(novaPlanHasReadyTools(next)).toBe(true);
  });
});
