/**
 * HR skills — overtime_summary + regularisation_summary (pending approval queues).
 * Report-intent asks return overtime_report / regularisation_report packs (scope preserved).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { formatPrismaDate } from "@/lib/datetime-pure";
import { hrTeamStaffIdsForUser } from "@/lib/hr/team-scope";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

function finalizeFrom(
  facts: NovaSkillHandlerResult["fact"][],
  links: NovaToolLink[],
  sources: string[]
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
          sources,
        }),
      },
      links,
    };
  }
  return { fact, links };
}

async function resolveHrQueueScope(
  ctx: NovaSkillHandlerContext,
  opts: {
    canAll: boolean;
    canTeam: boolean;
    canSelf: boolean;
  }
): Promise<
  | { ok: true; staffFilter: { staffId?: string | { in: string[] } }; scope: "all" | "team" | "self" }
  | { ok: false; result: NovaSkillHandlerResult }
> {
  const { user } = ctx;
  if (!opts.canAll && !opts.canTeam && !opts.canSelf) {
    return {
      ok: false,
      result: {
        fact: { tool: "scope", ok: false, denied: true, error: "Missing HR queue access" },
        links: [],
      },
    };
  }
  if (opts.canAll) return { ok: true, staffFilter: {}, scope: "all" };
  if (opts.canTeam) {
    const teamIds = await hrTeamStaffIdsForUser(user, user.id);
    if (teamIds === null) return { ok: true, staffFilter: {}, scope: "all" };
    if (teamIds.length === 0) {
      return {
        ok: false,
        result: {
          fact: {
            tool: "scope",
            ok: true,
            data: { message: "No team members in your HR scope.", pendingCount: 0, samples: [] },
          },
          links: [{ title: "Attendance HR", href: "/attendance-hr" }],
        },
      };
    }
    return { ok: true, staffFilter: { staffId: { in: teamIds } }, scope: "team" };
  }
  const me = await prisma.staffProfile.findFirst({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!me) {
    return {
      ok: false,
      result: {
        fact: {
          tool: "scope",
          ok: true,
          data: { message: "No staff profile linked — cannot load your queue.", pendingCount: 0 },
        },
        links: [{ title: "Attendance HR", href: "/attendance-hr" }],
      },
    };
  }
  return { ok: true, staffFilter: { staffId: me.id }, scope: "self" };
}

export async function runOvertimeSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, query, sampleLimit } = ctx;
  const name = "overtime_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links, ["hr_overtime_record"]);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);

  const canAll = can(user, "hr.overtime.read");
  const canTeam = can(user, "hr.overtime.approve") || can(user, "hr.attendance.team");
  const canSelf = can(user, "hr.overtime.create") || can(user, "hr.punch.self");
  const scoped = await resolveHrQueueScope(ctx, { canAll, canTeam, canSelf });
  if (!scoped.ok) {
    const f = scoped.result.fact;
    facts.push({ ...f, tool: name });
    if (scoped.result.links?.length) links.push(...scoped.result.links);
    return finalize();
  }

  const q = query.toLowerCase();
  const wantsPending = /\bpending\b/.test(q) || !/\b(approved|rejected)\b/.test(q);
  const status = wantsPending
    ? ("PENDING" as const)
    : /\brejected\b/.test(q)
      ? ("REJECTED" as const)
      : ("APPROVED" as const);

  const where = { ...scoped.staffFilter, status };
  const sampleTake = reportIntent ? rowCap : (sampleLimit ?? 8);
  const [pendingCount, samples, approvedCount, rejectedCount] = await Promise.all([
    prisma.hrOvertimeRecord.count({
      where: { ...scoped.staffFilter, status: "PENDING" },
    }),
    prisma.hrOvertimeRecord.findMany({
      where,
      orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
      take: sampleTake,
      select: {
        id: true,
        date: true,
        overtimeMinutes: true,
        payMode: true,
        status: true,
        reason: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
    prisma.hrOvertimeRecord.count({
      where: { ...scoped.staffFilter, status: "APPROVED" },
    }),
    prisma.hrOvertimeRecord.count({
      where: { ...scoped.staffFilter, status: "REJECTED" },
    }),
  ]);

  const sampleMapped = samples.map((r) => ({
    id: r.id,
    name: r.staff.fullName,
    code: r.staff.staffCode,
    date: formatPrismaDate(r.date),
    overtimeMinutes: r.overtimeMinutes,
    payMode: r.payMode,
    status: r.status,
    reason: r.reason,
  }));

  const data: Record<string, unknown> = {
    scope: scoped.scope,
    focus: status.toLowerCase(),
    pendingCount,
    approvedCount,
    rejectedCount,
    sampleStatus: status,
    samples: sampleMapped,
    note:
      status === "PENDING"
        ? "Only APPROVED overtime is paid in payroll. Pending OT still appears as worked time on the register."
        : null,
  };

  links.push({
    title: status === "PENDING" ? "Pending overtime" : "Overtime",
    href:
      status === "PENDING"
        ? "/attendance-hr/overtime?status=PENDING"
        : "/attendance-hr/overtime",
  });

  if (reportIntent) {
    const statusPoints = [
      { label: "Pending", value: pendingCount, unit: "count" as const },
      { label: "Approved", value: approvedCount, unit: "count" as const },
      { label: "Rejected", value: rejectedCount, unit: "count" as const },
    ];
    const minutesPoints = sampleMapped.slice(0, 8).map((s) => ({
      label: String(s.name ?? s.code ?? "Staff").slice(0, 18),
      value: Number(s.overtimeMinutes ?? 0),
      unit: "minutes" as const,
    }));
    const { attachment } = buildSkillReportPack({
      packId: "overtime_report",
      reportMode,
      title: "Overtime report",
      headline: `${pendingCount} pending · ${approvedCount} approved · ${rejectedCount} rejected · scope ${scoped.scope}`,
      period: {
        label: `OT ${status.toLowerCase()}`,
        grain: "open",
        calendarKind: "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "overtime.pending_count",
          version: "1",
          certification: "draft",
          value: pendingCount,
          display: `${pendingCount} pending`,
        },
        {
          metricId: "overtime.approved_count",
          version: "1",
          certification: "draft",
          value: approvedCount,
          display: `${approvedCount} approved`,
        },
        {
          metricId: "overtime.rejected_count",
          version: "1",
          certification: "draft",
          value: rejectedCount,
          display: `${rejectedCount} rejected`,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["overtime.pending_count", "overtime.approved_count"],
          title: "OT status mix",
          points: statusPoints,
        },
        {
          bindingId: "ageing_or_attention",
          metricIds: ["overtime.pending_count"],
          title: "OT minutes (sample)",
          points: minutesPoints,
        },
      ],
      tables: [
        {
          id: "overtime_rows",
          title: `Overtime (${status})`,
          columns: ["Staff", "Code", "Date", "Minutes", "Pay mode", "Status"],
          rows: sampleMapped.map((s) => [
            reportCell(s.name),
            reportCell(s.code),
            reportCell(s.date),
            reportCell(s.overtimeMinutes),
            reportCell(s.payMode),
            reportCell(s.status),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        `Self/team/all OT scope is preserved (scope=${scoped.scope}); report intent does not widen ACL.`,
      ],
    });
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(data, attachment),
    });
  } else {
    facts.push({
      tool: name,
      ok: true,
      data,
    });
  }
  return finalize();
}

export async function runRegularisationSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, query, sampleLimit } = ctx;
  const name = "regularisation_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links, ["hr_regularisation_request"]);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);

  const canAll = can(user, "hr.regularisation.read");
  const canTeam =
    can(user, "hr.regularisation.approve") || can(user, "hr.attendance.team");
  const canSelf = can(user, "hr.regularisation.create") || can(user, "hr.punch.self");
  const scoped = await resolveHrQueueScope(ctx, { canAll, canTeam, canSelf });
  if (!scoped.ok) {
    const f = scoped.result.fact;
    facts.push({ ...f, tool: name });
    if (scoped.result.links?.length) links.push(...scoped.result.links);
    return finalize();
  }

  const q = query.toLowerCase();
  const wantsPending = /\bpending\b/.test(q) || !/\b(approved|rejected)\b/.test(q);
  const status = wantsPending
    ? ("PENDING" as const)
    : /\brejected\b/.test(q)
      ? ("REJECTED" as const)
      : ("APPROVED" as const);

  const where = { ...scoped.staffFilter, status };
  const sampleTake = reportIntent ? rowCap : (sampleLimit ?? 8);
  const [pendingCount, samples, approvedCount, rejectedCount] = await Promise.all([
    prisma.hrRegularisationRequest.count({
      where: { ...scoped.staffFilter, status: "PENDING" },
    }),
    prisma.hrRegularisationRequest.findMany({
      where,
      orderBy: [{ date: "desc" }, { updatedAt: "desc" }],
      take: sampleTake,
      select: {
        id: true,
        date: true,
        requestType: true,
        reason: true,
        status: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
    prisma.hrRegularisationRequest.count({
      where: { ...scoped.staffFilter, status: "APPROVED" },
    }),
    prisma.hrRegularisationRequest.count({
      where: { ...scoped.staffFilter, status: "REJECTED" },
    }),
  ]);

  const sampleMapped = samples.map((r) => ({
    id: r.id,
    name: r.staff.fullName,
    code: r.staff.staffCode,
    date: formatPrismaDate(r.date),
    requestType: r.requestType,
    reason: r.reason,
    status: r.status,
  }));

  const data: Record<string, unknown> = {
    scope: scoped.scope,
    focus: status.toLowerCase(),
    pendingCount,
    approvedCount,
    rejectedCount,
    sampleStatus: status,
    samples: sampleMapped,
  };

  links.push({
    title: status === "PENDING" ? "Pending regularisation" : "Regularisation",
    href:
      status === "PENDING"
        ? "/attendance-hr/regularisation?status=PENDING"
        : "/attendance-hr/regularisation",
  });

  if (reportIntent) {
    const statusPoints = [
      { label: "Pending", value: pendingCount, unit: "count" as const },
      { label: "Approved", value: approvedCount, unit: "count" as const },
      { label: "Rejected", value: rejectedCount, unit: "count" as const },
    ];
    const byType = new Map<string, number>();
    for (const s of sampleMapped) {
      const key = String(s.requestType ?? "—").slice(0, 18);
      byType.set(key, (byType.get(key) ?? 0) + 1);
    }
    const typePoints = [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, unit: "count" as const }));

    const { attachment } = buildSkillReportPack({
      packId: "regularisation_report",
      reportMode,
      title: "Regularisation report",
      headline: `${pendingCount} pending · ${approvedCount} approved · ${rejectedCount} rejected · scope ${scoped.scope}`,
      period: {
        label: `Reg ${status.toLowerCase()}`,
        grain: "open",
        calendarKind: "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "regularisation.pending_count",
          version: "1",
          certification: "draft",
          value: pendingCount,
          display: `${pendingCount} pending`,
        },
        {
          metricId: "regularisation.approved_count",
          version: "1",
          certification: "draft",
          value: approvedCount,
          display: `${approvedCount} approved`,
        },
        {
          metricId: "regularisation.rejected_count",
          version: "1",
          certification: "draft",
          value: rejectedCount,
          display: `${rejectedCount} rejected`,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["regularisation.pending_count", "regularisation.approved_count"],
          title: "Regularisation status mix",
          points: statusPoints,
        },
        {
          bindingId: "ageing_or_attention",
          metricIds: ["regularisation.pending_count"],
          title: "By request type (sample)",
          points: typePoints,
        },
      ],
      tables: [
        {
          id: "regularisation_rows",
          title: `Regularisation (${status})`,
          columns: ["Staff", "Code", "Date", "Type", "Status", "Reason"],
          rows: sampleMapped.map((s) => [
            reportCell(s.name),
            reportCell(s.code),
            reportCell(s.date),
            reportCell(s.requestType),
            reportCell(s.status),
            reportCell(s.reason),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        `Self/team/all regularisation scope is preserved (scope=${scoped.scope}); report intent does not widen ACL.`,
      ],
    });
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(data, attachment),
    });
  } else {
    facts.push({
      tool: name,
      ok: true,
      data,
    });
  }
  return finalize();
}
