import { describe, expect, it, vi } from "vitest";
import {
  isNovaAnalysisCue,
  inferNovaAnalysisDomain,
} from "@/lib/nova/analysis/domain";
import {
  buildNovaAnalysisReasons,
  runNovaAnalysis,
} from "@/lib/nova/analysis/engine";
import { novaAnalysisNarrativeDigitGuard } from "@/lib/nova/analysis/narrate";
import {
  adaptAttendanceFactToAnalysisBundle,
  adaptKpiReportCardToBundle,
  adaptOutstandingFactsToAnalysisBundle,
  adaptProjectFactsToAnalysisBundle,
  adaptTasksFactToAnalysisBundle,
} from "@/lib/nova/analysis/adapters";
import { buildKpiReportCard } from "@/lib/kpi/report-card";
import { explainScoreLine } from "@/lib/kpi/explain";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { extractNovaPersonHint } from "@/lib/ai/nova-lexicon";
import { inferNovaAnalysisDepth } from "@/lib/nova/analysis/depth";
import { hasNovaSkill } from "@/lib/nova/skills/registry";
import type { NovaAnalysisBundle } from "@/lib/nova/analysis/factor-schema";
import {
  listShippedNovaAnalysisModules,
  NOVA_ANALYSIS_MODULES,
} from "@/lib/nova/analysis/modules/registry";

vi.mock("@/lib/ai/llm", () => ({
  isNovaLlmConfigured: () => false,
  novaChatCompletion: vi.fn(),
}));

function line(partial: {
  name: string;
  code: string;
  weight: number;
  target: number | null;
  actual: number | null;
  score: number | null;
  weighted: number | null;
}) {
  const base = {
    parameterName: partial.name,
    parameterCode: partial.code,
    category: "Ops",
    scoringRule: "HIGHER_IS_BETTER" as const,
    dataSource: "MANUAL" as const,
    targetValue: partial.target,
    actualValue: partial.actual,
    achievementPercent: null,
    weightage: partial.weight,
    rawScore: partial.score,
    weightedScore: partial.weighted,
    finalScore: partial.score,
  };
  return {
    ...base,
    explain: explainScoreLine(base),
  };
}

