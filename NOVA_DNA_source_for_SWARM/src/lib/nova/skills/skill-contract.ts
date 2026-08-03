/**
 * NovaSkill contract — thin wrapper around existing tool IDs.
 * Phase 1: metadata + typed handler; no free LLM tool pick / SQL.
 */

import type { SessionUser } from "@/auth";
import type { DateRange } from "@/lib/ai/nova-dates";
import type { NovaToolFact, NovaToolLink } from "@/lib/nova/core/tool-types";

/** How risky a skill is for the product policy layer. */
export type NovaSkillRiskLevel = "read" | "draft_action" | "approval_action" | "write";

/** Coarse data classes for provider routing / redaction later. */
export type NovaSkillDataClass =
  | "public_meta"
  | "ops_summary"
  | "finance_money"
  | "hr_pii"
  | "hr_attendance"
  | "documents"
  | "system_admin";

export type NovaSkillDomain = "hr" | "finance" | "ops" | "system" | "meta";

export type NovaSkillHandlerContext = {
  user: SessionUser;
  query: string;
  tz: string;
  range: DateRange | null;
  entityHint: string | null;
  /** Resolved display/filter name after entity disambiguation. */
  entityFilterName?: string;
  resolvedEntityType: "customer" | "vendor" | "project" | null;
  resolvedEntityDbId: string | null;
  personHint: string | null;
  sampleLimit: number;
};

export type NovaSkillHandlerResult = {
  fact: NovaToolFact;
  links?: NovaToolLink[];
};

export type NovaSkillHandler = (
  ctx: NovaSkillHandlerContext
) => Promise<NovaSkillHandlerResult>;

/**
 * Registered skill — maps 1:1 to a legacy tool id initially.
 * Permissions are documented here; runtime RBAC still lives in the handler / filterNovaToolsForUser.
 */
export type NovaSkill = {
  id: string;
  /** Same as legacy nova-tools tool name. */
  toolId: string;
  domain: NovaSkillDomain;
  label: string;
  description: string;
  /** RBAC permission keys (any-of). Sourced from `NOVA_TOOL_PERMISSIONS` at registry build (NI-01). */
  permissions: string[];
  riskLevel: NovaSkillRiskLevel;
  dataClasses: NovaSkillDataClass[];
  /** Lexicon / user-facing intents this skill covers. */
  intents: string[];
  examples: string[];
  /** Prefer deterministic formatter over LLM for list/count answers. */
  preferDeterministic?: boolean;
  handler: NovaSkillHandler;
};
