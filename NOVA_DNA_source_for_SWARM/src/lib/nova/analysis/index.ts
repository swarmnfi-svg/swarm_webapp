/**
 * NOVA Analysis — public barrel.
 */
export {
  NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION,
  isNovaAnalysisBundle,
  type NovaAnalysisBundle,
  type NovaAnalysisDomain,
  type NovaAnalysisFactor,
  type NovaAnalysisReason,
  type NovaAnalysisResult,
} from "@/lib/nova/analysis/factor-schema";
export {
  runNovaAnalysis,
  buildNovaAnalysisReasons,
  rankNovaAnalysisFactors,
  type RunNovaAnalysisOpts,
  type NovaAnalysisEngineResult,
} from "@/lib/nova/analysis/engine";
export { isNovaAnalysisCue, inferNovaAnalysisDomain } from "@/lib/nova/analysis/domain";
export {
  inferNovaAnalysisDepth,
  inferKpiAnalysisDepth,
  novaAnalysisReasonLimit,
  type NovaAnalysisDepth,
} from "@/lib/nova/analysis/depth";
export { formatNovaAnalysisDeterministic, formatAnalysisNumber } from "@/lib/nova/analysis/format";
export {
  novaAnalysisNarrativeDigitGuard,
  maybeNarrateNovaAnalysis,
} from "@/lib/nova/analysis/narrate";
export { adaptKpiReportCardToBundle } from "@/lib/nova/analysis/adapters";
export {
  listNovaAnalysisModules,
  listShippedNovaAnalysisModules,
  getNovaAnalysisModule,
  resolveNovaAnalysisModuleForDomain,
  NOVA_ANALYSIS_MODULES,
} from "@/lib/nova/analysis/modules/registry";
export type {
  NovaAnalysisModuleDef,
  NovaAnalysisLoadResult,
  NovaAnalysisPriority,
} from "@/lib/nova/analysis/module-contract";