describe("NOVA Analysis cues + routing", () => {
  it("registers nova_analysis skill", () => {
    expect(hasNovaSkill("nova_analysis")).toBe(true);
  });

  it("ships P0 modules and lists P1/P2 planned rows", () => {
    const shipped = listShippedNovaAnalysisModules().map((m) => m.id).sort();
    expect(shipped).toEqual(
      ["attendance", "kpi", "outstanding", "project", "tasks"].sort()
    );
    expect(NOVA_ANALYSIS_MODULES.some((m) => m.priority === "P1")).toBe(true);
    expect(NOVA_ANALYSIS_MODULES.some((m) => m.priority === "P2" && !m.load)).toBe(
      true
    );
  });

  it("routes why / analyze phrases to nova_analysis", () => {
    for (const q of [
      "why is my kpi low",
      "why overdue",
      "analyze this project",
      "why is outstanding high",
      "why so many late",
      "attendance analysis",
    ]) {
      expect(isNovaAnalysisCue(q), q).toBe(true);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("nova_analysis");
    }
  });

  it("routes why {entity} tasks overdue via Analysis cue (not depth-only)", () => {
    for (const q of [
      "why are avaada tasks overdue",
      "why Avaada tasks overdue",
      "why are James School tasks overdue",
      "why are these Avaada tasks overdue",
      "why is Avaada overdue on tasks",
    ]) {
      expect(isNovaAnalysisCue(q), q).toBe(true);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toEqual(["nova_analysis"]);
      expect(inferNovaAnalysisDomain(q).domain, q).toBe("tasks");
    }
    // Thin list (no why) stays tasks_summary — cue must not steal
    expect(isNovaAnalysisCue("avaada tasks overdue")).toBe(false);
    expect(selectNovaTools(normalizeNovaQuery("avaada tasks overdue"))).toContain(
      "tasks_summary"
    );
    expect(selectNovaTools(normalizeNovaQuery("avaada tasks overdue"))).not.toContain(
      "nova_analysis"
    );
  });

  it("routes named KPI summary/analysis to nova_analysis", () => {
    for (const q of [
      "MD Arif Ansari - KPI ANALYSIS",
      "KPI summary of MD Arif Ansari",
      "kpi analysis of Arif",
      "Arif Ansari kpi analysis",
    ]) {
      expect(isNovaAnalysisCue(q), q).toBe(true);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).toContain("nova_analysis");
    }
  });

  it("does not steal bare kpi list", () => {
    expect(isNovaAnalysisCue("my kpi")).toBe(false);
    expect(isNovaAnalysisCue("kpi list")).toBe(false);
    expect(selectNovaTools(normalizeNovaQuery("kpi list"))).toContain("kpi_summary");
  });

  it("infers domains", () => {
    expect(inferNovaAnalysisDomain("why is my kpi low").domain).toBe("kpi");
    expect(inferNovaAnalysisDomain("why overdue").domain).toBe("tasks");
    expect(inferNovaAnalysisDomain("analyze this project").domain).toBe("project");
    expect(inferNovaAnalysisDomain("why outstanding").domain).toBe("outstanding");
    expect(inferNovaAnalysisDomain("attendance analysis").domain).toBe("attendance");
  });

  it("does not steal money/delivery late into attendance analysis", () => {
    for (const q of [
      "why late payment",
      "why late invoices",
      "why late delivery",
      "why delivery late",
      "late payment",
      "late fee",
      "payment late",
    ]) {
      expect(isNovaAnalysisCue(q), q).toBe(false);
      expect(selectNovaTools(normalizeNovaQuery(q)), q).not.toContain("nova_analysis");
      expect(selectNovaTools(normalizeNovaQuery(q)), q).not.toContain(
        "attendance_late_summary"
      );
    }
    expect(isNovaAnalysisCue("why late")).toBe(true);
    expect(isNovaAnalysisCue("why so many late")).toBe(true);
    expect(inferNovaAnalysisDomain("why late invoices").domain).toBe("outstanding");
    expect(inferNovaAnalysisDomain("why late payment").domain).toBe("outstanding");
    expect(inferNovaAnalysisDomain("why late").domain).toBe("attendance");
    expect(selectNovaTools("why delivery late")).toContain("delivery_summary");
  });
});

describe("universal Analysis depth + person bind", () => {
  it("binds multi-word staff for KPI analysis phrasing", () => {
    expect(extractNovaPersonHint("MD Arif Ansari - KPI ANALYSIS")).toBe("MD Arif Ansari");
    expect(extractNovaPersonHint("KPI summary of MD Arif Ansari")).toBe("MD Arif Ansari");
    expect(extractNovaPersonHint("kpi analysis of Arif")).toBe("Arif");
    expect(extractNovaPersonHint("Arif Ansari kpi analysis")).toBe("Arif Ansari");
    expect(extractNovaPersonHint("tata steel tasks")).toBeNull();
  });

  it("infers summary vs detail depth", () => {
    expect(inferNovaAnalysisDepth("KPI analysis of Arif")).toBe("summary");
    expect(inferNovaAnalysisDepth("KPI analysis of Arif in detail")).toBe("detail");
    expect(inferNovaAnalysisDepth("how each parameter affects Arif kpi")).toBe("detail");
  });
});

