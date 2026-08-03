/**
 * Trend party×domain soft scope — only domains with ERP SoT filters.
 */

import type { Prisma } from "@prisma/client";
import type { NovaTrendDomain, NovaTrendEntity } from "@/lib/nova/trend/contract";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";

/** Scope support: hard = required filter; soft = when bind present; none = N/A. */
export type NovaTrendPartySupport = "hard" | "soft" | "none" | "planned";

export type NovaTrendPartyKind = "person" | "project" | "customer" | "vendor";

/**
 * Coverage matrix — shipped Trend domains only.
 */
export const NOVA_TREND_PARTY_MATRIX: Record<
  NovaTrendDomain,
  Record<NovaTrendPartyKind, NovaTrendPartySupport>
> = {
  task_late_completion: {
    person: "hard",
    project: "soft",
    customer: "soft",
    vendor: "none",
  },
  attendance_late: {
    person: "hard",
    project: "none",
    customer: "none",
    vendor: "none",
  },
  ar_aging: {
    person: "none",
    project: "none",
    customer: "soft",
    vendor: "none",
  },
  staff_expense_spend: {
    person: "none",
    project: "none",
    customer: "none",
    vendor: "none",
  },
  kpi_score: {
    person: "hard",
    project: "none",
    customer: "none",
    vendor: "none",
  },
  generic: {
    person: "none",
    project: "none",
    customer: "none",
    vendor: "none",
  },
};

export function trendPartySupport(
  domain: NovaTrendDomain,
  party: NovaTrendPartyKind
): NovaTrendPartySupport {
  return NOVA_TREND_PARTY_MATRIX[domain][party];
}

export type TrendTaskPartyScope = {
  where: Prisma.TaskWhereInput | null;
  entity: Pick<NovaTrendEntity, "kind" | "id" | "label"> | null;
};

/**
 * Soft project/customer filter for task_late_completion when resolve bound.
 * Vendor → none (tasks are not vendor-scoped in SoT).
 */
export function trendTaskPartyScopeFromCtx(
  ctx: Pick<
    NovaSkillHandlerContext,
    "resolvedEntityDbId" | "resolvedEntityType" | "entityFilterName"
  >
): TrendTaskPartyScope {
  const id = ctx.resolvedEntityDbId;
  const type = ctx.resolvedEntityType;
  if (!id || !type) return { where: null, entity: null };

  if (type === "project") {
    return {
      where: { projectId: id },
      entity: {
        kind: "project",
        id,
        label: ctx.entityFilterName?.trim() || "Project",
      },
    };
  }

  if (type === "customer") {
    return {
      where: { project: { customerId: id } },
      entity: {
        kind: "party",
        id,
        label: ctx.entityFilterName?.trim() || "Customer",
      },
    };
  }

  // vendor — no task SoT scope
  return { where: null, entity: null };
}
