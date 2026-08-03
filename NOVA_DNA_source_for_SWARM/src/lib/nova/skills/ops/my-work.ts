/**
 * Skill — my_work_summary (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { novaCurrentMonthRange } from "@/lib/ai/nova-dates";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

function finalizeFrom(
  facts: NovaSkillHandlerResult["fact"][],
  links: NovaToolLink[]
): NovaSkillHandlerResult {
  const fact = facts[facts.length - 1]!;
  if (fact?.ok && fact.data && typeof fact.data === "object") {
    return {
      fact: {
        ...fact,
        data: withFactProvenance(fact.data as Record<string, unknown>, {
          period:
            typeof (fact.data as Record<string, unknown>).period === "string"
              ? ((fact.data as Record<string, unknown>).period as string)
              : null,
          sources: ["task","kpi_review","hr_leave_request"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runMyWorkSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, tz, range } = ctx;
  const name = "my_work_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  const me = await prisma.staffProfile.findFirst({
    where: { userId: user.id },
    select: { id: true, fullName: true, staffCode: true },
  });
  const data: Record<string, unknown> = {
    name: me?.fullName ?? user.name,
    staffCode: me?.staffCode ?? null,
    subject: {
      name: me?.fullName ?? user.name,
      relation: "self",
      staffCode: me?.staffCode ?? null,
    },
  };
  if (can(user, "task.read.self")) {
    const now = new Date();
    const openStatuses = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "REVIEW"] as const;
    const mineOr = [
      { createdByUserId: user.id },
      { ownerUserId: user.id },
      { assignees: { some: { userId: user.id } } },
    ];
    const completedPeriod = range ?? novaCurrentMonthRange(new Date(), tz);
    const [myOpen, myOverdue, myCompleted] = await Promise.all([
      prisma.task.count({
        where: {
          isArchived: false,
          status: { in: [...openStatuses] },
          OR: mineOr,
        },
      }),
      prisma.task.count({
        where: {
          isArchived: false,
          status: { in: [...openStatuses] },
          dueDate: { lt: now },
          OR: mineOr,
        },
      }),
      prisma.task.count({
        where: {
          isArchived: false,
          status: "COMPLETED",
          updatedAt: { gte: completedPeriod.from, lte: completedPeriod.to },
          OR: mineOr,
        },
      }),
    ]);
    data.myOpenTasks = myOpen;
    data.myOverdueTasks = myOverdue;
    data.myCompletedTasks = myCompleted;
    data.completedPeriod = completedPeriod.label;
    links.push({ title: "My tasks", href: "/tasks" });
  }
  if (can(user, "kpi.read.self")) {
    const period = await prisma.kpiPeriod.findFirst({
      orderBy: { endDate: "desc" },
      select: { id: true, name: true, status: true },
    });
    if (period) {
      const review = await prisma.kpiReview.findFirst({
        where: { periodId: period.id, userId: user.id },
        select: { totalScore: true, grade: true },
      });
      data.kpiPeriod = period.name;
      data.myKpiScore = review?.totalScore ?? null;
      data.myKpiGrade = review?.grade ?? null;
    }
    links.push({ title: "My KPI", href: "/kpi" });
  }
  if (me && (can(user, "hr.leave.create") || can(user, "hr.leave.read"))) {
    const leavePending = await prisma.hrLeaveRequest.count({
      where: { staffId: me.id, status: "PENDING" },
    });
    data.myPendingLeave = leavePending;
  }
  facts.push({ tool: name, ok: true, data });
  return finalize();
}