describe("digit guard + engine (LLM off)", () => {
  it("rejects invented digits", () => {
    const allowed = new Set(["62", "40"]);
    expect(novaAnalysisNarrativeDigitGuard("Score is 62 vs drag 40", allowed)).toBe(true);
    expect(novaAnalysisNarrativeDigitGuard("Score is 91 somehow", allowed)).toBe(false);
  });

  it("builds deterministic analysis from KPI report-card bridge", async () => {
    const card = buildKpiReportCard({
      totalScore: 55.64685314685315,
      methodology: "weight-normalised average",
      lines: [
        line({
          name: "Attendance",
          code: "ATT",
          weight: 40,
          target: 100,
          actual: 70,
          score: 40,
          weighted: 16,
        }),
        line({
          name: "Delivery",
          code: "DEL",
          weight: 30,
          target: 10,
          actual: 12,
          score: 90,
          weighted: 27,
        }),
      ],
    });
    const bundle = adaptKpiReportCardToBundle({
      card,
      subjectLabel: "MD Arif Ansari",
      subjectUserId: "u-arif",
      periodName: "Jun 2026",
      totalScore: 55.64685314685315,
      depth: "summary",
    });
    expect(bundle.subject.label).toBe("MD Arif Ansari");
    expect(bundle.subject.id).toBe("u-arif");
    expect(bundle.depth).toBe("summary");
    expect(bundle.periodLabel).toBe("Jun 2026");
    expect(bundle.factors.length).toBeGreaterThan(0);
    expect(bundle.factors.every((f) => f.evidence.toolId === "kpi_report_card")).toBe(true);

    const result = await runNovaAnalysis(bundle, { useLlm: false });
    expect(result.narrativeSource).toBe("deterministic");
    expect(result.deterministicNarrative).toMatch(/MD Arif Ansari/);
    expect(result.deterministicNarrative).toMatch(/\*\*Score \/ position:\*\*/);
    expect(result.deterministicNarrative).not.toMatch(/_kpi_summary:/);
    expect(result.deterministicNarrative).not.toMatch(/55\.646853/);
    expect(result.llmNarrative).toBeNull();
  });

  it("detail depth keeps parameter contribution framing", async () => {
    const card = buildKpiReportCard({
      totalScore: 40.6,
      methodology: "weight-normalised average",
      lines: [
        line({
          name: "Attendance",
          code: "ATT",
          weight: 40,
          target: 100,
          actual: 50,
          score: 50,
          weighted: 20,
        }),
      ],
    });
    const bundle = adaptKpiReportCardToBundle({
      card,
      subjectLabel: "Arif",
      subjectUserId: "u1",
      periodName: "Jun 2026",
      totalScore: 40.6,
      depth: "detail",
    });
    const result = await runNovaAnalysis(bundle, { useLlm: false });
    expect(result.deterministicNarrative).toMatch(
      /Detail — how each factor contributes|weight|contribution/i
    );
  });

  it("explains overdue vs on-time distinction when both present", async () => {
    const card = buildKpiReportCard({
      totalScore: 62,
      methodology: "weight-normalised average",
      lines: [
        line({
          name: "Overdue tasks",
          code: "OVERDUE_TASKS",
          weight: 20,
          target: 0,
          actual: 0,
          score: 100,
          weighted: 20,
        }),
        line({
          name: "On-time tasks",
          code: "ONTIME_TASKS",
          weight: 20,
          target: 100,
          actual: 40,
          score: 40,
          weighted: 8,
        }),
      ],
    });
    const bundle = adaptKpiReportCardToBundle({
      card,
      subjectLabel: "Arif",
      subjectUserId: "u1",
      periodName: "Jun 2026",
      totalScore: 62,
      depth: "summary",
    });
    const result = await runNovaAnalysis(bundle, { useLlm: false });
    expect(result.deterministicNarrative).toMatch(
      /overdue|on-time|on time|completion month|completedAt|period/i
    );
  });

  it("empty factors stay honest", async () => {
    const empty: NovaAnalysisBundle = {
      schemaVersion: 1,
      domain: "kpi",
      subject: { kind: "person", label: "You" },
      headline: "No factors",
      position: { value: null, stance: "neutral" },
      factors: [],
    };
    const result = await runNovaAnalysis(empty, { useLlm: true });
    expect(result.reasons).toEqual([]);
    expect(result.narrativeSource).toBe("deterministic");
    expect(buildNovaAnalysisReasons([])).toEqual([]);
  });
});

