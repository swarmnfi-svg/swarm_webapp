/**
 * Shared KPI trend report pack — period_trend series from KpiReview SoT + visible parameters.
 */
import {
  buildSkillReportPack,
  reportCell,
  type NovaReportMode,
  type SkillReportAttachment,
} from "@/lib/nova/reports/skill-report";
import type { NovaPackChartDataset, NovaPackTable } from "@/lib/nova/pack-result";
import type { NovaTrendBundle } from "@/lib/nova/trend/contract";
import type { TrendLoadFail, TrendLoadOk } from "@/lib/nova/trend/adapters/attendance-late";
import type { NovaToolFact, NovaToolLink } from "@/lib/nova/core/tool-types";

export type KpiTrendReportParams = {
  periodLabel: string;
  personLabel: string | null;
  scopeLabel: string;
  windowSource: string | null;
};

/** Human-readable filter lines frozen into narrative + PDF parameters table. */
export function formatKpiTrendReportParameters(p: KpiTrendReportParams): {
  summaryLines: string[];
  parametersTable: NovaPackTable;
} {
  const rows: [string, string][] = [
    ["Period", p.periodLabel],
    ["Person / staff", p.personLabel ?? "All in scope"],
    ["RBAC scope", p.scopeLabel],
  ];
  if (p.windowSource) {
    rows.push(["Window source", p.windowSource]);
  }
  return {
    summaryLines: [
      `Parameters: period=${p.periodLabel}; person=${p.personLabel ?? "all in scope"}; scope=${p.scopeLabel}.`,
    ],
    parametersTable: {
      id: "kpi_report_parameters",
      title: "Report parameters",
      columns: ["Parameter", "Value"],
      rows: rows.map(([k, v]) => [reportCell(k), reportCell(v)]),
    },
  };
}

export function kpiTrendSeriesChart(
  series: NovaTrendBundle["series"],
  title: string
): NovaPackChartDataset | null {
  if (!series.length) return null;
  return {
    bindingId: "period_trend",
    metricIds: ["kpi.average_score", "kpi_total_score"],
    title,
    points: series.slice(-8).map((p) => ({
      label: String(p.label ?? p.bucket).slice(0, 18),
      value: Number(p.value ?? 0),
      unit: "score",
    })),
  };
}

export function kpiTopScoresStripChart(
  ranked: Array<{ name?: string | null; score?: number | null }>,
  title = "Top scores (latest snapshot)"
): NovaPackChartDataset | null {
  if (!ranked.length) return null;
  return {
    bindingId: "kpi_strip",
    metricIds: ["kpi.average_score"],
    title,
    points: ranked.slice(0, 8).map((r) => ({
      label: String(r.name ?? "Staff").slice(0, 18),
      value: Number(r.score ?? 0),
      unit: "score",
    })),
  };
}

export type BuildKpiTrendReportPackInput = {
  toolName: string;
  title?: string;
  headline: string;
  params: KpiTrendReportParams;
  /** Latest-period snapshot metrics (review count / avg). */
  reviewCount: number;
  averageScore: number | null;
  /** Optional latest-period top scores strip. */
  rankedStrip?: Array<{ name?: string | null; score?: number | null }>;
  /** Trend load result (ACL already applied). */
  trend: TrendLoadOk | TrendLoadFail | null;
  factData: Record<string, unknown>;
  links?: NovaToolLink[];
  scoreSamples?: Array<{
    name?: string | null;
    staffCode?: string | null;
    score?: number | null;
    grade?: string | null;
    status?: string | null;
  }>;
  reportMode?: NovaReportMode | null;
};

/**
 * Build savable kpi_trend_report with period_trend + parameter labels.
 * Uses SoT series from loadKpiScoreTrend when available; never invents scores.
 */
export function buildKpiTrendReportPack(
  input: BuildKpiTrendReportPackInput
): { attachment: SkillReportAttachment } {
  const { summaryLines, parametersTable } = formatKpiTrendReportParameters(input.params);
  const charts: NovaPackChartDataset[] = [];

  const bundle =
    input.trend && "bundle" in input.trend && input.trend.bundle
      ? input.trend.bundle
      : null;
  const series = bundle?.series ?? [];
  const trendChart = kpiTrendSeriesChart(
    series,
    series.length
      ? `KPI score over periods (${input.params.periodLabel})`
      : "KPI score over periods"
  );
  if (trendChart) charts.push(trendChart);

  const strip = kpiTopScoresStripChart(input.rankedStrip ?? []);
  if (strip) charts.push(strip);

  const tables: NovaPackTable[] = [parametersTable];
  if (input.scoreSamples?.length) {
    tables.push({
      id: "kpi_scores",
      title: "KPI score samples",
      columns: ["Name", "Code", "Score", "Grade", "Status"],
      rows: input.scoreSamples.slice(0, 24).map((r) => [
        reportCell(r.name),
        reportCell(r.staffCode),
        reportCell(r.score),
        reportCell(r.grade),
        reportCell(r.status),
      ]),
    });
  } else if (bundle?.rankings?.length) {
    tables.push({
      id: "kpi_trend_rankings",
      title: "KPI trend rankings",
      columns: ["Rank", "Name", "Value", "Note"],
      rows: bundle.rankings.slice(0, 24).map((r) => [
        reportCell(r.rank),
        reportCell(r.label),
        reportCell(r.value),
        reportCell(r.secondary),
      ]),
    });
  }

  const periodLabel = input.params.periodLabel;
  const facts: NovaToolFact[] = [{ tool: input.toolName, ok: true, data: input.factData }];
  const links = input.links?.length
    ? input.links
    : [{ title: "KPI", href: "/kpi" }];

  const { attachment } = buildSkillReportPack({
    packId: "kpi_trend_report",
    reportMode: input.reportMode,
    title: input.title ?? "KPI trend report",
    headline: input.headline,
    period: {
      label: periodLabel,
      grain: "month",
      calendarKind: "rolling",
      source: input.params.windowSource?.startsWith("explicit")
        ? "explicit"
        : input.params.windowSource === "parsed"
          ? "explicit"
          : "default",
    },
    metrics: [
      {
        metricId: "kpi.review_count",
        version: "1",
        certification: "draft",
        value: input.reviewCount,
        display: `${input.reviewCount} reviews`,
        periodLabel,
      },
      {
        metricId: "kpi.average_score",
        version: "1",
        certification: "draft",
        value: input.averageScore,
        display:
          input.averageScore != null
            ? `avg ${input.averageScore}`
            : series.length
              ? `latest ${series[series.length - 1]!.value}`
              : "n/a",
        periodLabel,
      },
    ],
    charts,
    tables,
    facts,
    links,
    summaryLines,
    omittedNotes: [
      "Self/team/all KPI scope is preserved on report intent.",
      "Trend series from KpiReview.totalScore (Staff report-card SoT).",
    ],
    narrativeHints: summaryLines,
  });

  return { attachment };
}
