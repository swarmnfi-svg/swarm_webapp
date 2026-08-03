/**
 * NOVA core — gradual home for orchestrator pieces.
 * Phase 1: re-export existing `src/lib/ai/nova*.ts` so callers can migrate imports
 * without a big-bang move. Runtime behaviour stays in `src/lib/ai`.
 */

export type { NovaToolFact, NovaToolLink, NovaToolPack } from "@/lib/nova/core/tool-types";
export { answerNovaQuery, type NovaAnswer, type NovaLink } from "@/lib/ai/nova";
export type { NovaChatTurn } from "@/lib/ai/nova-context";
export {
  buildNovaPlan,
  finalizeNovaPlan,
  shouldClarifyNovaPlan,
  type NovaPlan,
} from "@/lib/ai/nova-plan";
export { inferNovaQuery } from "@/lib/ai/nova-inference";
export {
  runNovaTools,
  selectNovaTools,
  factsHaveUsableData,
} from "@/lib/ai/nova-tools";
export {
  formatFactsDeterministic,
  llmPreservesLateStaffNames,
  llmPreservesLatePunchTimes,
  llmPreservesAttendancePresence,
} from "@/lib/ai/nova-format";
export {
  packPrefersDeterministicCounts,
  llmPreservesPrimaryMoney,
} from "@/lib/ai/nova-money";

export type { NovaProvenance } from "@/lib/nova/skills/provenance";
export { provenanceFromFacts, withFactProvenance } from "@/lib/nova/skills/provenance";
