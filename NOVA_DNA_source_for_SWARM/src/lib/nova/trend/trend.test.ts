/**
 * NOVA Trend — unit / golden tests (window bind + ranking + cues).
 */
import { describe, expect, it } from "vitest";
import { hasNovaSkill } from "@/lib/nova/skills/registry";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import {
  bindNovaTrendWindow,
  inferNovaTrendGrain,
  isNovaTrendCue,
  inferNovaTrendDomain,
  rankNovaTrendEntities,
  sparklineFromSeries,
  formatNovaTrendDeterministic,
  isTaskCompletedAfterDue,
  trendPartySupport,
  trendTaskPartyScopeFromCtx,
  invoiceOutstandingAsOf,
  agingDaysAsOf,
  preferArAgingGrain,
  AR_TREND_OVERDUE_DAYS,
  kpiTrendWindowDays,
  wantsKpiHighStreak,
  kpiHighScoreTrailingStreak,
  KPI_HIGH_SCORE_FLOOR,
  listNovaTrendMeasures,
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
} from "@/lib/nova/trend";

describe("NOVA Trend cues + routing", () => {
  it("registers nova_trend skill", () => {
    expect(hasNovaSkill("nova_trend")).toBe(true);
  });

  it("routes late-comers / attendance frequency to nova_trend (non-money)", () => {
    const phrases = [
      "who is frequently late",
      "late punch trend last 30 days",
      "who is always late",
      "attendance late over time",
      "late comers trend last 30 days",
      "latecomers trend",
    ];
    for (const q of phrases) {
      expect(isNovaTrendCue(q), q).toBe(true);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("nova_trend");
      expect(inferNovaTrendDomain(q).domain, q).toBe("attendance_late");
    }
  });

  it("keeps generic and same-day attendance on the register skill", () => {
    const registerPhrases = [
      "todays attendance",
      "today attendance",
      "attendance today",
      "today's attendance register",
      "who came late today",
      "late people today",
    ];
    for (const raw of registerPhrases) {
      const q = normalizeNovaQuery(raw);
      expect(isNovaTrendCue(q), raw).toBe(false);
      expect(selectNovaTools(q), raw).toEqual(["attendance_late_summary"]);
    }
  });

  it("still sends explicit late attendance trends to attendance_late Trend", () => {
    const trendPhrases = ["late comers trend", "late attendance trend"];
    for (const raw of trendPhrases) {
      const q = normalizeNovaQuery(raw);
      expect(isNovaTrendCue(q), raw).toBe(true);
      expect(selectNovaTools(q), raw).toEqual(["nova_trend"]);
      expect(inferNovaTrendDomain(q).domain, raw).toBe("attendance_late");
    }
  });

  it("routes late task completion trends to nova_trend", () => {
    const phrases = [
      "who completes tasks after overdue most often",
      "task overdue completion trend this month",
      "frequently completes after due",
    ];
    for (const q of phrases) {
      expect(isNovaTrendCue(q), q).toBe(true);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("nova_trend");
    }
  });

  it("keeps Analysis for why-late cues", () => {
    const phrases = ["why so many late", "why late", "attendance analysis"];
    for (const q of phrases) {
      expect(isNovaTrendCue(q), q).toBe(false);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("nova_analysis");
      expect(selectNovaTools(normalizeNovaQuery(q)), q).not.toContain("nova_trend");
    }
  });

  it("routes AR aging and KPI score / streak trends to nova_trend", () => {
    const phrases = [
      "AR aging trend last 90 days",
      "outstanding trend",
      "customers whose outstanding is worsening",
      "receivables trend over time",
      "KPI trend for Amit",
      "KPI trend for Amit this quarter",
      "kpi score trend",
      "who has high KPI for a long streak",
      "high kpi streak",
      "sustained high kpi",
    ];
    for (const q of phrases) {
      expect(isNovaTrendCue(q), q).toBe(true);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("nova_trend");
    }
  });

  it("infers attendance vs task domains", () => {
    expect(inferNovaTrendDomain("who is frequently late").domain).toBe("attendance_late");
    expect(inferNovaTrendDomain("who completes tasks after overdue most often").domain).toBe(
      "task_late_completion"
    );
  });

  it("infers AR aging and KPI score domains (person + streak)", () => {
    expect(inferNovaTrendDomain("AR aging trend last 90 days").domain).toBe("ar_aging");
    expect(inferNovaTrendDomain("customers whose outstanding is worsening").domain).toBe(
      "ar_aging"
    );
    expect(inferNovaTrendDomain("KPI trend for Amit").domain).toBe("kpi_score");
    expect(inferNovaTrendDomain("KPI trend for Amit this quarter").domain).toBe("kpi_score");
    expect(inferNovaTrendDomain("kpi score trend").domain).toBe("kpi_score");
    expect(inferNovaTrendDomain("who has high KPI for a long streak").domain).toBe("kpi_score");
    expect(wantsKpiHighStreak("who has high KPI for a long streak")).toBe(true);
    expect(wantsKpiHighStreak("KPI trend for Amit this quarter")).toBe(false);
  });

  it("carries entitySpan for party-scoped late task trend (QI-10)", () => {
    const hit = inferNovaTrendDomain("late task completion trend for avaada");
    expect(hit.domain).toBe("task_late_completion");
    expect(hit.entitySpan?.toLowerCase()).toBe("avaada");
  });
});

