/**
 * Skill — nova_trend
 * Windowed frequency / ranking trends (attendance late, task late-completion, …).
 * KPI score domain + report intent → savable kpi_trend_report pack with period_trend chart.
 */
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import { runNovaTrend } from "@/lib/nova/trend/engine";
import {
  resolveSkillReportIntent,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";
import { buildKpiTrendReportPack } from "@/lib/nova/skills/ops/kpi-trend-report";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";

const TOOL = "nova_trend";

export async function runNovaTrendSkill(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  try {
    const outcome = await runNovaTrend(ctx);
    if (outcome.kind === "denied") {
      return {
        fact: { tool: TOOL, ok: false, denied: true, error: outcome.error },
      };
    }
    const r = outcome.result;
    let data: Record<string, unknown> = withFactProvenance(
      {
        domain: r.domain,
        entity: r.entity,
        metric: r.metric,
        window: {
          label: r.window.label,
          source: r.window.source,
          from: r.window.from.toISOString(),
          to: r.window.to.toISOString(),
        },
        grain: r.grain,
        series: r.series,
        rankings: r.rankings,
        summary: r.summary,
        findingsFormatted: r.findingsFormatted,
        primaryNarrative: r.primaryNarrative,
        methodology: r.methodology,
        empty: r.empty ?? false,
        message: r.message ?? null,
        schemaVersion: r.schemaVersion,
      },
      {
        period: r.window.label,
        sources: ["nova_trend", r.domain],
      }
    );

    const { reportMode, reportIntent } = resolveSkillReportIntent(ctx.query, ctx.sampleLimit);
    if (
      r.domain === "kpi_score" &&
      reportIntent
    ) {
      const avg =
        r.series.length > 0
          ? Math.round(
              (r.series.reduce((a, p) => a + Number(p.value ?? 0), 0) /
                r.series.length) *
                10
            ) / 10
          : null;
      const personLabel =
        r.entity.kind === "person" ? r.entity.label : null;
      const scopeLabel =
        r.entity.kind === "person"
          ? `person (${r.entity.label})`
          : r.entity.label;
      const { attachment } = buildKpiTrendReportPack({
        reportMode,
        toolName: TOOL,
        title: "KPI trend report",
        headline:
          r.primaryNarrative ||
          `${r.window.label} · ${r.metric.label} · ${scopeLabel}`,
        params: {
          periodLabel: r.window.label,
          personLabel,
          scopeLabel,
          windowSource: r.window.source,
        },
        reviewCount: r.series.length,
        averageScore: avg,
        rankedStrip: r.rankings.slice(0, 8).map((row) => ({
          name: row.label,
          score: row.value,
        })),
        trend: { ok: true, bundle: r },
        factData: data,
        links: r.links ?? [{ title: "KPI", href: "/kpi" }],
      });
      data = withSkillReportAttachment(data, attachment);
    }

    return {
      fact: {
        tool: TOOL,
        ok: true,
        data,
      },
      links: r.links ?? [],
    };
  } catch (err) {
    return {
      fact: {
        tool: TOOL,
        ok: false,
        error: err instanceof Error ? err.message : "Trend failed",
      },
    };
  }
}
