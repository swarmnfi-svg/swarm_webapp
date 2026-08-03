/**
 * Module analyzer contract — same pattern as KPI report-card → AnalysisBundle.
 * Loaders are RBAC-gated; builders stay pure (no Prisma / no LLM).
 */
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";
import type {
  NovaAnalysisBundle,
  NovaAnalysisDomain,
} from "@/lib/nova/analysis/factor-schema";

export type NovaAnalysisPriority = "P0" | "P1" | "P2" | "shipped";

export type NovaAnalysisLoadResult =
  | { ok: true; bundle: NovaAnalysisBundle }
  | { ok: false; denied: true; error: string }
  | { ok: false; empty: true; message: string };

export type NovaAnalysisModuleDef = {
  /** Matches NovaAnalysisDomain (or planned domain slug). */
  id: NovaAnalysisDomain | string;
  label: string;
  priority: NovaAnalysisPriority;
  /** Catalog skills the loader may call (documentation + RBAC floor hint). */
  sourceToolIds: readonly string[];
  /** Example user cues for lexicon / goldens. */
  cues: readonly string[];
  /** ACL note for operators. */
  rbacNote: string;
  /**
   * When set, module is live — skill may dispatch via registry.
   * Planned modules omit loader until adapter ships.
   */
  load?: (ctx: NovaSkillHandlerContext) => Promise<NovaAnalysisLoadResult>;
};

export function isNovaAnalysisModuleLive(
  def: NovaAnalysisModuleDef
): def is NovaAnalysisModuleDef & {
  load: (ctx: NovaSkillHandlerContext) => Promise<NovaAnalysisLoadResult>;
} {
  return typeof def.load === "function";
}