describe("NOVA Trend measure registry", () => {
  it("lists live non-money + money + kpi measures", () => {
    const live = listNovaTrendMeasures("live");
    const ids = live.map((m) => m.id);
    expect(ids).toContain("attendance_late_frequency");
    expect(ids).toContain("task_late_completion_frequency");
    expect(ids).toContain("ar_overdue_trajectory");
    expect(ids).toContain("kpi_score_trajectory");
    expect(ids).toContain("kpi_high_score_streak");
    expect(listNovaTrendMeasures("planned").length).toBeGreaterThan(0);
  });
});

describe("NOVA Trend party matrix (P0+P1 SoT)", () => {
  it("task_late supports soft project + customer; attendance person-only; AR/KPI live", () => {
    expect(trendPartySupport("task_late_completion", "project")).toBe("soft");
    expect(trendPartySupport("task_late_completion", "customer")).toBe("soft");
    expect(trendPartySupport("task_late_completion", "vendor")).toBe("none");
    expect(trendPartySupport("attendance_late", "person")).toBe("hard");
    expect(trendPartySupport("attendance_late", "project")).toBe("none");
    expect(trendPartySupport("ar_aging", "customer")).toBe("soft");
    expect(trendPartySupport("kpi_score", "person")).toBe("hard");
  });

  it("trendTaskPartyScopeFromCtx maps project + customer binds", () => {
    expect(
      trendTaskPartyScopeFromCtx({
        resolvedEntityDbId: "p1",
        resolvedEntityType: "project",
        entityFilterName: "Avaada",
      }).where
    ).toEqual({ projectId: "p1" });
    expect(
      trendTaskPartyScopeFromCtx({
        resolvedEntityDbId: "c1",
        resolvedEntityType: "customer",
        entityFilterName: "Tata",
      }).where
    ).toEqual({ project: { customerId: "c1" } });
    expect(
      trendTaskPartyScopeFromCtx({
        resolvedEntityDbId: "v1",
        resolvedEntityType: "vendor",
        entityFilterName: "Steel",
      }).where
    ).toBeNull();
  });
});

describe("NOVA Trend window bind", () => {
  const now = new Date("2026-07-14T10:00:00+05:30");
  const tz = "Asia/Kolkata";

  it("parses last N days", () => {
    const w = bindNovaTrendWindow("late trend last 14 days", { now, tz });
    expect(w.source).toBe("parsed");
    expect(w.label).toBe("last 14 days");
    expect(inferNovaTrendGrain(w.from, w.to)).toBe("day");
  });

  it("defaults to last 30 days", () => {
    const w = bindNovaTrendWindow("who is frequently late", { now, tz });
    expect(w.source).toBe("default_30d");
    expect(w.label).toBe("last 30 days");
  });

  it("honours explicit range", () => {
    const from = new Date("2026-06-01T00:00:00+05:30");
    const to = new Date("2026-06-30T23:59:59+05:30");
    const w = bindNovaTrendWindow("trend", {
      now,
      tz,
      range: { from, to, label: "June 2026" },
    });
    expect(w.source).toBe("explicit");
    expect(w.label).toBe("June 2026");
  });
});

