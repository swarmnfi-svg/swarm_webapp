import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";

const OPEN_APPROVAL_STATUSES = ["PENDING_APPROVAL", "SUBMITTED", "ESCALATED"] as const;

/**
 * Scope open approvals for NOVA.
 * - approval.read.all → org-wide
 * - team / self → only items the user submitted or is currently approving
 *   (team is not treated as org-wide — that was an over-share).
 */
export function novaOpenApprovalsWhere(user: SessionUser): Record<string, unknown> | null {
  const canAll = can(user, "approval.read.all");
  const canTeam = can(user, "approval.read.team");
  const canSelf = can(user, "approval.read.self");
  const canApprove = can(user, "approval.approve");
  if (!canAll && !canTeam && !canSelf && !canApprove) return null;

  if (canAll) {
    return { status: { in: [...OPEN_APPROVAL_STATUSES] } };
  }

  return {
    status: { in: [...OPEN_APPROVAL_STATUSES] },
    OR: [{ submittedByUserId: user.id }, { currentApproverUserId: user.id }],
  };
}

type EntityScopeInput = {
  resolvedEntityType: "customer" | "vendor" | "project" | null;
  resolvedEntityDbId: string | null;
  entityFilterName?: string | null;
};

function textMatchOr(
  tokens: string[],
  opts?: { exactProjectRefs?: string[] }
): Prisma.ApprovalRequestWhereInput[] {
  const out: Prisma.ApprovalRequestWhereInput[] = [];
  for (const ref of opts?.exactProjectRefs ?? []) {
    const r = ref.trim();
    if (!r) continue;
    out.push({ metadata: { path: ["projectRef"], equals: r } });
  }
  for (const raw of tokens) {
    const t = raw.trim();
    if (t.length < 2) continue;
    out.push(
      { title: { contains: t, mode: "insensitive" } },
      { description: { contains: t, mode: "insensitive" } }
    );
  }
  return out;
}

async function sourceRecordOrForProjectRefs(
  projectRefs: string[]
): Promise<Prisma.ApprovalRequestWhereInput[]> {
  const refs = [...new Set(projectRefs.map((r) => r.trim()).filter(Boolean))];
  if (refs.length === 0) return [];

  const [pos, prs, bills, pays] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { projectRef: { in: refs } },
      select: { id: true },
      take: 200,
    }),
    prisma.purchaseRequest.findMany({
      where: { projectRef: { in: refs } },
      select: { id: true },
      take: 200,
    }),
    prisma.purchaseBill.findMany({
      where: { projectRef: { in: refs } },
      select: { id: true },
      take: 200,
    }),
    prisma.paymentRequest.findMany({
      where: { projectRef: { in: refs } },
      select: { id: true },
      take: 200,
    }),
  ]);

  const byModule: Array<{ sourceModule: string; ids: string[] }> = [
    { sourceModule: "PURCHASE_ORDER", ids: pos.map((r) => r.id) },
    { sourceModule: "PURCHASE_REQUEST", ids: prs.map((r) => r.id) },
    { sourceModule: "PURCHASE_BILL", ids: bills.map((r) => r.id) },
    { sourceModule: "PAYMENT_REQUEST", ids: pays.map((r) => r.id) },
  ];

  return byModule
    .filter((m) => m.ids.length > 0)
    .map((m) => ({
      sourceModule: m.sourceModule,
      sourceRecordId: { in: m.ids },
    }));
}

/**
 * When a project/customer is bound (or a filter name is present), narrow the
 * open-approvals queue to items linked via source records / title / metadata.
 * Returns null when there is no entity scope to apply (bare "approvals").
 */
export async function novaApprovalsEntityScopeWhere(
  input: EntityScopeInput
): Promise<Prisma.ApprovalRequestWhereInput | null> {
  const { resolvedEntityType, resolvedEntityDbId, entityFilterName } = input;
  const hint = entityFilterName?.trim() || null;

  if (resolvedEntityType === "project" && resolvedEntityDbId) {
    const project = await prisma.project.findUnique({
      where: { id: resolvedEntityDbId },
      select: { projectId: true, projectName: true },
    });
    if (!project) return null;
    const sourceOr = await sourceRecordOrForProjectRefs([project.projectId]);
    const textOr = textMatchOr([project.projectId, project.projectName, hint ?? ""], {
      exactProjectRefs: [project.projectId],
    });
    const or = [...sourceOr, ...textOr];
    return or.length > 0 ? { OR: or } : null;
  }

  if (resolvedEntityType === "customer" && resolvedEntityDbId) {
    const customer = await prisma.customer.findUnique({
      where: { id: resolvedEntityDbId },
      select: {
        customerId: true,
        customerName: true,
        projects: { select: { projectId: true }, take: 100 },
      },
    });
    if (!customer) return null;
    const projectRefs = customer.projects.map((p) => p.projectId);
    const sourceOr = await sourceRecordOrForProjectRefs(projectRefs);
    const textOr = textMatchOr(
      [customer.customerId, customer.customerName, ...projectRefs.slice(0, 20), hint ?? ""],
      { exactProjectRefs: projectRefs.slice(0, 40) }
    );
    const or = [...sourceOr, ...textOr];
    return or.length > 0 ? { OR: or } : null;
  }

  // Unresolved hint (pre-clarify) — soft title/description match only.
  if (hint && hint.length >= 2) {
    const textOr = textMatchOr([hint]);
    return textOr.length > 0 ? { OR: textOr } : null;
  }

  return null;
}

export { OPEN_APPROVAL_STATUSES };
