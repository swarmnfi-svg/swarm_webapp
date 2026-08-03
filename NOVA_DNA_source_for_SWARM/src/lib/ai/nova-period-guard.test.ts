/**
 * Isolated period-guard tests (no nova.ts / next cache import).
 */
import { describe, expect, it } from "vitest";
import {
  factPeriodLooksLikeSingleDay,
  factPeriodLooksWiderThanDay,
  llmPreservesPeriodIntent,
  queryHasDayPeriodIntent,
} from "@/lib/ai/nova-dates";
import { guardNovaAnswer } from "@/lib/ai/nova-answer-guard";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";

describe("day period label helpers", () => {
  it("recognizes short and long single-day labels", () => {
    expect(factPeriodLooksLikeSingleDay("20 Jul 2026")).toBe(true);
    expect(factPeriodLooksLikeSingleDay("20 July 2026")).toBe(true);
    expect(factPeriodLooksLikeSingleDay("July 2026")).toBe(false);
    expect(factPeriodLooksWiderThanDay("20 July 2026")).toBe(false);
    expect(factPeriodLooksWiderThanDay("July 2026")).toBe(true);
  });
});

describe("todays expenses / receipts period guard", () => {
  it("normalizes todays / today's to day intent", () => {
    expect(queryHasDayPeriodIntent(normalizeNovaQuery("todays expenses"))).toBe(true);
    expect(queryHasDayPeriodIntent(normalizeNovaQuery("Today's receipts"))).toBe(true);
    expect(queryHasDayPeriodIntent(normalizeNovaQuery("FY sales"))).toBe(false);
  });

  it("does not soft-mismatch when LLM writes 20 July 2026 for day expenses", () => {
    const query = normalizeNovaQuery("todays expenses");
    const facts = [
      {
        tool: "staff_expense_summary",
        ok: true as const,
        data: {
          period: "20 Jul 2026",
          periodGrain: "day",
          totalPaidInr: "₹5,749.00",
          totalPaid: 5749,
          manualPaidInr: "₹0.00",
          paymentRequestPaidInr: "₹5,749.00",
        },
      },
    ];
    const llmText = "Expenses paid on 20 July 2026 were ₹5,749.00 (manual ₹0 · payment requests ₹5,749).";
    expect(llmPreservesPeriodIntent(query, facts, llmText)).toBe(true);
    const guarded = guardNovaAnswer({
      query,
      facts,
      text: llmText,
      deterministic: false,
    });
    expect(guarded.failed).toBe(false);
    expect(guarded.text).not.toMatch(/AI period did not match/);
  });

  it("does not soft-mismatch for today's receipts with day-shaped period and no periodGrain", () => {
    const query = normalizeNovaQuery("Todays receipts");
    const facts = [
      {
        tool: "receipts_summary",
        ok: true as const,
        data: {
          period: "20 Jul 2026",
          totalCollectedInr: "₹10,000.00",
          totalCollected: 10000,
          receiptCount: 2,
        },
      },
    ];
    const llmText = "Today's receipts (20 July 2026): ₹10,000.00 across 2 receipts.";
    expect(llmPreservesPeriodIntent(query, facts, llmText)).toBe(true);
    const guarded = guardNovaAnswer({
      query,
      facts,
      text: llmText,
      deterministic: true,
    });
    // Money/count guards may still rewrite; period soft-note must not appear for day-shaped facts.
    expect(guarded.failedGuard).not.toBe("answer_period_guard");
    expect(guarded.text).not.toMatch(/AI period did not match/);
  });

  it("FY sales is not a day ask (period guard no-ops)", () => {
    expect(
      llmPreservesPeriodIntent(
        normalizeNovaQuery("FY sales"),
        [{ ok: true, data: { period: "FY 26-27", periodGrain: "fy" } }],
        "FY 26-27 sales totaled ₹1,00,000."
      )
    ).toBe(true);
  });

  it("still flags real month bleed on a day ask", () => {
    expect(
      llmPreservesPeriodIntent(
        "today expenses",
        [{ ok: true, data: { period: "20 Jul 2026", periodGrain: "day" } }],
        "For July 2026, expenses totaled ₹5,749."
      )
    ).toBe(false);
  });
});
