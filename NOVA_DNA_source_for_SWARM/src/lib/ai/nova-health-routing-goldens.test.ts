/**
 * P0 how-is / business-health routing goldens (§5 NOVA_DRASTIC_IMPROVEMENT_PLAN).
 */
import { describe, expect, it } from "vitest";
import { extractNovaEntityHint } from "@/lib/ai/nova-lexicon";
import { composeNovaIntent } from "@/lib/ai/nova-intent";
import { buildNovaPlan, novaPlanHasReadyTools } from "@/lib/ai/nova-plan";
import { resolveNovaPresentationMode } from "@/lib/ai/nova-presentation";
import {
  HOW_IS_FRAME,
  novaSearchEngineIsDecisive,
  runNovaSearchEngine,
} from "@/lib/nova/nova-search-engine";
import { recipeMatchesQuery } from "@/lib/nova/recipes/registry";
import { isNovaNonReferentialName } from "@/lib/ai/nova-inference";

const MUST_NOT_RESOLVE = (q: string) => {
  const slots = runNovaSearchEngine(q);
  expect(slots.queryFamily, q).not.toBe("resolve");
  expect(novaSearchEngineIsDecisive(slots), q).toBe(true);
  return slots;
};

describe("P0 health routing goldens", () => {
  it.each([
    "HOW is business",
    "how is business",
    "how's business",
    "how are we doing",
  ])("%s → month_performance (business_health alias), not resolve", (q) => {
    const slots = MUST_NOT_RESOLVE(q);
    expect(slots.tools).toContain("month_performance");
    expect(slots.entityHint).toBeNull();
    expect(slots.period).toBe("this month");
    expect(composeNovaIntent(q).tools).toContain("month_performance");
    expect(recipeMatchesQuery(q) === "month_performance" || slots.tools.includes("month_performance")).toBe(
      true
    );
  });

  it.each(["how is sales", "how's sales", "how is revenue"])(
    "%s → sales_summary, entityHint null",
    (q) => {
      const slots = MUST_NOT_RESOLVE(q);
      expect(slots.tools).toContain("sales_summary");
      expect(slots.entityHint).toBeNull();
      expect(extractNovaEntityHint(q)).toBeNull();
      const intent = composeNovaIntent(q);
      expect(intent.tools).toContain("sales_summary");
      expect(intent.tools).not.toEqual(["search_entities"]);
    }
  );

  it("how is cash this week? → cash_banking", () => {
    const q = "how is cash this week?";
    const slots = MUST_NOT_RESOLVE(q);
    expect(slots.tools).toContain("cash_banking");
    expect(recipeMatchesQuery(q)).toBe("cash_banking");
  });

  it("how is banking going → cash_banking", () => {
    const slots = MUST_NOT_RESOLVE("how is banking going");
    expect(slots.tools).toContain("cash_banking");
  });

  it("how is this month going → month_performance", () => {
    const slots = MUST_NOT_RESOLVE("how is this month going");
    expect(slots.tools).toContain("month_performance");
  });

  it("how is this month's attendance → attendance_month", () => {
    const slots = MUST_NOT_RESOLVE("how is this month's attendance");
    expect(slots.tools).toContain("attendance_month");
  });

  it("bare business → health pack, not party matching business", () => {
    const slots = MUST_NOT_RESOLVE("business");
    expect(slots.tools).toContain("month_performance");
    expect(slots.queryFamily).not.toBe("resolve");
  });

  it("bare sales → not entity resolve", () => {
    const slots = runNovaSearchEngine("sales");
    expect(slots.queryFamily).not.toBe("resolve");
  });

  it("find customer Avaada stays search (not health steal)", () => {
    const slots = runNovaSearchEngine("find customer Avaada");
    expect(slots.queryFamily).toBe("search");
    expect(slots.tools).toContain("search_entities");
    expect(slots.tools).not.toContain("month_performance");
  });

  it("who is Arun → staff profile", () => {
    const slots = runNovaSearchEngine("who is Arun");
    expect(slots.queryFamily).toBe("people");
    expect(slots.tools).toContain("staff_summary");
  });

  it("Tata Steels bare → resolve (not forced sales)", () => {
    const slots = runNovaSearchEngine("Tata Steels");
    expect(slots.queryFamily).toBe("resolve");
    expect(slots.tools).toEqual(["search_entities"]);
  });

  it("create invoice → deny_write", () => {
    const slots = runNovaSearchEngine("create invoice");
    expect(slots.queryFamily).toBe("deny_write");
    expect(slots.tools).toEqual([]);
  });

  it("unit companions from plan §5", () => {
    expect(runNovaSearchEngine("how is business").queryFamily).not.toBe("resolve");
    expect(runNovaSearchEngine("HOW is business").queryFamily).not.toBe("resolve");
    expect(extractNovaEntityHint("how is sales")).toBeNull();
    const intent = composeNovaIntent("how is sales");
    expect(intent.tools.includes("sales_summary") || Boolean(intent.clarify)).toBe(true);
  });

  it("WH / how-is never referential party names", () => {
    expect(isNovaNonReferentialName("how is")).toBe(true);
    expect(HOW_IS_FRAME.test("how is sales")).toBe(true);
    expect(isNovaNonReferentialName("business")).toBe(true);
  });

  it("health money facts use deterministic_polished", () => {
    expect(
      resolveNovaPresentationMode([
        {
          tool: "sales_summary",
          ok: true,
          data: { invoiceCount: 2, grandTotalInr: "₹100.00" },
        },
      ])
    ).toBe("deterministic_polished");
    expect(
      resolveNovaPresentationMode([
        {
          tool: "month_performance",
          ok: true,
          data: { period: { label: "July 2026" } },
        },
      ])
    ).toBe("deterministic_polished");
  });

  it("buildNovaPlan for how is sales has ready sales_summary", () => {
    const plan = buildNovaPlan("how is sales");
    expect(plan.tools).toContain("sales_summary");
    expect(novaPlanHasReadyTools(plan)).toBe(true);
    expect(plan.entity).toBeFalsy();
  });

  it("SRI RAMA / long mill / SEARCH: → ready entity search (not late-comers clarify)", () => {
    for (const q of [
      "SRI RAMA",
      "SRI RAMA MODERN AND PARA BOILED RICE MILL",
      "SEARCH: SRI RAMA",
    ]) {
      const slots = runNovaSearchEngine(q);
      expect(slots.tools, q).toEqual(["search_entities"]);
      expect(
        slots.queryFamily === "resolve" || slots.queryFamily === "search",
        q
      ).toBe(true);
      expect(slots.entityHint, q).toMatch(/SRI RAMA/i);
      expect(slots.entityHint, q).not.toMatch(/^:/);

      const plan = buildNovaPlan(q);
      expect(plan.tools, q).toEqual(["search_entities"]);
      expect(novaPlanHasReadyTools(plan), q).toBe(true);
      expect(plan.source, q).toBe("search_engine");
    }
  });
});
