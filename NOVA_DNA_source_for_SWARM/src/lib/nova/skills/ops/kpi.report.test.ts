/**
 * KPI trend report pack — chart series, parameter labels, report intent routing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { parseNovaDateRange } from "@/lib/ai/nova-dates";
import { isNovaTrendCue, inferNovaTrendDomain } from "@/lib/nova/trend/domain";
import { wantsNovaReportArtifact } from "@/lib/nova/reports/skill-report";
import {
  buildKpiTrendReportPack,
  formatKpiTrendReportParameters,
  kpiTrendSeriesChart,
} from "@/lib/nova/skills/ops/kpi-trend-report";
import { NOVA_TREND_SCHEMA_VERSION } from "@/lib/nova/trend/contract";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    kpiPeriod: { findFirst: vi.fn() },
    kpiReview: { findMany: vi.fn() },
    staffProfile: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/kpi/team-scope", () => ({
  kpiTeamUserIdsForUser: vi.fn(async () => null),
}));

vi.mock("@/lib/nova/trend/adapters/kpi-score", async () => {
  const actual = await vi.importActual<typeof import("@/lib/nova/trend/adapters/kpi-score")>(
    "@/lib/nova/trend/adapters/kpi-score"
  );
  return {
    ...actual,
    loadKpiScoreTrend: vi.fn(),
  };
});

import { prisma } from "@/lib/nova/prisma-readonly";
import { loadKpiScoreTrend } from "@/lib/nova/trend/adapters/kpi-score";
import { runKpiSummary, wantsAllStaffKpiList } from "@/lib/nova/skills/ops/kpi";
import { extractNovaPersonHint } from "@/lib/ai/nova-lexicon";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";

function director(): SessionUser {
  return {
    id: "u1",
    role: "DIRECTOR",
    email: "d@test.com",
    name: "Director",
    grantedPermissions: [
      "ai.assistant.read",
      "kpi.read.all",
      "kpi.read.team",
      "kpi.read.self",
    ],
  } as SessionUser;
}

function staffSelfOnly(): SessionUser {
  return {
    id: "u-self",
    role: "STAFF",
    email: "s@test.com",
    name: "Self Staff",
    grantedPermissions: ["ai.assistant.read", "kpi.read.self"],
  } as SessionUser;
}

describe("KPI trend report parameters + chart series", () => {
  it("formats visible parameter labels for PDF/pack", () => {
    const { summaryLines, parametersTable } = formatKpiTrendReportParameters({
      periodLabel: "Q3 2026 (Jul–Sep)",
      personLabel: "Amit",
      scopeLabel: "person (Amit)",
      windowSource: "parsed",
    });
    expect(summaryLines[0]).toMatch(/period=Q3 2026/);
    expect(summaryLines[0]).toMatch(/person=Amit/);
    expect(parametersTable.rows).toEqual([
      ["Period", "Q3 2026 (Jul–Sep)"],
      ["Person / staff", "Amit"],
      ["RBAC scope", "person (Amit)"],
      ["Window source", "parsed"],
    ]);
  });

  it("maps SoT series to period_trend binding", () => {
    const chart = kpiTrendSeriesChart(
      [
        { bucket: "2026-04", value: 72, label: "Apr 2026" },
        { bucket: "2026-05", value: 78, label: "May 2026" },
        { bucket: "2026-06", value: 81, label: "Jun 2026" },
      ],
      "KPI score over periods"
    );
    expect(chart?.bindingId).toBe("period_trend");
    expect(chart?.points).toHaveLength(3);
    expect(chart?.points.map((p) => p.value)).toEqual([72, 78, 81]);
  });

  it("builds pack with parameters table + period_trend", () => {
    const { attachment } = buildKpiTrendReportPack({
      toolName: "kpi_summary",
      headline: "test",
      params: {
        periodLabel: "last 6 months",
        personLabel: null,
        scopeLabel: "all",
        windowSource: "default_30d",
      },
      reviewCount: 2,
      averageScore: 80,
      rankedStrip: [{ name: "A", score: 90 }],
      trend: {
        ok: true,
        bundle: {
          schemaVersion: NOVA_TREND_SCHEMA_VERSION,
          domain: "kpi_score",
          entity: { kind: "org", label: "Organisation" },
          metric: { id: "kpi_total_score", label: "KPI score", unit: "score" },
          window: {
            from: new Date("2026-01-01"),
            to: new Date("2026-06-30"),
            label: "last 6 months",
            source: "default_30d",
          },
          grain: "month",
          series: [
            { bucket: "2026-04", value: 70, label: "Apr" },
            { bucket: "2026-05", value: 75, label: "May" },
          ],
          rankings: [],
        },
      },
      factData: { scope: "all" },
    });
    expect(attachment.pack.packId).toBe("kpi_trend_report");
    expect(attachment.pack.charts.some((c) => c.bindingId === "period_trend")).toBe(true);
    expect(attachment.pack.charts.some((c) => c.bindingId === "kpi_strip")).toBe(true);
    expect(attachment.pack.tables?.some((t) => t.id === "kpi_report_parameters")).toBe(true);
    expect(attachment.narrative).toMatch(/Parameters:/);
  });
});

describe("KPI report intent routing", () => {
  it("routes bare kpi report to kpi_summary (trend pack path)", () => {
    expect(selectNovaTools(normalizeNovaQuery("kpi report"))).toContain("kpi_summary");
    expect(selectNovaTools(normalizeNovaQuery("kpi report"))).not.toContain("kpi_report");
  });

  it("keeps report-card phrases on kpi_report", () => {
    expect(selectNovaTools(normalizeNovaQuery("kpi report card"))).toContain("kpi_report");
    expect(selectNovaTools(normalizeNovaQuery("kpi breakdown"))).toContain("kpi_report");
  });

  it("routes kpi trend / changes to nova_trend", () => {
    expect(isNovaTrendCue("kpi trend report")).toBe(true);
    expect(isNovaTrendCue("KPI changes this quarter")).toBe(true);
    expect(inferNovaTrendDomain("KPI changes this quarter").domain).toBe("kpi_score");
    expect(selectNovaTools(normalizeNovaQuery("kpi trend report"))).toEqual(["nova_trend"]);
    expect(selectNovaTools(normalizeNovaQuery("KPI changes this quarter"))).toEqual([
      "nova_trend",
    ]);
  });

  it("detects report artifact intent on kpi report phrases", () => {
    expect(wantsNovaReportArtifact("kpi report")).toBe(true);
    expect(wantsNovaReportArtifact("kpi trend report")).toBe(true);
  });
});

describe("calendar quarter period bind", () => {
  it("parses this quarter / last quarter", () => {
    const now = new Date("2026-07-15T12:00:00+05:30");
    const thisQ = parseNovaDateRange("KPI changes this quarter", now, "Asia/Kolkata");
    expect(thisQ?.label).toMatch(/Q3 2026/);
    const lastQ = parseNovaDateRange("last quarter", now, "Asia/Kolkata");
    expect(lastQ?.label).toMatch(/Q2 2026/);
  });
});

describe("KPI staff name parsing + all-staff intent", () => {
  it("does not treat Individual as a staff name", () => {
    expect(extractNovaPersonHint("Individual kpi")).toBeNull();
    expect(extractNovaPersonHint("individual staff kpi")).toBeNull();
    expect(extractNovaPersonHint("each staff kpi")).toBeNull();
  });

  it("still extracts named staff for KPI asks", () => {
    expect(extractNovaPersonHint("KPI for Arun")).toBe("Arun");
    expect(extractNovaPersonHint("kpi summary of Madhu M")).toBe("Madhu");
  });

  it("detects all-staff KPI list intent", () => {
    expect(wantsAllStaffKpiList("staff kpi")).toBe(true);
    expect(wantsAllStaffKpiList("all staff kpi")).toBe(true);
    expect(wantsAllStaffKpiList("Individual kpi")).toBe(true);
    expect(wantsAllStaffKpiList("kpi list")).toBe(true);
    expect(wantsAllStaffKpiList("my kpi")).toBe(false);
    expect(wantsAllStaffKpiList("KPI for Arun")).toBe(false);
  });

  it("normalizes staff kpi to all staff kpi (preserves list intent)", () => {
    expect(normalizeNovaQuery("staff kpi")).toMatch(/all staff kpi/i);
    expect(normalizeNovaQuery("Individual kpi")).toMatch(/all staff kpi/i);
    expect(normalizeNovaQuery("kpi list")).toMatch(/all staff kpi/i);
  });
});

describe("runKpiSummary all-staff listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.kpiPeriod.findFirst).mockResolvedValue({
      id: "p1",
      name: "Jul 2026",
      status: "APPROVED",
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-07-31"),
    } as never);
    vi.mocked(prisma.kpiReview.findMany).mockResolvedValue([
      {
        userId: "u1",
        totalScore: 88,
        grade: "A",
        status: "APPROVED",
        user: { name: "Alice" },
        staff: { fullName: "Alice", staffCode: "A1" },
      },
      {
        userId: "u2",
        totalScore: 72,
        grade: "B",
        status: "APPROVED",
        user: { name: "Bob" },
        staff: { fullName: "Bob", staffCode: "B1" },
      },
      {
        userId: "u3",
        totalScore: 65,
        grade: "C",
        status: "APPROVED",
        user: { name: "Carol" },
        staff: { fullName: "Carol", staffCode: "C1" },
      },
    ] as never);
  });

  it("lists all staff without myScore on org-wide ask", async () => {
    const res = await runKpiSummary({
      user: director(),
      query: "staff kpi",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    const data = res.fact.data as {
      scope?: string;
      listMode?: string;
      myScore?: number | null;
      staffScores?: { name?: string }[];
      top?: { name?: string }[];
    };
    expect(data.scope).toBe("all_staff");
    expect(data.listMode).toBe("all_staff");
    expect(data.myScore).toBeNull();
    expect(data.staffScores).toHaveLength(3);
    expect(data.top).toHaveLength(3);
    expect(prisma.kpiReview.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200 })
    );
  });

  it("sets myScore only on explicit self ask", async () => {
    vi.mocked(prisma.kpiReview.findMany).mockResolvedValue([
      {
        userId: "u-self",
        totalScore: 55,
        grade: "C",
        status: "APPROVED",
        user: { name: "Self Staff" },
        staff: { fullName: "Self Staff", staffCode: "S1" },
      },
    ] as never);
    const res = await runKpiSummary({
      user: staffSelfOnly(),
      query: "my kpi",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    const data = res.fact.data as { myScore?: number | null; scope?: string };
    expect(data.scope).toBe("self");
    expect(data.myScore).toBe(55);
  });
});

describe("runKpiSummary report pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.kpiPeriod.findFirst).mockResolvedValue({
      id: "p1",
      name: "Jul 2026",
      status: "APPROVED",
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-07-31"),
    } as never);
    vi.mocked(prisma.kpiReview.findMany).mockResolvedValue([
      {
        totalScore: 88,
        grade: "A",
        status: "APPROVED",
        user: { name: "Director" },
        staff: { fullName: "Director", staffCode: "D1" },
      },
    ] as never);
    vi.mocked(loadKpiScoreTrend).mockResolvedValue({
      ok: true,
      bundle: {
        schemaVersion: NOVA_TREND_SCHEMA_VERSION,
        domain: "kpi_score",
        entity: { kind: "org", label: "Organisation" },
        metric: { id: "kpi_total_score", label: "KPI score", unit: "score" },
        window: {
          from: new Date("2026-01-01"),
          to: new Date("2026-07-19"),
          label: "last 180 days",
          source: "parsed",
        },
        grain: "month",
        series: [
          { bucket: "2026-05", value: 80, label: "May 2026" },
          { bucket: "2026-06", value: 84, label: "Jun 2026" },
          { bucket: "2026-07", value: 88, label: "Jul 2026" },
        ],
        rankings: [],
      },
    });
  });

  it("chat-only without report intent", async () => {
    const res = await runKpiSummary({
      user: director(),
      query: "my kpi",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    expect((res.fact.data as { pack?: unknown })?.pack).toBeUndefined();
  });

  it("attaches period_trend pack on kpi report", async () => {
    const res = await runKpiSummary({
      user: director(),
      query: "kpi report",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    const data = res.fact.data as {
      reportIntent?: boolean;
      pack?: {
        packId?: string;
        charts?: { bindingId: string; points: unknown[] }[];
        tables?: { id: string }[];
        narrativeHints?: string[];
        facts?: { data?: Record<string, unknown> }[];
      };
      scope?: string;
    };
    expect(data.reportIntent).toBe(true);
    expect(data.pack?.packId).toBe("kpi_trend_report");
    expect(data.pack?.charts?.some((c) => c.bindingId === "period_trend")).toBe(true);
    expect(data.pack?.tables?.some((t) => t.id === "kpi_report_parameters")).toBe(true);
    expect(data.scope).toBe("all");
    // fact.data.pack must not re-enter pack.facts (circular JSON on Save report)
    expect(data.pack?.facts?.[0]?.data?.pack).toBeUndefined();
    expect(() => JSON.stringify(data.pack)).not.toThrow();
    expect(() => structuredClone(data.pack)).not.toThrow();
  });

  it("preserves self scope on report intent", async () => {
    const { kpiTeamUserIdsForUser } = await import("@/lib/kpi/team-scope");
    vi.mocked(kpiTeamUserIdsForUser).mockResolvedValue(["u-self"]);
    const res = await runKpiSummary({
      user: staffSelfOnly(),
      query: "kpi report with charts",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    const data = res.fact.data as { scope?: string; pack?: { omittedNotes?: string[] } };
    expect(data.scope).toBe("self");
    expect(data.pack?.omittedNotes?.some((n) => /Self\/team\/all/i.test(n))).toBe(true);
  });
});
