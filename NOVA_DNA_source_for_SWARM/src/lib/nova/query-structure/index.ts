/**
 * Shared query-structure — role words + entity/module parse + gates + depth.
 * See NOVA_QUERY_INTELLIGENCE_UPGRADE_PLAN.md
 *
 * Engines must import from here instead of inventing trailing-project regexes.
 */

export {
  NOVA_ENTITY_ROLE_WORDS,
  NOVA_MODULE_ROLE_WORDS,
  NOVA_HINGLISH_LINKER,
} from "@/lib/nova/query-structure/role-words";

export {
  parseNovaEntityRoleSpan,
  parseEntityModuleAsk,
  preferTypesForKindHint,
  acceptsPartyEntitySpan,
  isNovaTemporalOrModuleEntityNoise,
  type NovaEntityKindHint,
  type NovaModuleHint,
  type NovaEntityModuleParse,
} from "@/lib/nova/query-structure/parse-entity-module";

export { normalizeNovaEntityLookupHint } from "@/lib/nova/query-structure/normalize-hint";

export {
  pickNovaQueryDepth,
  type NovaQueryDepth,
} from "@/lib/nova/query-structure/depth";

export { isNonAttendanceLateContext } from "@/lib/nova/query-structure/late-context";

export {
  isNovaTaskCompletionRankingAsk,
  isNovaRankingWhEntityNoise,
  isNovaPlaceFramedTaskAsk,
  isNovaPersonalTaskAskShape,
  isNovaLeadingPersonFocusTaskAsk,
  isNovaPersonTaskFallbackAsk,
  scrubPersonalTaskEntityTail,
} from "@/lib/nova/query-structure/personal-task";

export {
  normalizePartyHint,
  projectCodeBelongsToCustomer,
  projectBelongsToCustomer,
  collapseRelatedCustomerChildProjects,
  pickExactNamedProject,
  type HierarchyPartyCand,
} from "@/lib/nova/query-structure/party-hierarchy";

export {
  shouldClarifyMixedEntityTypes,
  mixedEntityClarifyMessage,
  type NovaConflictPartyType,
} from "@/lib/nova/query-structure/conflict";

export {
  NOVA_SCOPED_PARTY_TOOLS,
  toolsImplyPartyScope,
  refuseSilentOrgWide,
  stickyModuleFollowUpNeedsBind,
  isNovaModuleOnlyFollowUp,
} from "@/lib/nova/query-structure/gates";

export {
  structureToSlotPatch,
  type NovaStructureSlotPatch,
} from "@/lib/nova/query-structure/to-slots";

export {
  emptyQiMetricCounters,
  classifyQiAskOutcome,
  bumpQiMetric,
  qiMissRate,
  qiWrongScopeRate,
  recordQiCrumb,
  getQiCrumbs,
  resetQiCrumbs,
  qiCountersFromCrumbs,
  type QiOutcomeClass,
  type QiMetricCounters,
  type QiCrumb,
} from "@/lib/nova/query-structure/qi-metrics";
