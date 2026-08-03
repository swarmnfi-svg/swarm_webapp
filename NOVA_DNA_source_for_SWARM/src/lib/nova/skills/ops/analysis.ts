/**
 * Skill — nova_analysis
 * Resolve module from registry → RBAC loader → LLM Analysis engine.
 */
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import { runNovaAnalysis } from "@/lib/nova/analysis/engine";
import { inferNovaAnalysisDomain } from "@/lib/nova/analysis/domain";
import {
  isNovaAnalysisModuleLive,
  type NovaAnalysisModuleDef,
} from "@/lib/nova/analysis/module-contract";
import { resolveNovaAnalysisModuleForDomain } from "@/lib/nova/analysis/modules/registry";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const TOOL = "nova_analysis";

function analysisAudience(
  user: NovaSkillHandlerContext["user"]
): "director" | "staff" | "manager" {
  if (user.role === "DIRECTOR" || user.role === "SUPER_ADMIN" || user.role === "ADMIN") {
    return "director";
  }
  if (user.role === "STAFF") return "staff";
  return "manager";
}

function packResult(
  result: Awaited<ReturnType<typeof runNovaAnalysis>>,
  sources: string[],
  extraLinks?: NovaToolLink[]
): NovaSkillHandlerResult {
  return {
    fact: {
      tool: TOOL,
      ok: true,
      data: withFactProvenance(
        {
          domain: result.domain,
          headline: result.headline,
          subject: result.subject,
          position: result.position,
          reasons: result.reasons,
          methodology: result.methodology,
          deterministicNarrative: result.deterministicNarrative,
          llmNarrative: result.llmNarrative,
          // Never pack raw llmPayload into chat facts — digit-guard rejects invents;
          // dumping rankedDrivers JSON re-exposes them to format / LLM sanitizer.
          narrativeSource: result.narrativeSource,
          primaryNarrative:
            result.narrativeSource === "llm" && result.llmNarrative
              ? result.llmNarrative
              : result.deterministicNarrative,
          rateLimited: result.narrativeSource === "llm_rate_limited",
          findingsFormatted: result.findingsFormatted,
          factorCount: result.reasons.length,
          schemaVersion: result.schemaVersion,
          note:
            result.narrativeSource === "llm_rate_limited"
              ? "LLM narration skipped (rate limited) — showing polished catalog summary."
              : null,
        },
        { sources }
      ),
    },
    links: [...(extraLinks ?? []), ...result.links],
  };
}

async function runModule(
  mod: NovaAnalysisModuleDef,
  ctx: NovaSkillHandlerContext,
  audience: "director" | "staff" | "manager"
): Promise<NovaSkillHandlerResult> {
  if (!isNovaAnalysisModuleLive(mod)) {
    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: withFactProvenance(
          {
            domain: mod.id,
            empty: true,
            planned: true,
            priority: mod.priority,
            message: `${mod.label} analysis is planned (${mod.priority}) — not wired yet. Try KPI / overdue / outstanding / attendance / project.`,
          },
          { sources: ["nova_analysis"] }
        ),
      },
      links: [{ title: "KPI", href: "/kpi" }],
    };
  }

  const loaded = await mod.load(ctx);
  if (!loaded.ok) {
    if ("denied" in loaded && loaded.denied) {
      return {
        fact: { tool: TOOL, ok: false, denied: true, error: loaded.error },
      };
    }
    return {
      fact: {
        tool: TOOL,
        ok: true,
        data: withFactProvenance(
          {
            domain: mod.id,
            empty: true,
            message: "message" in loaded ? loaded.message : "Nothing to analyse.",
          },
          { sources: ["nova_analysis", ...mod.sourceToolIds] }
        ),
      },
      links: resultLinksForModule(mod),
    };
  }

  const result = await runNovaAnalysis(loaded.bundle, { audience });
  return packResult(result, ["nova_analysis", ...mod.sourceToolIds], result.links);
}

function resultLinksForModule(mod: NovaAnalysisModuleDef): NovaToolLink[] {
  switch (mod.id) {
    case "kpi":
      return [{ title: "KPI", href: "/kpi" }];
    case "tasks":
      return [{ title: "Tasks", href: "/tasks" }];
    case "outstanding":
      return [{ title: "Receivables", href: "/accounts/receivables" }];
    case "attendance":
      return [{ title: "Attendance", href: "/attendance-hr" }];
    case "project":
      return [{ title: "Projects", href: "/projects" }];
    default:
      return [{ title: "KPI", href: "/kpi" }];
  }
}

export async function runNovaAnalysisSkill(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const audience = analysisAudience(ctx.user);
  const { domain } = inferNovaAnalysisDomain(ctx.query);
  const mod = resolveNovaAnalysisModuleForDomain(domain);

  try {
    if (!mod) {
      return {
        fact: {
          tool: TOOL,
          ok: true,
          data: withFactProvenance(
            {
              empty: true,
              message:
                "Say e.g. “why is my kpi low”, “why overdue”, “why outstanding”, “attendance analysis”, or “analyze this project”.",
            },
            { sources: ["nova_analysis"] }
          ),
        },
        links: [{ title: "KPI", href: "/kpi" }],
      };
    }
    return await runModule(mod, ctx, audience);
  } catch (err) {
    return {
      fact: {
        tool: TOOL,
        ok: false,
        error: err instanceof Error ? err.message : "Analysis failed",
      },
    };
  }
}
