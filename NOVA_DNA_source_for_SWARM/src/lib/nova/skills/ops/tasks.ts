/**
 * Skill — tasks_summary (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { novaCurrentMonthRange, novaTodayStart } from "@/lib/ai/nova-dates";
import { novaTaskAccessMode } from "@/lib/ai/nova-access";
import { teamUserIdsForManager } from "@/lib/tasks/team-scope";
import { teamLeadVisibility, taskTextSearch } from "@/lib/tasks/queries";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  isSelfAssignedForUser,
  isKpiLikeTaskPerformanceQuery,
  wantsAllTasksIncludingSelfAssigned,
} from "@/lib/kpi/task-self-assigned";
import {
  buildTasksPartyScope,
  buildTasksPartyScopeNote,
} from "@/lib/nova/skills/ops/task-party-scope";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

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
          sources: ["task"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runTasksSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, tz, range, query, entityFilterName, personHint, resolvedEntityDbId, resolvedEntityType, sampleLimit } = ctx;
  const name = "tasks_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);
  const includeSelfAssigned = wantsAllTasksIncludingSelfAssigned(query ?? "");
  const kpiLikePerformance =
    isKpiLikeTaskPerformanceQuery(query ?? "") && !includeSelfAssigned;

  if (!can(user, "task.read.self")) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing task.read.self" });
    return finalize();
  }
  const today = novaTodayStart(new Date(), tz);
  const week = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const openStatuses = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "REVIEW"] as const;
  // Org-wide only for Super Admin / Admin / task.admin — NOT task.edit.team (team-lead).
  const taskMode = novaTaskAccessMode(user);
  const canOrgAll = taskMode === "all";
  const canTeamLead = taskMode === "team";
  const teamUserIds = canTeamLead ? await teamUserIdsForManager(user.id) : [];
  /** May view another named person's tasks (org-all, or team-lead with that person on team). */
  const canViewNamedOther = (otherUserId: string | null) => {
    if (canOrgAll) return true;
    if (canTeamLead && otherUserId && teamUserIds.includes(otherUserId)) return true;
    return false;
  };

  type SubjectInfo = {
    name: string;
    relation: "self" | "other";
    userId: string | null;
    staffId: string | null;
    staffCode: string | null;
  };
  let subject: SubjectInfo = {
    name: user.name?.trim() || "You",
    relation: "self",
    userId: user.id,
    staffId: null,
    staffCode: null,
  };
  let personFilterUserId: string | null = null;
  let personFilterStaffId: string | null = null;

  if (personHint) {
    const staffMatches = await prisma.staffProfile.findMany({
      where: {
        OR: [
          { fullName: { contains: personHint, mode: "insensitive" } },
          { staffCode: { equals: personHint, mode: "insensitive" } },
        ],
      },
      select: { id: true, fullName: true, staffCode: true, userId: true },
      take: 8,
    });
    const exact =
      staffMatches.find((s) => s.fullName.toLowerCase() === personHint.toLowerCase()) ??
      staffMatches.find((s) => s.staffCode?.toLowerCase() === personHint.toLowerCase()) ??
      (staffMatches.length === 1 ? staffMatches[0] : null);
    if (!exact && staffMatches.length === 0) {
      const userMatches = await prisma.user.findMany({
        where: { name: { contains: personHint, mode: "insensitive" } },
        select: {
          id: true,
          name: true,
          staffProfile: { select: { id: true, fullName: true, staffCode: true } },
        },
        take: 5,
      });
      const uExact =
        userMatches.find((u) => (u.name ?? "").toLowerCase() === personHint.toLowerCase()) ??
        (userMatches.length === 1 ? userMatches[0] : null);
      if (!uExact) {
        facts.push({
          tool: name,
          ok: true,
          data: {
            subject: { name: personHint, relation: "other", resolved: false },
            message: `No staff member matching “${personHint}” was found. Check the name/spelling, or open Tasks.`,
            openCount: 0,
            overdueCount: 0,
            samples: [],
          },
        });
        links.push({ title: "Tasks", href: "/tasks" });
        return finalize();
      }
      const isSelf = uExact.id === user.id;
      if (!isSelf && !canViewNamedOther(uExact.id)) {
        facts.push({
          tool: name,
          ok: false,
          denied: true,
          error: `You can only view your own tasks — not ${uExact.name ?? personHint}'s.`,
          data: {
            subject: {
              name: uExact.staffProfile?.fullName ?? uExact.name ?? personHint,
              relation: "other",
            },
          },
        });
        return finalize();
      }
      subject = {
        name: uExact.staffProfile?.fullName ?? uExact.name ?? personHint,
        relation: isSelf ? "self" : "other",
        userId: uExact.id,
        staffId: uExact.staffProfile?.id ?? null,
        staffCode: uExact.staffProfile?.staffCode ?? null,
      };
      personFilterUserId = uExact.id;
      personFilterStaffId = uExact.staffProfile?.id ?? null;
    } else if (!exact && staffMatches.length > 1) {
      facts.push({
        tool: name,
        ok: true,
        data: {
          subject: { name: personHint, relation: "other", resolved: false },
          message: `Several people match “${personHint}”: ${staffMatches
            .slice(0, 5)
            .map((s) => `${s.fullName}${s.staffCode ? ` (${s.staffCode})` : ""}`)
            .join("; ")}. Reply with the full name or staff code.`,
          openCount: 0,
          samples: [],
        },
      });
      links.push({ title: "Tasks", href: "/tasks" });
      return finalize();
    } else if (exact) {
      const isSelf = exact.userId === user.id;
      if (!isSelf && !canViewNamedOther(exact.userId)) {
        facts.push({
          tool: name,
          ok: false,
          denied: true,
          error: `You can only view your own tasks — not ${exact.fullName}'s.`,
          data: {
            subject: { name: exact.fullName, relation: "other", staffCode: exact.staffCode },
          },
        });
        return finalize();
      }
      subject = {
        name: exact.fullName,
        relation: isSelf ? "self" : "other",
        userId: exact.userId,
        staffId: exact.id,
        staffCode: exact.staffCode,
      };
      personFilterUserId = exact.userId;
      personFilterStaffId = exact.id;
    }
  }

  const personOr =
    personFilterUserId || personFilterStaffId
      ? [
          ...(personFilterUserId
            ? [
                { createdByUserId: personFilterUserId },
                { ownerUserId: personFilterUserId },
                { assignees: { some: { userId: personFilterUserId } } },
                { watchers: { some: { userId: personFilterUserId } } },
              ]
            : []),
          ...(personFilterStaffId
            ? [
                { createdByStaffId: personFilterStaffId },
                { ownerStaffId: personFilterStaffId },
                { assignees: { some: { staffId: personFilterStaffId } } },
              ]
            : []),
        ]
      : null;

  const scopeWhere = personOr
    ? { isArchived: false, OR: personOr }
    : canOrgAll
      ? { isArchived: false }
      : canTeamLead
        ? { isArchived: false, AND: [teamLeadVisibility(user.id, teamUserIds)] }
        : {
            isArchived: false,
            OR: [
              { createdByUserId: user.id },
              { ownerUserId: user.id },
              { assignees: { some: { userId: user.id } } },
              { watchers: { some: { userId: user.id } } },
            ],
          };

  // Project / customer / soft party scope — filter counts AND samples (not org-wide then sample-filter).
  // Customer parent bind uses customerId → projects; never claim projectScoped.
  const partyScope = buildTasksPartyScope({
    resolvedEntityType,
    resolvedEntityDbId,
    entityFilterName,
    taskTextSearch,
  });
  const partyWhere = partyScope.where;

  /** Person whose self-assign status we label / optionally exclude (person filter or session self). */
  const selfAssignSubjectUserId = personFilterUserId ?? (personOr ? subject.userId : null);

  const base = {
    status: { in: [...openStatuses] },
    ...scopeWhere,
    ...(partyWhere ?? {}),
  };
  const taskPeopleSelect = {
    id: true,
    taskNo: true,
    title: true,
    status: true,
    priority: true,
    dueDate: true,
    createdAt: true,
    updatedAt: true,
    createdByUserId: true,
    project: { select: { projectId: true, projectName: true } },
    createdByUser: { select: { name: true } },
    createdByStaff: { select: { fullName: true, staffCode: true } },
    ownerUser: { select: { name: true } },
    ownerStaff: { select: { fullName: true, staffCode: true } },
    assignees: {
      select: {
        role: true,
        userId: true,
        assignedByUserId: true,
        user: { select: { name: true } },
        staff: { select: { fullName: true, staffCode: true } },
      },
    },
  } as const;
  const mapTaskSample = (t: {
    id: string;
    taskNo: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUserId: string;
    project: { projectId: string; projectName: string } | null;
    createdByUser: { name: string | null };
    createdByStaff: { fullName: string; staffCode: string } | null;
    ownerUser: { name: string | null } | null;
    ownerStaff: { fullName: string; staffCode: string } | null;
    assignees: {
      role: string;
      userId: string;
      assignedByUserId: string | null;
      user: { name: string | null };
      staff: { fullName: string; staffCode: string } | null;
    }[];
  }) => {
    const due = t.dueDate;
    const overdue = due != null && due < today;
    const assignees = t.assignees.map((a) => ({
      name: a.staff?.fullName ?? a.user.name ?? "Unknown",
      staffCode: a.staff?.staffCode ?? null,
      role: a.role,
    }));
    const subjectId = selfAssignSubjectUserId;
    const assigneeRow = subjectId
      ? t.assignees.find((a) => a.userId === subjectId)
      : null;
    const selfAssigned = Boolean(
      subjectId &&
        assigneeRow &&
        isSelfAssignedForUser({
          createdByUserId: t.createdByUserId,
          userId: subjectId,
          assignedByUserId: assigneeRow.assignedByUserId,
        })
    );
    return {
      no: t.taskNo,
      title: t.title,
      status: t.status,
      priority: t.priority,
      due: due?.toISOString().slice(0, 10) ?? null,
      overdue,
      createdAt: t.createdAt.toISOString().slice(0, 10),
      updatedAt: t.updatedAt.toISOString().slice(0, 10),
      project: t.project
        ? { id: t.project.projectId, name: t.project.projectName }
        : null,
      requester: {
        name: t.createdByStaff?.fullName ?? t.createdByUser.name ?? null,
        staffCode: t.createdByStaff?.staffCode ?? null,
      },
      owner: t.ownerUser || t.ownerStaff
        ? {
            name: t.ownerStaff?.fullName ?? t.ownerUser?.name ?? null,
            staffCode: t.ownerStaff?.staffCode ?? null,
          }
        : null,
      assignees,
      assigneeNames: assignees.map((a) =>
        a.staffCode ? `${a.name} (${a.staffCode})` : a.name
      ),
      selfAssigned,
      kpiExcluded: selfAssigned,
      href: `/tasks/${t.id}`,
    };
  };
  const completedPeriod = range ?? novaCurrentMonthRange(new Date(), tz);
  const completedBase = {
    status: "COMPLETED" as const,
    isArchived: false,
    updatedAt: { gte: completedPeriod.from, lte: completedPeriod.to },
    ...(partyWhere ?? {}),
    ...(personOr
      ? { OR: personOr }
      : canOrgAll
        ? {}
        : canTeamLead
          ? teamLeadVisibility(user.id, teamUserIds)
          : {
              OR: [
                { createdByUserId: user.id },
                { ownerUserId: user.id },
                { assignees: { some: { userId: user.id } } },
                { watchers: { some: { userId: user.id } } },
              ],
            }),
  };

  /** For KPI-like person asks, drop self-assigned from the count pool (same as scorecard). */
  const excludeSelfAssignWhere =
    kpiLikePerformance && selfAssignSubjectUserId
      ? {
          NOT: {
            OR: [
              { createdByUserId: selfAssignSubjectUserId },
              {
                assignees: {
                  some: {
                    userId: selfAssignSubjectUserId,
                    assignedByUserId: selfAssignSubjectUserId,
                  },
                },
              },
            ],
          },
        }
      : null;

  const countBase = excludeSelfAssignWhere
    ? { AND: [base, excludeSelfAssignWhere] }
    : base;
  const countCompletedBase = excludeSelfAssignWhere
    ? { AND: [completedBase, excludeSelfAssignWhere] }
    : completedBase;

  const [openCount, overdueCount, dueSoonCount, completedCount, overdueSamples, openSamples, topCompleters] =
    await Promise.all([
      prisma.task.count({ where: countBase }),
      prisma.task.count({ where: { ...countBase, dueDate: { lt: today } } }),
      prisma.task.count({
        where: { ...countBase, dueDate: { gte: today, lte: week } },
      }),
      prisma.task.count({ where: countCompletedBase }),
      prisma.task.findMany({
        where: { ...base, dueDate: { lt: today } },
        orderBy: { dueDate: "asc" },
        take: 8,
        select: taskPeopleSelect,
      }),
      prisma.task.findMany({
        where: base,
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 8,
        select: taskPeopleSelect,
      }),
      Promise.resolve()
        .then(() =>
          prisma.taskAssignee.groupBy({
            by: ["userId"],
            where: {
              task: countCompletedBase,
            },
            _count: { taskId: true },
            orderBy: { _count: { taskId: "desc" } },
            take: 5,
          })
        )
        .catch(() => [] as { userId: string; _count: { taskId: number } }[]),
    ]);
  const completerUsers =
    topCompleters.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: topCompleters.map((c) => c.userId) } },
          select: { id: true, name: true, staffProfile: { select: { fullName: true, staffCode: true } } },
        })
      : [];
  const completerMap = new Map(completerUsers.map((u) => [u.id, u]));
  const completedByAssignee = topCompleters.map((c) => {
    const u = completerMap.get(c.userId);
    const name = u?.staffProfile?.fullName ?? u?.name ?? "Unknown";
    const code = u?.staffProfile?.staffCode ?? null;
    return {
      userId: c.userId,
      name,
      staffCode: code,
      completedCount: c._count.taskId,
    };
  });
  const mapAndMaybeDropSelf = (rows: Parameters<typeof mapTaskSample>[0][]) => {
    const mapped = rows.map(mapTaskSample);
    if (!kpiLikePerformance) return mapped;
    return mapped.filter((t) => !t.selfAssigned);
  };
  const overdueMapped = mapAndMaybeDropSelf(overdueSamples);
  const openMapped = mapAndMaybeDropSelf(openSamples);
  // Id-bound customer/project already scoped in Prisma — skip soft title/name re-filter
  // so child project tasks (e.g. “James school 3 cum”) stay in the customer sample.
  const samples = (overdueMapped.length > 0 ? overdueMapped : openMapped).filter((t) => {
    if (partyScope.kind === "project" || partyScope.kind === "customer") return true;
    const h = partyScope.label?.toLowerCase();
    if (!h) return true;
    return (
      t.title.toLowerCase().includes(h) ||
      t.assigneeNames.some((n) => n.toLowerCase().includes(h)) ||
      (t.project?.name ?? "").toLowerCase().includes(h) ||
      (t.project?.id ?? "").toLowerCase().includes(h)
    );
  });
  const kpiNote = kpiLikePerformance
    ? " Self-assigned tasks are excluded from these counts (same KPI pool rule). Ask “including self-assigned” to include them."
    : " Samples may mark selfAssigned/kpiExcluded when the subject created or self-assigned the task — those are excluded from KPI scorecards.";
  const scopeNote = buildTasksPartyScopeNote({
    subjectRelation: subject.relation,
    subjectName: subject.name,
    projectScoped: partyScope.projectScoped,
    customerScoped: partyScope.customerScoped,
    label: partyScope.label,
  });
  facts.push({
    tool: name,
    ok: true,
    data: (() => {
      const data = {
        subject: {
          name: subject.name,
          relation: subject.relation,
          staffCode: subject.staffCode,
          resolved: true,
        },
        openCount,
        overdueCount,
        dueSoonCount,
        completedCount,
        completedPeriod: completedPeriod.label,
        completedByAssignee,
        kpiSelfAssignedExcluded: kpiLikePerformance,
        scope: personOr
          ? subject.relation === "self"
            ? "person_self"
            : "person_other"
          : canOrgAll
            ? "all"
            : canTeamLead
              ? "team"
              : "self",
        personFilter: personHint ?? null,
        entityFilter: partyScope.label,
        projectScoped: partyScope.projectScoped,
        customerScoped: partyScope.customerScoped,
        note: scopeNote + kpiNote,
        samples,
        overdueSamples: overdueMapped,
      };
      const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
      if (!reportIntent) return data;
      const { attachment } = buildSkillReportPack({
        packId: "tasks_report",
        reportMode,
        title: "Tasks report",
        headline: `Open ${openCount} · overdue ${overdueCount} · due soon ${dueSoonCount} · completed ${completedCount}`,
        period: {
          label: completedPeriod.label,
          grain: "month",
          calendarKind: "calendar_month",
          source: range ? "explicit" : "default",
        },
        metrics: [
          {
            metricId: "tasks.open_count",
            version: "1",
            certification: "draft",
            value: openCount,
            display: `${openCount} open`,
          },
          {
            metricId: "tasks.overdue_count",
            version: "1",
            certification: "draft",
            value: overdueCount,
            display: `${overdueCount} overdue`,
          },
          {
            metricId: "tasks.completed_count",
            version: "1",
            certification: "draft",
            value: completedCount,
            display: `${completedCount} completed`,
          },
        ],
        charts: [
          {
            bindingId: "kpi_strip",
            metricIds: ["tasks.completed_count"],
            title: "Completed by assignee",
            points: completedByAssignee.slice(0, 8).map((c) => ({
              label: String(c.name ?? "User").slice(0, 18),
              value: Number(c.completedCount ?? 0),
              unit: "count",
            })),
          },
          {
            bindingId: "ageing_or_attention",
            metricIds: ["tasks.overdue_count"],
            title: "Open vs overdue",
            points: [
              { label: "Open", value: openCount, unit: "count" },
              { label: "Overdue", value: overdueCount, unit: "count" },
              { label: "Due soon", value: dueSoonCount, unit: "count" },
            ],
          },
        ],
        tables: [
          {
            id: "task_samples",
            title: overdueMapped.length ? "Overdue tasks" : "Open tasks",
            columns: ["Task", "Status", "Due", "Assignees"],
            rows: samples.slice(0, 24).map((t) => [
              reportCell(t.no ?? t.title),
              reportCell(t.status),
              reportCell(t.due),
              reportCell((t.assigneeNames ?? []).join(", ")),
            ]),
          },
        ],
        facts: [{ tool: name, ok: true, data }],
        links: [{ title: "Tasks", href: "/tasks" }],
        omittedNotes: ["Task ACL (self/team/org) and KPI self-assigned exclusion rules are preserved."],
      });
      return withSkillReportAttachment(data, attachment);
    })(),
  });
  links.push({ title: "Tasks", href: "/tasks" });
  for (const t of samples.slice(0, 3)) {
    links.push({ title: t.no ?? t.title, href: t.href });
  }
  return finalize();
}
