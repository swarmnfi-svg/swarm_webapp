/**
 * Skill — novanalyser (NovANALYSER cross-module analytics orchestrator).
 */
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import {
  classifyNovAnalyserIntent,
  isNovAnalyserEnabled,
} from "@/lib/novanalyser/intent";
import { runNovAnalyserWithLinks } from "@/lib/novanalyser/orchestrator";

const TOOL = "novanalyser";

export async function runNovAnalyserSkill(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  if (!isNovAnalyserEnabled()) {
    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: withFactProvenance(
          {
            disabled: true,
            message:
              "NovANALYSER is not enabled. Set NOVA_NOVANALYSER_ENABLED=1 for local testing.",
          },
          { sources: [TOOL] }
        ),
      },
      links: [{ title: "AI assistant", href: "/ai-assistant" }],
    };
  }

  const { intent, confidence } = classifyNovAnalyserIntent(ctx.query);
  if (intent === "unknown" || confidence === "low") {
    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: withFactProvenance(
          {
            empty: true,
            message:
              'Try “how can I improve the business?” or “can I increase my productivity?” — broad cross-module analysis.',
          },
          { sources: [TOOL] }
        ),
      },
      links: [
        { title: "KPI", href: "/kpi" },
        { title: "Tasks", href: "/tasks" },
      ],
    };
  }

  if (
    intent === "productivity_team" ||
    intent === "delivery_risk" ||
    intent === "cash_flow" ||
    intent === "kpi_trends"
  ) {
    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: withFactProvenance(
          {
            empty: true,
            planned: true,
            intent,
            message: `${intent.replace(/_/g, " ")} template is planned for P1 — try business health or my productivity.`,
          },
          { sources: [TOOL] }
        ),
      },
      links: [{ title: "AI assistant", href: "/ai-assistant" }],
    };
  }

  try {
    const { result, links } = await runNovAnalyserWithLinks(ctx);
    const issuePayload = result.issues.slice(0, 8).map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      score: i.score,
      observation: i.observation,
      confidence: i.confidence,
      correlationRuleId: i.correlationRuleId ?? null,
      evidence: i.evidence,
      recommendations: i.recommendations,
    }));

    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: withFactProvenance(
          {
            planId: result.planId,
            intent: result.intent,
            profile: result.profile,
            headline: result.headline,
            primaryNarrative: result.deterministicNarrative,
            deterministicNarrative: result.deterministicNarrative,
            narrativeSource: "deterministic",
            issueCount: result.issues.length,
            issues: issuePayload,
            findingsFormatted: result.findingsFormatted || null,
            skippedModules: result.skippedModules,
            completeness: result.completeness,
            metricCount: result.metrics.length,
            saveReportStub: result.saveReportStub ?? null,
            empty: result.issues.length === 0,
            note:
              result.completeness === "partial"
                ? "Partial result — some modules were skipped (RBAC) or lookups failed."
                : "Read-only cross-module analysis — numbers trace to certified NOVA skills.",
          },
          {
            sources: [
              TOOL,
              ...new Set(result.issues.flatMap((i) => i.contributors.map((c) => c.toolId))),
            ],
          }
        ),
      },
      links,
    };
  } catch (err) {
    return {
      fact: {
        tool: TOOL,
        ok: false,
        error: err instanceof Error ? err.message : "NovANALYSER failed",
      },
    };
  }
}
