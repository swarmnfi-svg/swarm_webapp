/**
 * Finance skill — purchase_requests_summary (extracted from nova-tools; behaviour identical).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const n = (v: unknown) => Number(v ?? 0);

/** PR estimates: org-finance aggregates only (no role≠STAFF bypass). */
function canViewPurchaseRequestEstimates(user: NovaSkillHandlerContext["user"]): boolean {
  return canViewOrgFinanceAggregates(user);
}

export async function runPurchaseRequestsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "purchase_requests_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "purchaserequest.read") && !can(user, "purchaserequest.create")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing purchaserequest.read",
      },
    };
  }

  const showMoney = canViewPurchaseRequestEstimates(user);
  const pending = ["DRAFT", "SUBMITTED", "MANAGER_VERIFIED"] as const;
  const [pendingCount, samples] = await Promise.all([
    prisma.purchaseRequest.count({ where: { status: { in: [...pending] } } }),
    prisma.purchaseRequest.findMany({
      where: { status: { in: [...pending] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        id: true,
        purchaseRequestId: true,
        item: true,
        status: true,
        urgency: true,
        projectRef: true,
        estimatedPrice: true,
      },
    }),
  ]);

  links.push({ title: "Purchase requests", href: "/purchase-requests" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          pendingCount,
          balancesVisible: showMoney,
          samples: samples.map((r) => ({
            id: r.purchaseRequestId,
            item: r.item.slice(0, 60),
            status: r.status,
            urgency: r.urgency,
            project: r.projectRef,
            estimateInr: showMoney ? inr(n(r.estimatedPrice)) : "hidden",
            href: `/purchase-requests/${r.id}`,
          })),
          note: showMoney
            ? undefined
            : "Estimates hidden for Staff without finance aggregate access.",
        },
        { sources: ["purchase_requests"] }
      ),
    },
    links,
  };
}
