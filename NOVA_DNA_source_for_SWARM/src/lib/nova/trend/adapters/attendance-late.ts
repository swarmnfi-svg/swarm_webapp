/**
 * Adapter — attendance late frequency over a bound window.
 * Uses the same credible-late rules as attendance_late_summary / register.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { attendanceDateQueryValues, pickAttendanceRowForDay } from "@/lib/hr/attendance-date-repair";
import { isCredibleLateDay } from "@/lib/hr/register-recalc";
import { hrTeamStaffIdsForUser } from "@/lib/hr/team-scope";
import {
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
} from "@/lib/nova/trend/contract";
import {
  bindNovaTrendWindow,
  formatBucketKey,
  inferNovaTrendGrain,
  novaTrendPrismaDays,
} from "@/lib/nova/trend/window";
import { buildNovaTrendSeries, rankNovaTrendEntities } from "@/lib/nova/trend/rank";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";

export type TrendLoadOk = { ok: true; bundle: NovaTrendBundle };
export type TrendLoadFail =
  | { ok: false; denied: true; error: string }
  | { ok: false; empty: true; bundle: NovaTrendBundle };

export async function loadAttendanceLateTrend(
  ctx: NovaSkillHandlerContext
): Promise<TrendLoadOk | TrendLoadFail> {
  const { user, query, tz, range, personHint } = ctx;
  const canTeam = can(user, "hr.attendance.team");
  const canAll = can(user, "hr.attendance.read");
  const canSelf = can(user, "hr.punch.self");
  if (!canTeam && !canAll && !canSelf) {
    return {
      ok: false,
      denied: true,
      error: "Missing hr.attendance.team / hr.attendance.read / hr.punch.self",
    };
  }

  const window = bindNovaTrendWindow(query, { range, tz });
  const grain = inferNovaTrendGrain(window.from, window.to);
  const links = [{ title: "Attendance HR", href: "/attendance-hr" }];

  let staffFilter: { staffId?: string | { in: string[] } } = {};
  let entityLabel = "Organisation";

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
    if (!exact) {
      const empty: NovaTrendBundle = {
        schemaVersion: NOVA_TREND_SCHEMA_VERSION,
        domain: "attendance_late",
        entity: { kind: "person", label: personHint },
        metric: { id: "late_days", label: "Late days", unit: "late day(s)" },
        window,
        grain,
        series: [],
        rankings: [],
        links,
        empty: true,
        message:
          staffMatches.length > 1
            ? `Several people match “${personHint}”. Reply with full name or staff code.`
            : `No staff member matching “${personHint}” was found.`,
      };
      return { ok: false, empty: true, bundle: empty };
    }
    // Parity with attendance_late_summary — self-only staff must not pull peers’ late trends.
    const isSelf = exact.userId === user.id;
    const canSeeOther = canAll || canTeam;
    if (!isSelf && !canSeeOther) {
      return {
        ok: false,
        denied: true,
        error: `You can only view your own attendance — not ${exact.fullName}'s.`,
      };
    }
    if (!isSelf && canTeam && !canAll) {
      const teamIds = await hrTeamStaffIdsForUser(user, user.id, { for: "attendance" });
      if (Array.isArray(teamIds) && !teamIds.includes(exact.id)) {
        return {
          ok: false,
          denied: true,
          error: `${exact.fullName} is outside your team attendance scope.`,
        };
      }
    }
    staffFilter = { staffId: exact.id };
    entityLabel = exact.fullName;
  } else if (canAll) {
    staffFilter = {};
  } else if (canTeam) {
    const teamIds = await hrTeamStaffIdsForUser(user, user.id, { for: "attendance" });
    if (Array.isArray(teamIds) && teamIds.length === 0) {
      const empty: NovaTrendBundle = {
        schemaVersion: NOVA_TREND_SCHEMA_VERSION,
        domain: "attendance_late",
        entity: { kind: "org", label: "Team" },
        metric: { id: "late_days", label: "Late days", unit: "late day(s)" },
        window,
        grain,
        series: [],
        rankings: [],
        links,
        empty: true,
        message: "No team members in scope for attendance trend.",
      };
      return { ok: false, empty: true, bundle: empty };
    }
    if (Array.isArray(teamIds)) {
      staffFilter = { staffId: { in: teamIds } };
      entityLabel = "Team";
    }
  } else {
    const me = await prisma.staffProfile.findFirst({
      where: { userId: user.id },
      select: { id: true, fullName: true },
    });
    if (!me) {
      return {
        ok: false,
        empty: true,
        bundle: {
          schemaVersion: NOVA_TREND_SCHEMA_VERSION,
          domain: "attendance_late",
          entity: { kind: "person", label: user.name ?? "You" },
          metric: { id: "late_days", label: "Late days", unit: "late day(s)" },
          window,
          grain,
          series: [],
          rankings: [],
          links,
          empty: true,
          message: "No staff profile linked — cannot load attendance trend.",
        },
      };
    }
    staffFilter = { staffId: me.id };
    entityLabel = me.fullName;
  }

  const prismaDays = novaTrendPrismaDays(window, tz);
  const dateQueryValues = [
    ...new Map(
      prismaDays.flatMap((d) => attendanceDateQueryValues(d, tz)).map((d) => [d.getTime(), d])
    ).values(),
  ];

  const rawDaily = await prisma.hrAttendanceDaily.findMany({
    where: {
      ...staffFilter,
      date: { in: dateQueryValues },
    },
    select: {
      staffId: true,
      date: true,
      status: true,
      lateMinutes: true,
      punchInTime: true,
      punchOutTime: true,
      staff: { select: { staffCode: true, fullName: true, department: true } },
    },
    take: 8000,
  });

  const lateEvents: {
    staffId: string;
    name: string;
    code: string;
    dept: string | null;
    at: Date;
  }[] = [];
  for (const day of prismaDays) {
    for (const row of pickAttendanceRowForDay(rawDaily, day, tz)) {
      if (!isCredibleLateDay(row.status, row.lateMinutes)) continue;
      lateEvents.push({
        staffId: row.staffId,
        name: row.staff.fullName,
        code: row.staff.staffCode,
        dept: row.staff.department,
        at: day,
      });
    }
  }

  const byStaff = new Map<
    string,
    { name: string; code: string; dept: string | null; days: number }
  >();
  for (const e of lateEvents) {
    const cur = byStaff.get(e.staffId) ?? {
      name: e.name,
      code: e.code,
      dept: e.dept,
      days: 0,
    };
    cur.days += 1;
    byStaff.set(e.staffId, cur);
  }

  const rankings = rankNovaTrendEntities(
    [...byStaff.entries()].map(([id, v]) => ({
      entityId: id,
      label: v.name,
      value: v.days,
      secondary: v.code || v.dept,
    }))
  );

  const series = buildNovaTrendSeries(
    lateEvents.map((e) => e.at),
    (d) => formatBucketKey(d, grain, tz)
  );

  const bundle: NovaTrendBundle = {
    schemaVersion: NOVA_TREND_SCHEMA_VERSION,
    domain: "attendance_late",
    entity: {
      kind: personHint ? "person" : "org",
      label: entityLabel,
    },
    metric: { id: "late_days", label: "Late days", unit: "late day(s)" },
    window,
    grain,
    series,
    rankings,
    methodology:
      "Credible late punch-days from HrAttendanceDaily (same register rules as attendance_late_summary).",
    links,
    empty: rankings.length === 0,
    message:
      rankings.length === 0 ? `No credible late punches in ${window.label}.` : null,
  };

  return { ok: true, bundle };
}
