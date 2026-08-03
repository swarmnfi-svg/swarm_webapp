/**
 * Adapter — tasks completed after due date (late completion frequency).
 * Self-assigned tasks are excluded from rankings (same KPI pool rule) unless
 * the query asks for “all tasks including self-assigned”.
 */
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { novaTaskAccessMode } from "@/lib/ai/nova-access";
import { teamUserIdsForManager } from "@/lib/tasks/team-scope";
import { teamLeadVisibility } from "@/lib/tasks/queries";
import { getCalendarDateInTimezone } from "@/lib/datetime-pure";
import {
  isSelfAssignedForUser,
  wantsAllTasksIncludingSelfAssigned,
} from "@/lib/kpi/task-self-assigned";
import {
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
} from "@/lib/nova/trend/contract";
import {
  bindNovaTrendWindow,
  formatBucketKey,
  inferNovaTrendGrain,
} from "@/lib/nova/trend/window";
import { buildNovaTrendSeries, rankNovaTrendEntities } from "@/lib/nova/trend/rank";
import type { TrendLoadFail, TrendLoadOk } from "@/lib/nova/trend/adapters/attendance-late";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";
import { trendTaskPartyScopeFromCtx } from "@/lib/nova/trend/party-scope";

function calendarDayKey(d: Date, tz: string): string {
  const c = getCalendarDateInTimezone(d, tz);
  return `${c.year}-${String(c.month).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
}

/** True when completed calendar day is strictly after due calendar day. */
export function isTaskCompletedAfterDue(
  dueDate: Date | null | undefined,
  completedAt: Date | null | undefined,
  tz: string
): boolean {
  if (!dueDate || !completedAt) return false;
  return calendarDayKey(completedAt, tz) > calendarDayKey(dueDate, tz);
}

export async function loadTaskLateCompletionTrend(
  ctx: NovaSkillHandlerContext
): Promise<TrendLoadOk | TrendLoadFail> {
  const { user, query, tz, range, personHint } = ctx;
  if (!can(user, "task.read.self")) {
    return { ok: false, denied: true, error: "Missing task.read.self" };
  }

  const window = bindNovaTrendWindow(query, { range, tz });
  const grain = inferNovaTrendGrain(window.from, window.to);
  const links = [{ title: "Tasks", href: "/tasks" }];

  const taskMode = novaTaskAccessMode(user);
  const canOrgAll = taskMode === "all";
  const canTeamLead = taskMode === "team";
  const teamUserIds = canTeamLead ? await teamUserIdsForManager(user.id) : [];

  let personFilterUserId: string | null = null;
  let entityLabel = canOrgAll ? "Organisation" : canTeamLead ? "Team" : user.name?.trim() || "You";

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
    if (!exact || !exact.userId) {
      return {
        ok: false,
        empty: true,
        bundle: {
          schemaVersion: NOVA_TREND_SCHEMA_VERSION,
          domain: "task_late_completion",
          entity: { kind: "person", label: personHint },
          metric: {
            id: "late_completions",
            label: "Late completions",
            unit: "late completion(s)",
          },
          window,
          grain,
          series: [],
          rankings: [],
          links,
          empty: true,
          message: `No staff member matching “${personHint}” was found.`,
        },
      };
    }
    const isSelf = exact.userId === user.id;
    const canViewOther =
      canOrgAll || (canTeamLead && teamUserIds.includes(exact.userId));
    if (!isSelf && !canViewOther) {
      return {
        ok: false,
        denied: true,
        error: `You can only view your own tasks — not ${exact.fullName}'s.`,
      };
    }
    personFilterUserId = exact.userId;
    entityLabel = exact.fullName;
  }

  // Soft party/project/customer scope when bind present (QI structure / sticky).
  const partyScope = trendTaskPartyScopeFromCtx(ctx);
  const projectScope: Prisma.TaskWhereInput | null = partyScope.where;

  const scopeWhere: Prisma.TaskWhereInput = personFilterUserId
    ? {
        isArchived: false,
        ...(projectScope ?? {}),
        OR: [
          { ownerUserId: personFilterUserId },
          { assignees: { some: { userId: personFilterUserId } } },
          { completedByUserId: personFilterUserId },
        ],
      }
    : canOrgAll
      ? { isArchived: false, ...(projectScope ?? {}) }
      : canTeamLead
        ? {
            isArchived: false,
            AND: [
              teamLeadVisibility(user.id, teamUserIds),
              ...(projectScope ? [projectScope] : []),
            ],
          }
        : {
            isArchived: false,
            ...(projectScope ?? {}),
            OR: [
              { ownerUserId: user.id },
              { assignees: { some: { userId: user.id } } },
              { completedByUserId: user.id },
            ],
          };

  if (partyScope.entity && !personHint) {
    entityLabel = partyScope.entity.label;
  }

  const includeSelfAssigned = wantsAllTasksIncludingSelfAssigned(query);

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        scopeWhere,
        {
          status: "COMPLETED",
          completedAt: { gte: window.from, lte: window.to },
          dueDate: { not: null },
        },
      ],
    },
    select: {
      id: true,
      dueDate: true,
      completedAt: true,
      createdByUserId: true,
      ownerUserId: true,
      ownerUser: { select: { name: true } },
      ownerStaff: { select: { fullName: true, staffCode: true } },
      completedByUserId: true,
      assignees: {
        select: {
          userId: true,
          assignedByUserId: true,
          user: { select: { name: true } },
          staff: { select: { fullName: true, staffCode: true } },
        },
        take: 8,
      },
    },
    take: 4000,
  });

  type Acc = { label: string; code: string | null; count: number; dates: Date[] };
  const byPerson = new Map<string, Acc>();

  for (const t of tasks) {
    if (!isTaskCompletedAfterDue(t.dueDate, t.completedAt, tz)) continue;
    const completedAt = t.completedAt!;
    let key = t.ownerUserId ?? t.completedByUserId ?? t.assignees[0]?.userId ?? "unknown";
    let label =
      t.ownerStaff?.fullName ??
      t.ownerUser?.name ??
      t.assignees[0]?.staff?.fullName ??
      t.assignees[0]?.user?.name ??
      "Unknown";
    let code = t.ownerStaff?.staffCode ?? t.assignees[0]?.staff?.staffCode ?? null;

    if (personFilterUserId) {
      key = personFilterUserId;
      label = entityLabel;
      code = null;
    }

    if (!includeSelfAssigned && key !== "unknown") {
      const assigneeRow = t.assignees.find((a) => a.userId === key);
      if (
        isSelfAssignedForUser({
          createdByUserId: t.createdByUserId,
          userId: key,
          assignedByUserId: assigneeRow?.assignedByUserId,
        })
      ) {
        continue;
      }
    }

    const cur = byPerson.get(key) ?? { label, code, count: 0, dates: [] };
    cur.count += 1;
    cur.dates.push(completedAt);
    byPerson.set(key, cur);
  }

  const rankings = rankNovaTrendEntities(
    [...byPerson.entries()].map(([id, v]) => ({
      entityId: id === "unknown" ? null : id,
      label: v.label,
      value: v.count,
      secondary: v.code,
    }))
  );

  const allDates = [...byPerson.values()].flatMap((v) => v.dates);
  const series = buildNovaTrendSeries(allDates, (d) => formatBucketKey(d, grain, tz));

  const bundle: NovaTrendBundle = {
    schemaVersion: NOVA_TREND_SCHEMA_VERSION,
    domain: "task_late_completion",
    entity: personHint
      ? { kind: "person", label: entityLabel }
      : partyScope.entity
        ? {
            kind: partyScope.entity.kind,
            id: partyScope.entity.id,
            label: partyScope.entity.label,
          }
        : { kind: "org", label: entityLabel },
    metric: {
      id: "late_completions",
      label: "Late completions",
      unit: "late completion(s)",
    },
    window,
    grain,
    series,
    rankings,
    methodology: includeSelfAssigned
      ? "COMPLETED tasks with completedAt in window and completed calendar day after due date (including self-assigned)."
      : "COMPLETED tasks with completedAt in window and completed calendar day after due date; self-assigned tasks excluded (same KPI pool rule — createdBy or assignedBy = attributed user).",
    links,
    empty: rankings.length === 0,
    message:
      rankings.length === 0
        ? `No late task completions in ${window.label}.`
        : null,
  };

  return { ok: true, bundle };
}
