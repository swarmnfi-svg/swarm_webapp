/**
 * HR skill — attendance_late_summary (late / present / absent).
 * Names and punch times must come from this fact pack; late lists prefer deterministic formatter.
 *
 * Aggregation must match the attendance register:
 * - present = PRESENT_REGISTER_STATUSES (includes MISSING_PUNCH_OUT open visits)
 * - absent = ABSENT_REGISTER_STATUSES (+ legacy ABSENT)
 * - late = present-like day with credible lateMinutes (incl. open MPO; not HALF_DAY residual; not stale >8h)
 */
import type { Prisma } from "@prisma/client";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import {
  formatTimeOnly,
  getCalendarDateInTimezone,
  prismaDateFromCalendar,
} from "@/lib/datetime-pure";
import {
  parseNovaDateRange,
  isNovaSingleDayRange,
  novaDayBoundsFor,
} from "@/lib/ai/nova-dates";
import { PUNCH_OUT_CUE } from "@/lib/ai/nova-intent";
import { hrTeamStaffIdsForUser } from "@/lib/hr/team-scope";
import {
  attendanceDateQueryValues,
  pickAttendanceRowForDay,
} from "@/lib/hr/attendance-date-repair";
import {
  ABSENT_REGISTER_STATUSES,
  PRESENT_REGISTER_STATUSES,
} from "@/lib/hr/attendance-status";
import {
  STALE_LATE_MINUTES,
  isCredibleLateDay,
} from "@/lib/hr/register-recalc";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const PRESENT_STATUS_SET = new Set<string>(PRESENT_REGISTER_STATUSES);
const ABSENT_STATUS_SET = new Set<string>([...ABSENT_REGISTER_STATUSES, "ABSENT"]);

/** Present punch-day on the register (same set as /attendance-hr). */
export function isNovaPresentAttendanceStatus(status: string | null | undefined): boolean {
  return status != null && PRESENT_STATUS_SET.has(status);
}

/** Product absent / didn’t punch (MISSING_PUNCH_IN + unpaid leave; legacy ABSENT). */
export function isNovaAbsentAttendanceStatus(status: string | null | undefined): boolean {
  return status != null && ABSENT_STATUS_SET.has(status);
}

/** Credible late — shared with register / dashboard (`isCredibleLateDay`). */
export function isNovaCredibleLateDay(
  status: string | null | undefined,
  lateMinutes: number
): boolean {
  return isCredibleLateDay(status, lateMinutes);
}

/** Prisma `@db.Date` values for each calendar day in [from, to] (app timezone). */
function novaAttendancePrismaDays(periodFrom: Date, periodTo: Date, tz: string): Date[] {
  const start = prismaDateFromCalendar(getCalendarDateInTimezone(periodFrom, tz));
  const end = prismaDateFromCalendar(getCalendarDateInTimezone(periodTo, tz));
  const days: Date[] = [];
  for (let cur = new Date(start); cur.getTime() <= end.getTime(); ) {
    days.push(new Date(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1));
  }
  return days.length ? days : [start];
}

