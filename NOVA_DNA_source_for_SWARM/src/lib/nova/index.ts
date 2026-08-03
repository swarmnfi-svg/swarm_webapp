/**
 * Gradual `src/lib/nova` package entry.
 * Prefer `@/lib/nova/core` or `@/lib/nova/skills/registry` for new code;
 * existing `@/lib/ai/nova*` imports remain supported.
 */

export * from "@/lib/nova/core";
export {
  listNovaSkills,
  getNovaSkill,
  hasNovaSkill,
  listNovaSkillToolIds,
  dispatchNovaSkill,
  novaSkillPrefersDeterministic,
} from "@/lib/nova/skills/registry";
export type {
  NovaSkill,
  NovaSkillRiskLevel,
  NovaSkillDataClass,
  NovaSkillDomain,
  NovaSkillHandlerContext,
  NovaSkillHandlerResult,
} from "@/lib/nova/skills/skill-contract";
export {
  NOVA_INVARIANTS,
  NOVA_MONTH_ATTENTION_PRIMARY_MAX,
  NOVA_PACK_RESULT_SCHEMA_VERSION,
  NOVA_REPORT_ENVELOPE_SCHEMA_VERSION,
  NOVA_READONLY_DATABASE_URL_ENV,
} from "@/lib/nova/invariants";
export {
  buildNovaPackResult,
  selectNovaPackAttentions,
  assertNovaPackAttentions,
  emptyNovaPackAttentions,
  type NovaPackResult,
  type NovaPackWarning,
  type NovaPackAttentions,
} from "@/lib/nova/pack-result";
export {
  buildNovaReportSecurityEnvelope,
  assertNovaReportEnvelope,
  defaultNovaReportExpiresAt,
  type NovaReportSecurityEnvelope,
  type NovaReportSnapshotV1,
} from "@/lib/nova/report-envelope";
export {
  buildImmutableNovaReportSnapshot,
  planRegeneratedNovaReportId,
  checksumNovaPackSnapshot,
} from "@/lib/nova/reports/snapshot";
export {
  renderNovaReportPdf,
  renderNovaReportPdfStub,
  renderNovaReportCsv,
  renderNovaReportText,
} from "@/lib/nova/reports/render-artifacts";
export { novaReadonlyPrisma, prisma as novaSkillPrisma } from "@/lib/nova/prisma-readonly";