describe("NOVA Trend ranking + format", () => {
  it("ranks by value desc with stable label tie-break", () => {
    const ranks = rankNovaTrendEntities([
      { label: "Ben", value: 5 },
      { label: "Ada", value: 8 },
      { label: "Cal", value: 8 },
    ]);
    expect(ranks.map((r) => r.label)).toEqual(["Ada", "Cal", "Ben"]);
    expect(ranks[0]!.rank).toBe(1);
  });

  it("builds sparkline for series ≥3", () => {
    expect(
      sparklineFromSeries([
        { bucket: "a", value: 1 },
        { bucket: "b", value: 3 },
        { bucket: "c", value: 2 },
      ])
    ).toMatch(/^[▁▂▃▄▅▆▇█]+$/);
  });

  it("formats summary with ranking table digits only from evidence", () => {
    const bundle: NovaTrendBundle = {
      schemaVersion: NOVA_TREND_SCHEMA_VERSION,
      domain: "attendance_late",
      entity: { kind: "org", label: "Organisation" },
      metric: { id: "late_days", label: "Late days", unit: "late day(s)" },
      window: {
        from: new Date("2026-06-14"),
        to: new Date("2026-07-14"),
        label: "last 30 days",
        source: "default_30d",
      },
      grain: "day",
      series: [
        { bucket: "2026-07-01", value: 2 },
        { bucket: "2026-07-02", value: 4 },
        { bucket: "2026-07-03", value: 1 },
      ],
      rankings: [
        { rank: 1, label: "Ada", value: 8, secondary: "A01" },
        { rank: 2, label: "Ben", value: 5, secondary: "B02" },
      ],
    };
    const formatted = formatNovaTrendDeterministic(bundle);
    expect(formatted.primaryNarrative).toContain("Attendance late trend");
    expect(formatted.primaryNarrative).toContain("Ada");
    expect(formatted.primaryNarrative).toContain("| 1 |");
    expect(formatted.summary).toContain("13");
  });
});

describe("task late-completion predicate", () => {
  const tz = "Asia/Kolkata";
  it("is late when completed day after due", () => {
    expect(
      isTaskCompletedAfterDue(
        new Date("2026-07-10T10:00:00+05:30"),
        new Date("2026-07-11T09:00:00+05:30"),
        tz
      )
    ).toBe(true);
  });
  it("is not late when completed same calendar day", () => {
    expect(
      isTaskCompletedAfterDue(
        new Date("2026-07-10T09:00:00+05:30"),
        new Date("2026-07-10T22:00:00+05:30"),
        tz
      )
    ).toBe(false);
  });
});

describe("AR aging as-of reconstruction", () => {
  it("ignores receipts after asOf and counts age > 30 as overdue days", () => {
    const inv = {
      invoiceDate: new Date("2026-01-01T00:00:00Z"),
      grandTotal: 10000,
      receipts: [
        { amount: 2000, receiptDate: new Date("2026-02-01T00:00:00Z") },
        { amount: 3000, receiptDate: new Date("2026-06-01T00:00:00Z") },
      ],
      creditNotes: [] as { grandTotal: unknown; cnDate: Date; voidedAt: Date | null }[],
      debitNotes: [] as { grandTotal: unknown; dnDate: Date; voidedAt: Date | null }[],
    };
    const asOf = new Date("2026-03-15T00:00:00Z");
    expect(invoiceOutstandingAsOf(inv, asOf)).toBe(8000);
    expect(agingDaysAsOf(inv.invoiceDate, asOf)).toBeGreaterThan(AR_TREND_OVERDUE_DAYS);
  });

  it("prefers week grain for short AR windows", () => {
    const from = new Date("2026-06-14");
    const to = new Date("2026-07-14");
    expect(preferArAgingGrain(from, to)).toBe("week");
  });
});

describe("KPI trend window stretch + high streak", () => {
  it("stretches default_30d to 180 days", () => {
    expect(kpiTrendWindowDays("default_30d")).toBe(180);
    expect(kpiTrendWindowDays("parsed")).toBeNull();
  });

  it("counts trailing high scores ≥ floor", () => {
    expect(kpiHighScoreTrailingStreak([60, 80, 90, 88], KPI_HIGH_SCORE_FLOOR)).toBe(3);
    expect(kpiHighScoreTrailingStreak([90, 80, 50], KPI_HIGH_SCORE_FLOOR)).toBe(0);
    expect(kpiHighScoreTrailingStreak([70, 75], KPI_HIGH_SCORE_FLOOR)).toBe(1);
  });
});
