/**
 * Adapter — KPI score trajectory across periods (KpiReview.totalScore SoT).
 * Modes:
 *  - person: score series for a named / self user
 *  - streak: rank who held high KPI (≥75 Good+) the longest trailing streak
 *  - org default: avg series + prefer streak when cue asks; else score drops / latest
 * Same ACL as Staff report card / canViewKpiScorecard.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { canViewKpiScorecard } from "@/lib/kpi/scorecard";
import { kpiTeamUserIdsForUser } from "@/lib/kpi/team-scope";
import {
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
} from "@/lib/nova/trend/contract";
import { bindNovaTrendWindow } from "@/lib/nova/trend/window";
import { rankNovaTrendEntities } from "@/lib/nova/trend/rank";
import type { TrendLoadFail, TrendLoadOk } from "@/lib/nova/trend/adapters/attendance-late";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";

/** Aligns with KPI “Good” band floor (score.ts). */
export const KPI_HIGH_SCORE_FLOOR = 75;

/** KPI periods are monthly/quarterly — stretch default 30d to last ~6 months. */
export function kpiTrendWindowDays(source: string): number | null {
  if (source === "default_30d") return 180;
  return null;
}

/** True when the user asks for sustained high performers / longest high streak. */
export function wantsKpiHighStreak(query: string): boolean {
  const q = query.trim();
  return (
    /\bstreak\b/i.test(q) ||
    /\bsustained\b/i.test(q) ||
    /\blong(?:est)?\s+high\b/i.test(q) ||
    (/\bhigh\s+kpi\b/i.test(q) &&
      /\b(long|longest|streak|always|consistently|sustained)\b/i.test(q)) ||
    /\bwho\s+(?:has|had|stayed|kept)\s+high\s+kpi\b/i.test(q) ||
    (/\bhigh\s+performers?\b/i.test(q) && /\b(kpi|streak|long|sustained)\b/i.test(q))
  );
}

/**
 * Trailing consecutive periods (chronological ascending) with score ≥ floor.
 * Returns streak length ending at the last period (0 if last score is below floor).
 */
export function kpiHighScoreTrailingStreak(
  scoresAsc: number[],
  floor = KPI_HIGH_SCORE_FLOOR
): number {
  let n = 0;
  for (let i = scoresAsc.length - 1; i >= 0; i--) {
    if (scoresAsc[i]! >= floor) n += 1;
    else break;
  }
  return n;
}

