/**
 * Skill — leave_summary (extracted from nova-tools; behaviour identical).
 * Report-intent asks return a savable leave_report pack (scope preserved).
 */
import { prisma } from "@/lib/nova/prisma-readonly";
import { getCalendarDateInTimezone } from "@/lib/datetime-pure";
import { currentIndianFyRange, novaDayBoundsFor } from "@/lib/ai/nova-dates";
import { novaLeaveAccessMode } from "@/lib/ai/nova-access";
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
          sources: ["hr_leave_request"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runLeaveSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, tz, range, query, personHint, sampleLimit } = ctx;
  const name = "leave_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);

  const leaveMode = novaLeaveAccessMode(user);
  if (leaveMode === "none") {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing leave access" });
    return finalize();
  }
  let staffFilter: { staffId?: string | { in: string[] } } = {};
  let scope: "all" | "team" | "self" | "person_other" | "person_self" = "all";
  let leaveSubject: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } | null = null;

  if (leaveMode === "all") {
    scope = "all";
  } else if (leaveMode === "team") {
    let teamIds = await hrTeamStaffIdsForUser(user, user.id);
      // leave.approve / employee.read without attendance.team still get reporting-line team
    if (Array.isArray(teamIds) && teamIds.length === 0) {
      const manager = await prisma.staffProfile.findFirst({
        where: { userId: user.id },
        select: { id: true },
      });
      if (manager) {
        const reports = await prisma.staffProfile.findMany({
          where: { reportingManagerStaffId: manager.id, employmentStatus: "ACTIVE" },
          select: { id: true },
        });
        teamIds = [manager.id, ...reports.map((s) => s.id)];
      }
    }
    if (teamIds === null) {
      scope = "all";
    } else if (teamIds.length === 0) {
      facts.push({
        tool: name,
        ok: true,
        data: { message: "No team members in your leave scope.", scope: "team" },
      });
      return finalize();
    } else {
      staffFilter = { staffId: { in: teamIds } };
      scope = "team";
    }
  } else {
    const me = await prisma.staffProfile.findFirst({
      where: { userId: user.id },
      select: { id: true, fullName: true, staffCode: true },
    });
    if (!me) {
      facts.push({
        tool: name,
        ok: true,
        data: { message: "No staff profile linked to your user — cannot load leave." },
      });
      return finalize();
    }
    staffFilter = { staffId: me.id };
    scope = "self";
    leaveSubject = { name: me.fullName, relation: "self", staffCode: me.staffCode };
  }

  // Named person filter when permitted
  if (personHint) {
    const { resolveNovaPersonHint } = await import("@/lib/ai/nova-tools");
    const resolved = await resolveNovaPersonHint(personHint, user);
    if (resolved.kind === "ambiguous" || resolved.kind === "not_found") {
      facts.push({
        tool: name,
        ok: true,
        data: {
          subject: { name: personHint, relation: "other", resolved: false },
          message: resolved.message,
          pendingCount: 0,
          samples: [],
        },
      });
      links.push({ title: "HR / Leave", href: "/attendance-hr/leave" });
      return finalize();
    }
    const p = resolved.person;
    if (p.relation === "other") {
      if (leaveMode === "self") {
        facts.push({
          tool: name,
          ok: false,
          denied: true,
          error: `You can only view your own leave — not ${p.name}'s.`,
          data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
        });
        return finalize();
      }
      if (leaveMode === "team" && p.staffId) {
        const allowed =
          typeof staffFilter.staffId === "object" &&
          Array.isArray(staffFilter.staffId.in) &&
          staffFilter.staffId.in.includes(p.staffId);
        if (!allowed) {
          facts.push({
            tool: name,
            ok: false,
            denied: true,
            error: `You can only view leave for your team — not ${p.name}'s.`,
            data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
          });
          return finalize();
        }
      }
    }
    if (p.staffId) {
      staffFilter = { staffId: p.staffId };
      scope = p.relation === "self" ? "person_self" : "person_other";
      leaveSubject = { name: p.name, relation: p.relation, staffCode: p.staffCode };
    }
  }

  const leavePeriod = range ?? currentIndianFyRange(new Date(), tz);
  const todayStart = novaDayBoundsFor(new Date(), tz).start;
  const leaveDayCount = (from: Date, to: Date, halfDayType: string): number => {
    if (halfDayType && halfDayType !== "NONE") return 0.5;
    const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
    const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
    return Math.max(1, Math.round((b - a) / 86400000) + 1);
  };
  const pendingWhere = { status: "PENDING" as const, ...staffFilter };
  const approvedWhere = {
    status: "APPROVED" as const,
    ...staffFilter,
    fromDate: { lte: leavePeriod.to },
    toDate: { gte: leavePeriod.from },
  };
  const upcomingWhere = {
    status: "APPROVED" as const,
    ...staffFilter,
    fromDate: { gte: todayStart },
  };
  const sampleTake = reportIntent ? rowCap : (sampleLimit ?? 6);
  const [pendingCount, samples, approvedRows, upcomingRows] = await Promise.all([
    prisma.hrLeaveRequest.count({ where: pendingWhere }),
    prisma.hrLeaveRequest.findMany({
      where: pendingWhere,
      orderBy: { updatedAt: "desc" },
      take: sampleTake,
      select: {
        fromDate: true,
        toDate: true,
        status: true,
        reason: true,
        halfDayType: true,
        leaveType: { select: { name: true } },
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
    prisma.hrLeaveRequest.findMany({
      where: approvedWhere,
      select: {
        fromDate: true,
        toDate: true,
        halfDayType: true,
        leaveType: { select: { name: true, paid: true } },
        staff: { select: { fullName: true, staffCode: true } },
      },
      take: 500,
    }),
    prisma.hrLeaveRequest.findMany({
      where: upcomingWhere,
      orderBy: { fromDate: "asc" },
      take: 8,
      select: {
        fromDate: true,
        toDate: true,
        halfDayType: true,
        leaveType: { select: { name: true } },
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
  ]);
  const byType = new Map<string, { type: string; paid: boolean; approvedDays: number; requestCount: number }>();
  let approvedDaysTotal = 0;
  for (const r of approvedRows) {
    const days = leaveDayCount(r.fromDate, r.toDate, r.halfDayType);
    approvedDaysTotal += days;
    const key = r.leaveType.name;
    const cur = byType.get(key) ?? {
      type: key,
      paid: r.leaveType.paid,
      approvedDays: 0,
      requestCount: 0,
    };
    cur.approvedDays += days;
    cur.requestCount += 1;
    byType.set(key, cur);
  }
  const balancesByType = [...byType.values()].sort((a, b) => b.approvedDays - a.approvedDays);
  const leaveTypes = await prisma.hrLeaveType.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      paid: true,
      attendanceEffect: true,
      annualAllowanceDays: true,
      carryForwardMaxDays: true,
      accrualMode: true,
    },
  });

  let entitlementBalances: Awaited<
    ReturnType<typeof import("@/lib/hr/leave-ledger-service").loadLeaveBalancesForStaff>
  > | null = null;
  if (typeof staffFilter.staffId === "string") {
    const { loadLeaveBalancesForStaff } = await import("@/lib/hr/leave-ledger-service");
    const year = getCalendarDateInTimezone(new Date(), tz).year;
    const yearApproved = await prisma.hrLeaveRequest.findMany({
      where: {
        staffId: staffFilter.staffId,
        status: "APPROVED",
        OR: [
          {
            fromDate: {
              gte: new Date(Date.UTC(year - 1, 0, 1)),
              lt: new Date(Date.UTC(year + 1, 0, 1)),
            },
          },
          {
            toDate: {
              gte: new Date(Date.UTC(year - 1, 0, 1)),
              lt: new Date(Date.UTC(year + 1, 0, 1)),
            },
          },
        ],
      },
      select: {
        leaveTypeId: true,
        fromDate: true,
        toDate: true,
        halfDayType: true,
      },
    });
    entitlementBalances = await loadLeaveBalancesForStaff({
      staffId: staffFilter.staffId,
      year,
      types: leaveTypes,
      approvedRequests: yearApproved,
    });
  }

  let monthSnapshot: Record<string, unknown> | null = null;
  if (
    (scope === "self" || scope === "person_self" || scope === "person_other") &&
    typeof staffFilter.staffId === "string"
  ) {
    try {
      const cal = getCalendarDateInTimezone(new Date(), tz);
      const { loadStaffMonthlyHrSnapshot } = await import("@/lib/hr/staff-self-service");
      const snap = await loadStaffMonthlyHrSnapshot(
        staffFilter.staffId,
        cal.year,
        cal.month
      );
      monthSnapshot = {
        year: snap.year,
        month: snap.month,
        leaveRequestsInMonth: snap.leaves.length,
        approvedInMonth: snap.leaves.filter((l) => l.status === "APPROVED").length,
        pendingInMonth: snap.leaves.filter((l) => l.status === "PENDING").length,
        byType: snap.leaves.reduce(
          (acc: Record<string, number>, l) => {
            if (l.status !== "APPROVED") return acc;
            acc[l.leaveTypeName] = (acc[l.leaveTypeName] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        attendanceSummary: {
          presentDays: snap.summary.presentDays,
          absentDays: snap.summary.absentDays,
          paidLeaveDays: snap.summary.paidLeaveDays,
          unpaidLeaveDays: snap.summary.unpaidLeaveDays,
          lateCount: snap.summary.lateCount,
        },
      };
    } catch {
      monthSnapshot = null;
    }
  }

  const approvedDaysUsed = Math.round(approvedDaysTotal * 10) / 10;
  const balancesMapped = balancesByType.map((b) => ({
    type: b.type,
    paid: b.paid,
    approvedDaysUsed: Math.round(b.approvedDays * 10) / 10,
    requestCount: b.requestCount,
  }));
  const sampleMapped = samples.map((r) => ({
    staff: r.staff.fullName,
    code: r.staff.staffCode,
    type: r.leaveType.name,
    from: r.fromDate.toISOString().slice(0, 10),
    to: r.toDate.toISOString().slice(0, 10),
    days: leaveDayCount(r.fromDate, r.toDate, r.halfDayType),
    reason: r.reason.slice(0, 80),
  }));
  const upcomingMapped = upcomingRows.map((r) => ({
    staff: r.staff.fullName,
    code: r.staff.staffCode,
    type: r.leaveType.name,
    from: r.fromDate.toISOString().slice(0, 10),
    to: r.toDate.toISOString().slice(0, 10),
    days: leaveDayCount(r.fromDate, r.toDate, r.halfDayType),
  }));

  const data: Record<string, unknown> = {
    scope,
    subject: leaveSubject,
    personFilter: personHint ?? null,
    period: leavePeriod.label,
    periodSource: range ? "explicit" : "default_fy",
    pendingCount,
    approvedOverlappingPeriod: approvedRows.length,
    approvedDaysUsed,
    leaveTypes: leaveTypes.map((t) => ({
      name: t.name,
      paid: t.paid,
      attendanceEffect: t.attendanceEffect,
      annualAllowanceDays: t.annualAllowanceDays,
      carryForwardMaxDays: t.carryForwardMaxDays,
      accrualMode: t.accrualMode,
    })),
    balancesByType: balancesMapped,
    entitlementBalances: entitlementBalances?.map((b) => ({
      type: b.leaveTypeName,
      attendanceEffect: b.attendanceEffect,
      annualAllowanceDays: b.annualAllowanceDays,
      carriedForwardDays: b.carriedForwardDays,
      usedDays: b.usedDays,
      remainingDays: b.remainingDays,
    })),
    balanceNote: entitlementBalances
      ? "entitlementBalances overlay classic allowance with ledger GRANts (annual, monthly accrual, Comp Off). MONTHLY_ACCRUAL types credit through the current month via EOD. balancesByType is period usage only."
      : "balancesByType shows approved leave days used in the selected period (usage). Ask for a specific person to see remaining entitlement quotas.",
    monthSnapshot,
    upcomingApproved: upcomingMapped,
    samples: sampleMapped,
  };

  links.push({ title: "HR / Leave", href: "/attendance-hr/leave" });
  if (scope === "self" || scope === "person_self") {
    links.push({ title: "My leave", href: "/attendance-hr/leave" });
  }

  if (reportIntent) {
    const typePoints = balancesMapped.slice(0, 8).map((b) => ({
      label: String(b.type).slice(0, 18),
      value: b.approvedDaysUsed,
      unit: "days" as const,
    }));
    const { attachment } = buildSkillReportPack({
      packId: "leave_report",
      reportMode,
      title: "Leave report",
      headline: `${leavePeriod.label}: ${pendingCount} pending · ${approvedDaysUsed} approved days · scope ${scope}`,
      period: {
        label: leavePeriod.label,
        grain: "fy",
        calendarKind: "financial_year",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "leave.pending_count",
          version: "1",
          certification: "draft",
          value: pendingCount,
          display: `${pendingCount} pending`,
          periodLabel: leavePeriod.label,
        },
        {
          metricId: "leave.approved_days",
          version: "1",
          certification: "draft",
          value: approvedDaysUsed,
          display: `${approvedDaysUsed} days`,
          periodLabel: leavePeriod.label,
        },
        {
          metricId: "leave.approved_requests",
          version: "1",
          certification: "draft",
          value: approvedRows.length,
          display: `${approvedRows.length} approved requests`,
          periodLabel: leavePeriod.label,
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["leave.approved_days"],
          title: "Approved days by leave type",
          points: typePoints,
        },
      ],
      tables: [
        {
          id: "leave_by_type",
          title: "Approved usage by type",
          columns: ["Type", "Paid", "Days", "Requests"],
          rows: balancesMapped.map((b) => [
            reportCell(b.type),
            b.paid ? "paid" : "unpaid",
            reportCell(b.approvedDaysUsed),
            reportCell(b.requestCount),
          ]),
        },
        {
          id: "leave_pending",
          title: "Pending leave",
          columns: ["Staff", "Code", "Type", "From", "To", "Days"],
          rows: sampleMapped.map((s) => [
            reportCell(s.staff),
            reportCell(s.code),
            reportCell(s.type),
            reportCell(s.from),
            reportCell(s.to),
            reportCell(s.days),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        `Self/team/all leave scope is preserved (scope=${scope}); report intent does not widen ACL.`,
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