function finalizeFrom(
  facts: NovaSkillHandlerResult["fact"][],
  links: NovaToolLink[]
): NovaSkillHandlerResult {
  const fact = facts[facts.length - 1]!;
  if (fact?.ok && fact.data) {
    return {
      fact: {
        ...fact,
        data: withFactProvenance(fact.data, {
          period: typeof fact.data.period === "string" ? fact.data.period : null,
          sources: ["hr_attendance_daily"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runAttendanceLateSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, tz, range, personHint, sampleLimit } = ctx;
  const name = "attendance_late_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  const canTeam = can(user, "hr.attendance.team");
  const canAll = can(user, "hr.attendance.read");
  const canSelf = can(user, "hr.punch.self");
  if (!canTeam && !canAll && !canSelf) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing hr.attendance.team / hr.attendance.read / hr.punch.self",
    });
    return finalize();
  }
  // Prefer explicit range; never silent-month. Bare asks should clarify upstream;
  // last-resort default is today (daily ops), not current month.
  const period = range ?? parseNovaDateRange("today", new Date(), tz)!;
  const periodGrain = isNovaSingleDayRange(period)
    ? "day"
    : /\bweek\b/i.test(period.label) || /[–—]/.test(period.label)
      ? "week"
      : "month";
  const periodSource = range ? "explicit" : "default_today";
  const fromDay = novaDayBoundsFor(period.from, tz).start;
  const toDay = novaDayBoundsFor(period.to, tz).start;
  const qAtt = query.toLowerCase();
  // Punch-out before absent/present — “punch out time” must not fall through to overview/late.
  const wantsPunchOut = PUNCH_OUT_CUE.test(qAtt);
  const wantsAbsent =
    !wantsPunchOut &&
    /\b(absent|absentee|absentees|who\s+was\s+absent|who\s+is\s+absent|didn'?t\s+punch|did\s+not\s+punch|hasn'?t\s+punch|haven'?t\s+punch|not\s+punched|missing\s+punch|no\s+punch|who\s+(?:didn'?t|did\s+not|hasn'?t|haven'?t|have\s+not)\s+(?:punch|come))\b/.test(
      qAtt
    );
  // Late before present so “who punched late” stays late focus (not punch-in list).
  const wantsExplicitLate =
    !wantsAbsent &&
    !wantsPunchOut &&
    /\b(late\s*comers?|latecomers|who\s+(?:is|was|were)\s+late|came\s+late|late\s+minutes|most\s+late|punched?\s+(?:in\s+)?late|\blate\b)/.test(
      qAtt
    );
  const wantsPresent =
    !wantsAbsent &&
    !wantsExplicitLate &&
    !wantsPunchOut &&
    /\b(present|who\s+was\s+present|who\s+is\s+present|was\s+\w+\s+present|is\s+\w+\s+present|did\s+\w+\s+punch|has\s+\w+\s+punch|have\s+\w+\s+punch|who\s+punched|punch(?:ed)?\s+in|punch(?:es|ing)?\s+times?|punch\s+i(?:n)?\s+times?|did\s+\w+\s+come|has\s+\w+\s+come|came\s+today|show(?:ed)?\s+up)\b/.test(
      qAtt
    );

  let staffFilter: { staffId?: string | { in: string[] } } = {};
  let scope: "all_staff" | "team" | "self" | "person_other" | "person_self" = "all_staff";
  let attendanceSubject: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } | null = null;

  // Named person (e.g. "Zeeshan's attendance") — filter to them when RBAC allows
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
    if (!exact && staffMatches.length > 1) {
      facts.push({
        tool: name,
        ok: true,
        data: {
          period: period.label,
          periodGrain,
          subject: { name: personHint, relation: "other", resolved: false },
          message: `Several people match “${personHint}”: ${staffMatches
            .slice(0, 5)
            .map((s) => `${s.fullName}${s.staffCode ? ` (${s.staffCode})` : ""}`)
            .join("; ")}. Reply with the full name or staff code.`,
          lateDayCount: 0,
        },
      });
      links.push({ title: "Attendance HR", href: "/attendance-hr" });
    return finalize();
    }
    if (!exact) {
      facts.push({
        tool: name,
        ok: true,
        data: {
          period: period.label,
          periodGrain,
          subject: { name: personHint, relation: "other", resolved: false },
          message: `No staff member matching “${personHint}” was found.`,
          lateDayCount: 0,
        },
      });
      links.push({ title: "Attendance HR", href: "/attendance-hr" });
    return finalize();
    }
    const isSelf = exact.userId === user.id;
    const canSeeOther = canAll || canTeam;
    if (!isSelf && !canSeeOther) {
      facts.push({
        tool: name,
        ok: false,
        denied: true,
        error: `You can only view your own attendance — not ${exact.fullName}'s.`,
        data: { subject: { name: exact.fullName, relation: "other" } },
      });
    return finalize();
    }
    if (!isSelf && canTeam && !canAll) {
      const teamIds = await hrTeamStaffIdsForUser(user, user.id, { for: "attendance" });
      if (Array.isArray(teamIds) && !teamIds.includes(exact.id)) {
        facts.push({
          tool: name,
          ok: false,
          denied: true,
          error: `${exact.fullName} is outside your team attendance scope.`,
          data: { subject: { name: exact.fullName, relation: "other" } },
        });
    return finalize();
      }
    }
    staffFilter = { staffId: exact.id };
    scope = isSelf ? "person_self" : "person_other";
    attendanceSubject = {
      name: exact.fullName,
      relation: isSelf ? "self" : "other",
      staffCode: exact.staffCode,
    };
  } else if (canAll) {
    staffFilter = {};
    scope = "all_staff";
  } else if (canTeam) {
    const teamIds = await hrTeamStaffIdsForUser(user, user.id, { for: "attendance" });
    if (Array.isArray(teamIds) && teamIds.length === 0) {
      facts.push({
        tool: name,
        ok: true,
        data: {
          period: period.label,
          message: "No team members in your attendance scope.",
          lateDayCount: 0,
          topLateComers: [],
          topAbsent: [],
          topPresent: [],
        },
      });
      links.push({ title: "Attendance HR", href: "/attendance-hr" });
    return finalize();
    }
    if (Array.isArray(teamIds)) {
      staffFilter = { staffId: { in: teamIds } };
      scope = "team";
    }
  } else {
    const me = await prisma.staffProfile.findFirst({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!me) {
      facts.push({
        tool: name,
        ok: true,
        data: {
          period: period.label,
          message: "No staff profile linked — cannot load your attendance.",
          lateDayCount: 0,
        },
      });
      links.push({ title: "My attendance", href: "/attendance-hr/my-attendance" });
    return finalize();
    }
    staffFilter = { staffId: me.id };
    scope = "self";
  }

  // Use register-style `@db.Date` values + pickAttendanceRowForDay so IST “today”
  // never pulls yesterday’s punch via timezone-bound gte/lte cast to DATE.
  const prismaDays = novaAttendancePrismaDays(period.from, period.to, tz);
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
      earlyMinutes: true,
      overtimeMinutes: true,
      punchInTime: true,
      punchOutTime: true,
      staff: { select: { staffCode: true, fullName: true, department: true } },
    },
    take: 2000,
  });

  type DailyRow = (typeof rawDaily)[number] & { calendarDate: Date };
  const dayRows: DailyRow[] = [];
  for (const day of prismaDays) {
    for (const row of pickAttendanceRowForDay(rawDaily, day, tz)) {
      dayRows.push({ ...row, calendarDate: day });
    }
  }

  const staleLateRows = dayRows.filter((r) => r.lateMinutes > STALE_LATE_MINUTES);
  const lateRows = dayRows.filter((r) => isNovaCredibleLateDay(r.status, r.lateMinutes));

  const byStaff = new Map<
    string,
    {
      staffId: string;
      name: string;
      code: string;
      department: string | null;
      lateDays: number;
      totalLateMinutes: number;
      /** Punch-in instants for late days (single-day lists use the first). */
      punchInTimes: Date[];
      /** Calendar day (prisma date) for each late punch — must match period for single-day. */
      lateDates: Date[];
    }
  >();
  for (const row of lateRows) {
    const cur = byStaff.get(row.staffId) ?? {
      staffId: row.staffId,
      name: row.staff.fullName,
      code: row.staff.staffCode,
      department: row.staff.department,
      lateDays: 0,
      totalLateMinutes: 0,
      punchInTimes: [],
      lateDates: [],
    };
    cur.lateDays += 1;
    cur.totalLateMinutes += row.lateMinutes;
    if (row.punchInTime) cur.punchInTimes.push(row.punchInTime);
    cur.lateDates.push(row.calendarDate);
    byStaff.set(row.staffId, cur);
  }

  const ranked = [...byStaff.values()].sort(
    (a, b) => b.totalLateMinutes - a.totalLateMinutes || b.lateDays - a.lateDays
  );
  const top = ranked.slice(0, 8);
  const singleDayLate = periodGrain === "day";
  const periodDayKey =
    singleDayLate && prismaDays[0] ? prismaDays[0].toISOString().slice(0, 10) : null;
  const latePersonPayload = (p: (typeof top)[number]) => {
    const base = {
      name: p.name,
      code: p.code,
      department: p.department,
      lateDays: p.lateDays,
      totalLateMinutes: p.totalLateMinutes,
      date: p.lateDates[0]?.toISOString().slice(0, 10) ?? null,
    };
    if (!singleDayLate) return base;
    // Guard: never surface a punch whose calendar day ≠ requested day
    if (periodDayKey && base.date && base.date !== periodDayKey) {
      return { ...base, lateMinutes: 0, punchInTime: null, punchInLabel: null, skippedWrongDay: true };
    }
    const punch = p.punchInTimes[0] ?? null;
    if (punch) {
      const punchDay = prismaDateFromCalendar(getCalendarDateInTimezone(punch, tz))
        .toISOString()
        .slice(0, 10);
      if (periodDayKey && punchDay !== periodDayKey) {
        return { ...base, lateMinutes: 0, punchInTime: null, punchInLabel: null, skippedWrongDay: true };
      }
    }
    return {
      ...base,
      lateMinutes: p.totalLateMinutes,
      punchInTime: punch?.toISOString() ?? null,
      punchInLabel: punch ? formatTimeOnly(punch, tz) : null,
    };
  };

  const presentRows = dayRows.filter((r) => isNovaPresentAttendanceStatus(r.status));
  const absentRows = dayRows.filter((r) => isNovaAbsentAttendanceStatus(r.status));

  const rankByCount = (
    rows: { staffId: string; staff: { fullName: string; staffCode: string; department: string | null } }[]
  ) => {
    const map = new Map<
      string,
      { name: string; code: string; department: string | null; days: number }
    >();
    for (const r of rows) {
      const cur = map.get(r.staffId) ?? {
        name: r.staff.fullName,
        code: r.staff.staffCode,
        department: r.staff.department,
        days: 0,
      };
      cur.days += 1;
      map.set(r.staffId, cur);
    }
    return [...map.values()].sort((a, b) => b.days - a.days).slice(0, 8);
  };

  /** Single-day punch list: name + in/out times (register truth, incl. open MPO). */
  const topPresentDay = singleDayLate
    ? [...presentRows]
        .sort((a, b) => {
          if (wantsPunchOut) {
            const oa = a.punchOutTime?.getTime() ?? Number.POSITIVE_INFINITY;
            const ob = b.punchOutTime?.getTime() ?? Number.POSITIVE_INFINITY;
            // Open visits (no out) first, then by out time / in time.
            const aOpen = a.punchOutTime == null ? 0 : 1;
            const bOpen = b.punchOutTime == null ? 0 : 1;
            if (aOpen !== bOpen) return aOpen - bOpen;
            if (aOpen === 1 && oa !== ob) return oa - ob;
            const ta = a.punchInTime?.getTime() ?? Number.POSITIVE_INFINITY;
            const tb = b.punchInTime?.getTime() ?? Number.POSITIVE_INFINITY;
            return ta - tb || a.staff.fullName.localeCompare(b.staff.fullName);
          }
          const ta = a.punchInTime?.getTime() ?? Number.POSITIVE_INFINITY;
          const tb = b.punchInTime?.getTime() ?? Number.POSITIVE_INFINITY;
          return ta - tb || a.staff.fullName.localeCompare(b.staff.fullName);
        })
        .slice(0, 12)
        .map((r) => {
          const lateMin =
            r.lateMinutes > 0 && r.lateMinutes <= STALE_LATE_MINUTES ? r.lateMinutes : 0;
          return {
            name: r.staff.fullName,
            code: r.staff.staffCode,
            department: r.staff.department,
            presentDays: 1,
            status: r.status,
            lateMinutes: lateMin,
            isLate: isNovaCredibleLateDay(r.status, r.lateMinutes),
            punchInTime: r.punchInTime?.toISOString() ?? null,
            punchInLabel: r.punchInTime ? formatTimeOnly(r.punchInTime, tz) : null,
            punchOutTime: r.punchOutTime?.toISOString() ?? null,
            punchOutLabel: r.punchOutTime ? formatTimeOnly(r.punchOutTime, tz) : null,
          };
        })
    : null;
  const topPresent = topPresentDay ?? rankByCount(presentRows).map((p) => ({
    ...p,
    presentDays: p.days,
    status: null as string | null,
    lateMinutes: 0,
    isLate: false,
    punchInTime: null as string | null,
    punchInLabel: null as string | null,
    punchOutTime: null as string | null,
    punchOutLabel: null as string | null,
  }));
  const topAbsent = rankByCount(absentRows);
  const presentDays = presentRows.length;
  const absentDays = absentRows.length;

  const topLateComers = top
    .map((p) => latePersonPayload(p))
    .filter((p) => !("skippedWrongDay" in p && p.skippedWrongDay));

  // Named person + single day → always build register status (presence source of truth).
  // Named person + present/absent/punch ask (or bare “X attendance”) → focus present/absent,
  // never the late list as a proxy for “did they punch”.
  let subjectAttendance: Record<string, unknown> | null = null;
  if (attendanceSubject && singleDayLate && staffFilter.staffId && typeof staffFilter.staffId === "string") {
    const row = dayRows.find((r) => r.staffId === staffFilter.staffId);
    const status = row?.status ?? null;
    const lateMinutes = row?.lateMinutes ?? 0;
    const isPresent = isNovaPresentAttendanceStatus(status);
    const isAbsent = !row || isNovaAbsentAttendanceStatus(status);
    const isLate = isNovaCredibleLateDay(status, lateMinutes);
    subjectAttendance = {
      name: attendanceSubject.name,
      staffCode: attendanceSubject.staffCode,
      date: periodDayKey,
      status,
      lateMinutes: lateMinutes > STALE_LATE_MINUTES ? 0 : lateMinutes,
      earlyMinutes: row?.earlyMinutes ?? 0,
      overtimeMinutes: row?.overtimeMinutes ?? 0,
      punchInTime: row?.punchInTime?.toISOString() ?? null,
      punchInLabel: row?.punchInTime ? formatTimeOnly(row.punchInTime, tz) : null,
      punchOutTime: row?.punchOutTime?.toISOString() ?? null,
      punchOutLabel: row?.punchOutTime ? formatTimeOnly(row.punchOutTime, tz) : null,
      isPresent,
      isAbsent,
      isLate,
      staleLateExcluded: lateMinutes > STALE_LATE_MINUTES,
    };
  }

  // Resolve focus: named-person day status beats late default; didn’t-punch → absent.
  // Bare “attendance” (no late/absent/present cue) → overview, not late list.
  // Punch-out asks stay punch_out even for named person (show out / MPO, not late list).
  let attendanceFocus: "late" | "absent" | "present" | "overview" | "punch_out" = wantsPunchOut
    ? "punch_out"
    : wantsAbsent
      ? "absent"
      : wantsPresent
        ? "present"
        : wantsExplicitLate
          ? "late"
          : "overview";
  if (wantsPunchOut) {
    attendanceFocus = "punch_out";
  } else if (subjectAttendance && !wantsExplicitLate) {
    attendanceFocus = wantsAbsent ? "absent" : "present";
  } else if (wantsAbsent) {
    attendanceFocus = "absent";
  } else if (wantsPresent) {
    attendanceFocus = "present";
  } else if (wantsExplicitLate) {
    attendanceFocus = "late";
  }

  // Who didn’t punch: include ACTIVE staff with no daily row (not yet recalculated).
  let topAbsentFinal = topAbsent.map((p) => ({
    name: p.name,
    code: p.code,
    department: p.department,
    absentDays: p.days,
  }));
  let absentDaysFinal = absentDays;
  if (attendanceFocus === "absent" && periodGrain === "day" && !personHint) {
    const activeWhere: Prisma.StaffProfileWhereInput = {
      employmentStatus: "ACTIVE",
      ...(typeof staffFilter.staffId === "string"
        ? { id: staffFilter.staffId }
        : staffFilter.staffId && "in" in staffFilter.staffId
          ? { id: { in: staffFilter.staffId.in } }
          : {}),
    };
    const activeStaff = await prisma.staffProfile.findMany({
      where: activeWhere,
      select: { id: true, fullName: true, staffCode: true, department: true },
      take: 500,
    });
    const haveRow = new Set(dayRows.map((r) => r.staffId));
    const noRow = activeStaff.filter((s) => !haveRow.has(s.id));
    if (noRow.length) {
      const merged = new Map(
        topAbsentFinal.map((p) => [p.code || p.name, p] as const)
      );
      for (const s of noRow) {
        const key = s.staffCode || s.fullName;
        if (!merged.has(key)) {
          merged.set(key, {
            name: s.fullName,
            code: s.staffCode,
            department: s.department,
            absentDays: 1,
          });
        }
      }
      topAbsentFinal = [...merged.values()].sort((a, b) => b.absentDays - a.absentDays).slice(0, 12);
      absentDaysFinal = absentDays + noRow.length;
    }
  }

  facts.push({
    tool: name,
    ok: true,
    data: (() => {
      const data = {
        period: period.label,
        periodGrain,
        periodSource,
        from: prismaDays[0]?.toISOString().slice(0, 10) ?? fromDay.toISOString().slice(0, 10),
        to:
          prismaDays[prismaDays.length - 1]?.toISOString().slice(0, 10) ??
          toDay.toISOString().slice(0, 10),
        scope,
        subject: attendanceSubject,
        subjectAttendance,
        focus: attendanceFocus,
        lateDayCount: periodGrain === "day" ? (topLateComers.length > 0 ? 1 : 0) : lateRows.length,
        sampleCap: 5000,
        sampleCapped: rawDaily.length >= 5000,
        staleLateExcludedDays: staleLateRows.length,
        note: (() => {
          const bits: string[] = [];
          if (rawDaily.length >= 5000) {
            bits.push("Showing first 5000 attendance rows for this period; totals may be incomplete.");
          }
          if (staleLateRows.length > 0) {
            bits.push(
              `Excluded ${staleLateRows.length} day(s) with lateMinutes > ${STALE_LATE_MINUTES} (stale/wrong-shift data; see register recalc).`
            );
          }
          bits.push(
            "Present/late use register PRESENT statuses (includes open MISSING_PUNCH_OUT visits). Late requires credible lateMinutes ≤ 8h on a present-like day — open visits that arrived late count. Half-day residual lateMinutes are not late comers. Absent days count only MISSING_PUNCH_IN / unpaid leave rows on the register — missing rows are not invented for week/month overview. Prefer monthly roll for payroll present days."
          );
          if (scope === "self" || scope === "person_self") {
            bits.push("Your own attendance (punch.self). Open My attendance for the full register.");
          } else if (scope === "person_other" && attendanceSubject) {
            bits.push(
              `Attendance for ${attendanceSubject.name} (not the session user). Speak in third person about them. Use subjectAttendance.status — MISSING_PUNCH_IN / ABSENT / null punchInTime means not present; never say present from a late list alone.`
            );
          } else if (periodGrain === "day") {
            bits.push(
              wantsPunchOut
                ? "Single-day punch-out list. Use topPresent.punchOutLabel when set; MISSING_PUNCH_OUT / null out → no punch out yet with punchInLabel. Do not answer with late minutes."
                : "Single-day attendance. For person/punch/present/absent asks use subjectAttendance. Late list is only for late focus. Absent includes MISSING_PUNCH_IN and staff with no row."
            );
          }
          return bits.join(" ");
        })(),
        peopleWithLate: topLateComers.length,
        latePeopleCount: topLateComers.length,
        presentPunchDays: presentDays,
        absentDays: absentDaysFinal,
        mostLate:
          topLateComers[0] != null
            ? {
                ...topLateComers[0],
                avgLateMinutes: Math.round(
                  Number(topLateComers[0].totalLateMinutes ?? 0) /
                    Math.max(1, Number((topLateComers[0] as { lateDays?: number }).lateDays ?? 1))
                ),
              }
            : null,
        topLateComers,
        topAbsent: topAbsentFinal,
        topPresent: topPresent.map((p) => ({
          name: p.name,
          code: p.code,
          department: p.department,
          presentDays: p.presentDays,
          status: p.status,
          lateMinutes: p.lateMinutes,
          isLate: p.isLate,
          punchInTime: p.punchInTime,
          punchInLabel: p.punchInLabel,
          punchOutTime: p.punchOutTime,
          punchOutLabel: p.punchOutLabel,
        })),
        mostAbsent: topAbsentFinal[0]
          ? {
              name: topAbsentFinal[0].name,
              code: topAbsentFinal[0].code,
              absentDays: topAbsentFinal[0].absentDays,
            }
          : null,
      };
      const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
      if (!reportIntent) return data;
      const lateChart = topLateComers.slice(0, 8).map((p) => ({
        label: String(p.name ?? "Staff").slice(0, 18),
        value: Number(
          (p as { totalLateMinutes?: number; lateMinutes?: number }).totalLateMinutes ??
            (p as { lateMinutes?: number }).lateMinutes ??
            0
        ),
        unit: "minutes" as const,
      }));
      const { attachment } = buildSkillReportPack({
        packId: "attendance_late_report",
        reportMode,
        title: "Attendance / latecomers report",
        headline: `${period.label} · late ${topLateComers.length} · present days ${presentDays} · absent ${absentDaysFinal} · scope ${scope}`,
        period: {
          label: period.label,
          grain:
            periodGrain === "day" || periodGrain === "week" || periodGrain === "month" || periodGrain === "fy"
              ? periodGrain
              : "day",
          calendarKind: periodGrain === "day" ? "day" : "calendar_month",
          source: range ? "explicit" : "default",
        },
        metrics: [
          {
            metricId: "attendance.late_people",
            version: "1",
            certification: "draft",
            value: topLateComers.length,
            display: `${topLateComers.length} late`,
          },
          {
            metricId: "attendance.present_days",
            version: "1",
            certification: "draft",
            value: presentDays,
            display: `${presentDays} present days`,
          },
          {
            metricId: "attendance.absent_days",
            version: "1",
            certification: "draft",
            value: absentDaysFinal,
            display: `${absentDaysFinal} absent`,
          },
        ],
        charts: [
          {
            bindingId: "ageing_or_attention",
            metricIds: ["attendance.late_people"],
            title: "Late minutes by person",
            points: lateChart,
          },
        ],
        tables: [
          {
            id: "latecomers",
            title: "Latecomers",
            columns: ["Name", "Code", "Dept", "Late min"],
            rows: topLateComers.slice(0, 24).map((p) => [
              reportCell(p.name),
              reportCell(p.code),
              reportCell(p.department),
              reportCell(
                (p as { totalLateMinutes?: number; lateMinutes?: number }).totalLateMinutes ??
                  (p as { lateMinutes?: number }).lateMinutes
              ),
            ]),
          },
        ],
        facts: [{ tool: name, ok: true, data }],
        links: [
          {
            title: scope === "self" ? "My attendance" : "Attendance register",
            href: scope === "self" ? "/attendance-hr/my-attendance" : "/attendance-hr",
          },
        ],
        omittedNotes: ["Self/team/all attendance scope is preserved; report intent does not widen ACL."],
      });
      return withSkillReportAttachment(data, attachment);
    })(),
  });
  links.push({
    title: scope === "self" ? "My attendance" : "Attendance register",
    href: scope === "self" ? "/attendance-hr/my-attendance" : "/attendance-hr",
  });
  return finalize();
}