export async function loadKpiScoreTrend(
  ctx: NovaSkillHandlerContext
): Promise<TrendLoadOk | TrendLoadFail> {
  const { user, query, tz, range, personHint } = ctx;
  if (
    !can(user, "kpi.read.self") &&
    !can(user, "kpi.read.team") &&
    !can(user, "kpi.read.all")
  ) {
    return {
      ok: false,
      denied: true,
      error: "Missing kpi.read.self / kpi.read.team / kpi.read.all",
    };
  }

  let window = bindNovaTrendWindow(query, { range, tz });
  const stretch = kpiTrendWindowDays(window.source);
  if (stretch != null) {
    window = bindNovaTrendWindow(`kpi trend last ${stretch} days`, { tz });
  }

  const grain = "month" as const;
  const links = [{ title: "KPI", href: "/kpi" }];
  const streakCue = wantsKpiHighStreak(query);

  let subjectUserId: string | null = null;
  let entityLabel = "Organisation";

  // Streak / “who has high KPI…” is an org ranking ask — skip personal bind
  // unless an explicit personHint was set and the cue is not streak-first.
  if (personHint && !streakCue) {
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
    if (!exact?.userId) {
      return {
        ok: false,
        empty: true,
        bundle: {
          schemaVersion: NOVA_TREND_SCHEMA_VERSION,
          domain: "kpi_score",
          entity: { kind: "person", label: personHint },
          metric: { id: "kpi_total_score", label: "KPI score", unit: "score" },
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
        },
      };
    }
    const allowed = await canViewKpiScorecard(user, exact.userId);
    if (!allowed) {
      return {
        ok: false,
        denied: true,
        error: `You cannot view KPI trend for ${exact.fullName} (ACL).`,
      };
    }
    subjectUserId = exact.userId;
    entityLabel = exact.fullName;
  } else if (!streakCue && !can(user, "kpi.read.all") && !can(user, "kpi.read.team")) {
    subjectUserId = user.id;
    entityLabel = user.name?.trim() || "You";
  } else if (streakCue) {
    entityLabel = can(user, "kpi.read.all")
      ? "Organisation"
      : can(user, "kpi.read.team")
        ? "Team"
        : user.name?.trim() || "You";
    if (!can(user, "kpi.read.all") && !can(user, "kpi.read.team")) {
      subjectUserId = user.id;
    }
  }

  const teamFilter = subjectUserId
    ? { userId: subjectUserId }
    : await (async () => {
        const ids = await kpiTeamUserIdsForUser(user);
        if (ids === null) return {};
        return { userId: { in: ids } };
      })();

  const reviews = await prisma.kpiReview.findMany({
    where: {
      ...teamFilter,
      totalScore: { not: null },
      period: {
        endDate: { gte: window.from, lte: window.to },
      },
    },
    select: {
      userId: true,
      totalScore: true,
      grade: true,
      user: {
        select: {
          name: true,
          staffProfile: { select: { fullName: true, staffCode: true } },
        },
      },
      period: {
        select: { id: true, name: true, startDate: true, endDate: true },
      },
    },
    orderBy: { period: { endDate: "asc" } },
    take: 2000,
  });

  if (reviews.length === 0) {
    return {
      ok: false,
      empty: true,
      bundle: {
        schemaVersion: NOVA_TREND_SCHEMA_VERSION,
        domain: "kpi_score",
        entity: {
          kind: subjectUserId ? "person" : "org",
          label: entityLabel,
        },
        metric: { id: "kpi_total_score", label: "KPI score", unit: "score" },
        window,
        grain,
        series: [],
        rankings: [],
        links,
        empty: true,
        message: `No scored KPI periods in ${window.label}.`,
      },
    };
  }

  // Person / self: series = that user's scores by period (+ optional own streak note).
  if (subjectUserId && !streakCue) {
    const mine = reviews.filter((r) => r.userId === subjectUserId);
    const series = mine.map((r) => {
      const score = Math.round(r.totalScore ?? 0);
      const y = r.period.endDate.getUTCFullYear();
      const m = String(r.period.endDate.getUTCMonth() + 1).padStart(2, "0");
      return {
        bucket: `${y}-${m}`,
        value: score,
        label: r.period.name,
      };
    });
    const scores = mine.map((r) => r.totalScore ?? 0);
    const streak = kpiHighScoreTrailingStreak(scores);
    const latest = mine[mine.length - 1];
    const latestScore = latest?.totalScore != null ? Math.round(latest.totalScore) : 0;
    const secondaryParts = [
      latest?.grade ?? latest?.period.name ?? null,
      streak > 0 ? `high streak ${streak}` : null,
    ].filter(Boolean);
    const rankings =
      latestScore > 0
        ? rankNovaTrendEntities([
            {
              entityId: subjectUserId,
              label: entityLabel,
              value: latestScore,
              secondary: secondaryParts.join(" · ") || null,
            },
          ])
        : [
            {
              rank: 1,
              entityId: subjectUserId,
              label: entityLabel,
              value: 0,
              secondary: secondaryParts.join(" · ") || null,
            },
          ];

    const bundle: NovaTrendBundle = {
      schemaVersion: NOVA_TREND_SCHEMA_VERSION,
      domain: "kpi_score",
      entity: { kind: "person", id: subjectUserId, label: entityLabel },
      metric: { id: "kpi_total_score", label: "KPI score", unit: "score" },
      window,
      grain,
      series,
      rankings,
      methodology:
        "KpiReview.totalScore by period end date (same Staff report-card SoT as /kpi/scorecard). High streak = trailing periods ≥ 75.",
      links: [
        {
          title: "KPI scorecard",
          href: `/kpi/scorecard/${subjectUserId}`,
        },
      ],
      empty: series.length === 0,
      message: series.length === 0 ? `No KPI scores in ${window.label}.` : null,
    };
    return { ok: true, bundle };
  }

  // Org / team: series = average scored total by period.
  const byPeriod = new Map<string, { label: string; sum: number; n: number; end: Date }>();
  const byUser = new Map<
    string,
    { label: string; code: string | null; points: { end: Date; score: number }[] }
  >();

  for (const r of reviews) {
    const score = r.totalScore;
    if (score == null) continue;
    const pid = r.period.id;
    const curP = byPeriod.get(pid) ?? {
      label: r.period.name,
      sum: 0,
      n: 0,
      end: r.period.endDate,
    };
    curP.sum += score;
    curP.n += 1;
    byPeriod.set(pid, curP);

    const name =
      r.user.staffProfile?.fullName ?? r.user.name?.trim() ?? "Unknown";
    const code = r.user.staffProfile?.staffCode ?? null;
    const curU = byUser.get(r.userId) ?? { label: name, code, points: [] };
    curU.points.push({ end: r.period.endDate, score });
    byUser.set(r.userId, curU);
  }

  const series = [...byPeriod.entries()]
    .sort((a, b) => a[1].end.getTime() - b[1].end.getTime())
    .map(([, v]) => {
      const y = v.end.getUTCFullYear();
      const m = String(v.end.getUTCMonth() + 1).padStart(2, "0");
      return {
        bucket: `${y}-${m}`,
        value: Math.round(v.sum / Math.max(1, v.n)),
        label: v.label,
      };
    });

  const streakRows = [...byUser.entries()]
    .map(([id, v]) => {
      const pts = [...v.points].sort((a, b) => a.end.getTime() - b.end.getTime());
      const streak = kpiHighScoreTrailingStreak(pts.map((p) => p.score));
      if (streak <= 0) return null;
      const last = pts[pts.length - 1]!;
      return {
        entityId: id,
        label: v.label,
        value: streak,
        secondary: v.code
          ? `${v.code} · last ${Math.round(last.score)}`
          : `last ${Math.round(last.score)}`,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const declineRows = [...byUser.entries()]
    .map(([id, v]) => {
      const pts = [...v.points].sort((a, b) => a.end.getTime() - b.end.getTime());
      if (pts.length < 2) return null;
      const first = pts[0]!.score;
      const last = pts[pts.length - 1]!.score;
      const drop = Math.round(first - last);
      if (drop <= 0) return null;
      return {
        entityId: id,
        label: v.label,
        value: drop,
        secondary: v.code
          ? `${v.code} · ${Math.round(first)}→${Math.round(last)}`
          : `${Math.round(first)}→${Math.round(last)}`,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  let rankings = streakCue
    ? rankNovaTrendEntities(streakRows)
    : rankNovaTrendEntities(declineRows);

  let metricId = streakCue ? "kpi_high_streak" : "kpi_score_drop";
  let metricLabel = streakCue ? "High KPI streak" : "KPI score drop";
  let metricUnit = streakCue ? "period(s) ≥75" : "points dropped";
  let methodology = streakCue
    ? `Trailing consecutive KpiReview periods with totalScore ≥ ${KPI_HIGH_SCORE_FLOOR} (Good+). Series = org average score per period.`
    : "KpiReview.totalScore across periods in window. Series = average score per period; rankings prefer largest score drops (else high streak or latest scores).";

  if (rankings.length === 0 && !streakCue) {
    rankings = rankNovaTrendEntities(streakRows);
    if (rankings.length > 0) {
      metricId = "kpi_high_streak";
      metricLabel = "High KPI streak";
      metricUnit = "period(s) ≥75";
      methodology = `No score drops in window — showing longest trailing high KPI streaks (score ≥ ${KPI_HIGH_SCORE_FLOOR}).`;
    }
  }

  if (rankings.length === 0) {
    const latestRows = [...byUser.entries()].map(([id, v]) => {
      const pts = [...v.points].sort((a, b) => a.end.getTime() - b.end.getTime());
      const last = pts[pts.length - 1]!;
      return {
        entityId: id,
        label: v.label,
        value: Math.round(last.score),
        secondary: v.code,
      };
    });
    rankings = rankNovaTrendEntities(latestRows);
    metricId = "kpi_total_score";
    metricLabel = "KPI score";
    metricUnit = "score";
    methodology =
      "KpiReview.totalScore — showing latest scores (no drops / high streaks in window).";
  }

  const bundle: NovaTrendBundle = {
    schemaVersion: NOVA_TREND_SCHEMA_VERSION,
    domain: "kpi_score",
    entity: { kind: "org", label: entityLabel },
    metric: {
      id: metricId,
      label: metricLabel,
      unit: metricUnit,
    },
    window,
    grain,
    series,
    rankings,
    methodology,
    links,
    empty: rankings.length === 0,
    message: rankings.length === 0 ? `No KPI scores in ${window.label}.` : null,
  };

  return { ok: true, bundle };
}
