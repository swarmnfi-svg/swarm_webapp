/**
 * Ops skill — pending_workflow_counts (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { novaOpenApprovalsWhere } from "@/lib/ai/nova-approvals";
import { novaPurchaseBillPendingScope } from "@/lib/ai/nova-access";
import { paymentRequestListWhereForUser } from "@/lib/payment-request-access";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

export async function runPendingWorkflowCounts(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "pending_workflow_counts";
  const links: NovaToolLink[] = [];
  const data: Record<string, unknown> = {};

  if (can(user, "paymentrequest.read") || can(user, "paymentrequest.create")) {
    const prScope = await paymentRequestListWhereForUser(user);
    data.paymentRequestsAwaiting = await prisma.paymentRequest.count({
      where: {
        AND: [prScope, { status: { in: ["SUBMITTED", "MANAGER_VERIFIED"] } }],
      },
    });
    data.paymentRequestsScope = Object.keys(prScope).length === 0 ? "org" : "self";
    links.push({ title: "Payment requests", href: "/payment-requests" });
  } else {
    data.paymentRequestsAwaiting = "denied";
  }

  if (
    can(user, "purchasebill.read") ||
    can(user, "purchasebill.verify") ||
    can(user, "purchasebill.approve")
  ) {
    const billScope = novaPurchaseBillPendingScope(user);
    const pendingStatuses = {
      approvalStatus: {
        in: ["SUBMITTED", "MANAGER_VERIFIED"] as ("SUBMITTED" | "MANAGER_VERIFIED")[],
      },
    };
    if (billScope === "org") {
      data.purchaseBillsPending = await prisma.purchaseBill.count({ where: pendingStatuses });
      data.purchaseBillsScope = "org";
    } else if (billScope === "own") {
      data.purchaseBillsPending = await prisma.purchaseBill.count({
        where: { ...pendingStatuses, createdBy: user.id },
      });
      data.purchaseBillsScope = "own";
    } else {
      data.purchaseBillsPending = "denied";
    }
    if (billScope !== "denied") {
      links.push({ title: "Purchase bills", href: "/purchase-bills" });
    }
  } else {
    data.purchaseBillsPending = "denied";
  }

  if (
    can(user, "approval.read.self") ||
    can(user, "approval.read.team") ||
    can(user, "approval.read.all")
  ) {
    const approvalWhere = novaOpenApprovalsWhere(user);
    data.openApprovals = approvalWhere
      ? await prisma.approvalRequest.count({ where: approvalWhere })
      : 0;
    data.openApprovalsScope = can(user, "approval.read.all") ? "org" : "self_queue";
    links.push({ title: "Approvals", href: "/approvals" });
  }

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(data, { sources: ["pending_workflow"] }),
    },
    links,
  };
}