describe("P0 module adapters (tasks / AR / attendance / project)", () => {
  it("tasks summary caps overdue samples; detail adds completed", () => {
    const data = {
      openCount: 12,
      overdueCount: 4,
      dueSoonCount: 2,
      completedCount: 7,
      completedPeriod: "this month",
      overdueSamples: [
        { no: "T1", title: "One", overdue: true, due: "2026-06-01", status: "TODO" },
        { no: "T2", title: "Two", overdue: true, due: "2026-06-02", status: "TODO" },
        { no: "T3", title: "Three", overdue: true, due: "2026-06-03", status: "TODO" },
        { no: "T4", title: "Four", overdue: true, due: "2026-06-04", status: "TODO" },
        { no: "T5", title: "Five", overdue: true, due: "2026-06-05", status: "TODO" },
      ],
    };
    const summary = adaptTasksFactToAnalysisBundle(data, {
      subjectLabel: "Arif",
      subjectKind: "person",
      depth: "summary",
    });
    expect(summary?.depth).toBe("summary");
    expect(summary?.subject.kind).toBe("person");
    expect(summary?.factors.filter((f) => f.id.startsWith("task-")).length).toBe(3);
    expect(summary?.factors.some((f) => f.id === "tasks-completed")).toBe(false);

    const detail = adaptTasksFactToAnalysisBundle(data, {
      subjectLabel: "Arif",
      subjectKind: "person",
      depth: "detail",
    });
    expect(detail?.factors.some((f) => f.id === "tasks-completed")).toBe(true);
    expect(detail?.factors.filter((f) => f.id.startsWith("task-")).length).toBe(5);
  });

  it("AR adapter includes aging SoT factors and customer bind", () => {
    const bundle = adaptOutstandingFactsToAnalysisBundle({
      outstanding: {
        outstandingTotal: 100000,
        outstandingTotalInr: "₹1,00,000",
        rowCount: 3,
        top: [
          { customer: "Tata", outstanding: 50000, outstandingInr: "₹50,000", days: 45 },
          { customer: "JSW", outstanding: 30000, outstandingInr: "₹30,000", days: 10 },
          { customer: "X", outstanding: 20000, outstandingInr: "₹20,000", days: 5 },
          { customer: "Y", outstanding: 10000, outstandingInr: "₹10,000", days: 2 },
        ],
      },
      overdue: { count: 2 },
      aging: {
        total: 100000,
        buckets: { b0: 20000, b30: 30000, b60: 10000, b90: 40000 },
      },
      subjectLabel: "Receivables",
      depth: "summary",
    });
    expect(bundle?.domain).toBe("outstanding");
    expect(bundle?.subject.kind).toBe("org");
    expect(bundle?.factors.some((f) => f.id === "ar-aging-90-plus")).toBe(true);
    expect(bundle?.factors.filter((f) => f.id.startsWith("ar-") && f.id !== "ar-total" && f.id !== "ar-overdue-invoices" && !f.id.startsWith("ar-aging")).length).toBeLessThanOrEqual(3);

    const customer = adaptOutstandingFactsToAnalysisBundle({
      outstanding: {
        outstandingTotal: 50000,
        outstandingTotalInr: "₹50,000",
        rowCount: 1,
        top: [{ customer: "Tata", outstanding: 50000, outstandingInr: "₹50,000", days: 45 }],
      },
      subjectLabel: "Tata Steel",
      subjectId: "cust-1",
      depth: "detail",
    });
    expect(customer?.subject).toEqual({
      kind: "customer",
      id: "cust-1",
      label: "Tata Steel",
    });
  });

  it("attendance prefers fact subject over session user label", () => {
    const bundle = adaptAttendanceFactToAnalysisBundle(
      {
        period: "Jun 2026",
        latePeopleCount: 2,
        presentPunchDays: 40,
        absentDays: 1,
        subject: { name: "MD Arif Ansari", relation: "other" },
        subjectAttendance: { status: "LATE", lateMinutes: 25, punchInTime: "09:40" },
        topLateComers: [
          { name: "A", code: "S1", totalLateMinutes: 90, lateDays: 3 },
          { name: "B", code: "S2", totalLateMinutes: 40, lateDays: 1 },
          { name: "C", code: "S3", totalLateMinutes: 20, lateDays: 1 },
          { name: "D", code: "S4", totalLateMinutes: 10, lateDays: 1 },
        ],
        topAbsent: [{ name: "E", code: "S5", absentDays: 2 }],
      },
      { subjectLabel: "MD Arif Ansari", subjectKind: "person", depth: "summary" }
    );
    expect(bundle?.subject.label).toBe("MD Arif Ansari");
    expect(bundle?.subject.kind).toBe("person");
    expect(bundle?.periodLabel).toBe("Jun 2026");
    expect(bundle?.factors.some((f) => f.id === "att-subject-day")).toBe(true);
    expect(bundle?.factors.find((f) => f.id === "att-subject-day")?.evidence.summary).toMatch(
      /punchIn=09:40/
    );
    expect(bundle?.factors.filter((f) => f.id.startsWith("att-person-")).length).toBe(3);

    const withClocks = adaptAttendanceFactToAnalysisBundle(
      {
        period: "14 Jul 2026",
        periodGrain: "day",
        latePeopleCount: 1,
        presentPunchDays: 8,
        absentDays: 0,
        topLateComers: [
          {
            name: "MD Arif Ansari",
            code: "STF0007",
            totalLateMinutes: 7,
            lateDays: 1,
            punchInLabel: "10:06 am",
          },
        ],
      },
      { subjectLabel: "Attendance", subjectKind: "org", depth: "summary" }
    );
    const person = withClocks?.factors.find((f) => f.id.startsWith("att-person-"));
    expect(person?.reason).toMatch(/punch-in 10:06 am/);
    expect(person?.evidence.summary).toMatch(/punchIn=10:06 am/);
    expect(
      novaAnalysisNarrativeDigitGuard(
        "MD Arif Ansari punched in at 10:06 am (7 min late).",
        new Set(
          [...(person?.evidence.summary.matchAll(/\d+/g) ?? [])].map((m) => m[0]!)
        )
      )
    ).toBe(true);

    const detail = adaptAttendanceFactToAnalysisBundle(
      {
        latePeopleCount: 1,
        presentPunchDays: 10,
        absentDays: 2,
        topLateComers: [{ name: "A", code: "S1", totalLateMinutes: 90, lateDays: 3 }],
        topAbsent: [{ name: "E", code: "S5", absentDays: 2 }],
      },
      { subjectLabel: "Attendance (team)", subjectKind: "org", depth: "detail" }
    );
    expect(detail?.factors.some((f) => f.id.startsWith("att-absent-"))).toBe(true);
  });

  it("project adapter maps scopedFacts + command spine", async () => {
    const bundle = adaptProjectFactsToAnalysisBundle({
      projectLabel: "James School",
      projectId: "proj-1",
      projects: {
        scopedFacts: {
          taskOpen: 5,
          taskDone: 12,
          checklistOpen: 3,
          checklistDone: 8,
          deliveryCount: 2,
          valueVisible: true,
          projectValue: 1_000_000,
          projectValueInr: "₹10,00,000",
        },
      },
      commandSpine: {
        project: {
          id: "proj-1",
          projectId: "JAMES",
          projectName: "James School",
          status: "ACTIVE",
        },
        chapters: [
          { id: "tasks", label: "Open tasks", count: 5 },
          { id: "overdue", label: "Overdue invoices", count: 1 },
          { id: "deliveries", label: "Deliveries", count: 2 },
        ],
        links: [{ title: "Project", href: "/projects/proj-1" }],
      },
      depth: "detail",
    });
    expect(bundle?.domain).toBe("project");
    expect(bundle?.subject.id).toBe("proj-1");
    expect(bundle?.factors.some((f) => f.id === "project-scoped-tasks")).toBe(true);
    expect(bundle?.factors.some((f) => f.id === "project-cmd-overdue")).toBe(true);
    expect(bundle?.factors.some((f) => f.id === "project-value")).toBe(true);

    const result = await runNovaAnalysis(bundle!, { useLlm: false });
    expect(result.deterministicNarrative).toMatch(/Project analysis|James School/);
    expect(result.deterministicNarrative).toMatch(/Why \(drivers\)|Detail/);
  });
});
