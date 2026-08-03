/**
 * Ops skill — approvals_summary (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import {
  novaApprovalsEntityScopeWhere,
  novaOpenApprovalsWhere,
} from "@/lib/ai/nova-approvals";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const n = (v: unknown) => Number(v ?? 0);

export async function runApprovalsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, entityFilterName, resolvedEntityDbId, resolvedEntityType } = ctx;
  const name = "approvals_summary";
  const links: NovaToolLink[] = [];

  if (
    !can(user, "approval.read.self") &&
    !can(user, "approval.read.team") &&
    !can(user, "approval.read.all")
  ) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing approval.read" },
    };
  }

  const rbacWhere = novaOpenApprovalsWhere(user);
  if (!rbacWhere) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing approval.read" },
    };
  }

  const entityScope = await novaApprovalsEntityScopeWhere({
    resolvedEntityType,
    resolvedEntityDbId,
    entityFilterName,
  });

  const where = entityScope
    ? { AND: [rbacWhere, entityScope] }
    : rbacWhere;

  const [openCount, samples] = await Promise.all([
    prisma.approvalRequest.count({ where }),
    prisma.approvalRequest.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        requestNo: true,
        title: true,
        module: true,
        status: true,
        amount: true,
        currentApproverUser: { select: { name: true } },
      },
    }),
  ]);

  links.push({ title: "Approvals", href: "/approvals" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          openCount,
          entityFilter: entityFilterName ?? null,
          entityType: resolvedEntityType,
          entityScoped: Boolean(entityScope),
          samples: (samples ?? []).map((a) => ({
            no: a.requestNo,
            title: a.title,
            module: a.module,
            status: a.status,
            amountInr: a.amount != null ? inr(n(a.amount)) : null,
            approver: a.currentApproverUser?.name ?? null,
            href: `/approvals/${a.id}`,
          })),
        },
        { sources: ["approvals_queue"] }
      ),
    },
    links,
  };
}
