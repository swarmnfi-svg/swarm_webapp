/**
 * Skill — kpi_summary (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { kpiTeamUserIdsForUser } from "@/lib/kpi/team-scope";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  resolveSkillReportIntent,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";
import { buildKpiTrendReportPack } from "@/lib/nova/skills/ops/kpi-trend-report";
import { loadKpiScoreTrend } from "@/lib/nova/trend/adapters/kpi-score";

/** All-staff / per-person listing — not a named staff member. */
export function wantsAllStaffKpiList(query: string | undefined | null): boolean {
  if (!query?.trim()) return false;
  const q = query.trim().toLowerCase();
  return (
    /\ball\s+staff\s+kpi\b/.test(q) ||
    /\bstaff\s+kpi\b/.test(q) ||
    /\bkpi\s+list\b/.test(q) ||
    /\bindividual\s+(?:staff\s+)?kpi\b/.test(q) ||
    /\beach\s+staff\s+kpi\b/.test(q) ||
    /\bkpi\s+(?:for|of)\s+(?:all|each|every)\s+staff\b/.test(q) ||
    /\b(?:all|each|every)\s+staff\b.*\bkpi\b/.test(q)
  );
}

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
          sources: ["kpi_review"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runKpiSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, personHint, query, sampleLimit } = ctx;
  const name = "kpi_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  const canAll = can(user, "kpi.read.all");
  const canTeam = can(user, "kpi.read.team");
  const canSelf = can(user, "kpi.read.self");
  if (!canAll && !canTeam && !canSelf) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing kpi.read.*" });
    return finalize();
  }
  const period = await prisma.kpiPeriod.findFirst({
    where: { status: { in: ["APPROVED", "LOCKED", "CALCULATED", "UNDER_REVIEW", "DRAFT"] } },
    orderBy: { endDate: "desc" },
    select: { id: true, name: true, status: true, startDate: true, endDate: true },
  });
  if (!period) {
    facts.push({ tool: name, ok: true, data: { message: "No KPI periods found" } });
    links.push({ title: "KPI", href: "/kpi" });
    return finalize();
  }
  const teamUserIds = canAll ? null : await kpiTeamUserIdsForUser(user);
  const selfOnly = canSelf && !canAll && !canTeam;
  const allStaffList = wantsAllStaffKpiList(query) && !personHint;
  let kpiSubject: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } | null = null;
  let reviewWhere: Record<string, unknown> =
    teamUserIds === null
      ? { periodId: period.id, totalScore: { not: null } }
      : {
          periodId: period.id,
          totalScore: { not: null },
          userId: { in: selfOnly ? [user.id] : teamUserIds },
        };

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
          reviewCount: 0,
          top: [],
        },
      });
      links.push({ title: "KPI", href: "/kpi" });
      return finalize();
    }
    const p = resolved.person;
    if (p.relation === "other") {
      if (selfOnly) {
        facts.push({
          tool: name,
          ok: false,
          denied: true,
          error: `You can only view your own KPI — not ${p.name}'s.`,
          data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
        });
        return finalize();
      }
      if (canTeam && !canAll && p.userId && teamUserIds && !teamUserIds.includes(p.userId)) {
        facts.push({
          tool: name,
          ok: false,
          denied: true,
          error: `You can only view KPI for your team — not ${p.name}'s.`,
          data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
        });
        return finalize();
      }
    }
    if (p.userId) {
      reviewWhere = { periodId: period.id, totalScore: { not: null }, userId: p.userId };
      kpiSubject = { name: p.name, relation: p.relation, staffCode: p.staffCode };
    }
  }

  const reviews = await prisma.kpiReview.findMany({
    where: reviewWhere,
    orderBy: { totalScore: "desc" },
    take: allStaffList ? 200 : selfOnly && !personHint ? 1 : 12,
    select: {
      userId: true,
      totalScore: true,
      grade: true,
      status: true,
      user: { select: { name: true } },
      staff: { select: { fullName: true, staffCode: true } },
    },
  });
  const scores = reviews.map((r) => r.totalScore).filter((s): s is number => s != null);
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const ranked = reviews.map((r) => ({
    userId: r.userId,
    name: r.staff?.fullName ?? r.user.name,
    staffCode: r.staff?.staffCode ?? null,
    score: r.totalScore,
    grade: r.grade,
    status: r.status,
  }));
  const sessionRow = ranked.find((r) => r.userId === user.id) ?? null;
  const myRow = sessionRow ?? ranked[0] ?? null;
  const explicitSelfAsk =
    !allStaffList &&
    (kpiSubject?.relation === "self" ||
      (selfOnly && !personHint) ||
      /\bmy\s+kpi\b/i.test(query ?? ""));
  const scope = kpiSubject
    ? kpiSubject.relation === "self"
      ? "person_self"
      : "person_other"
    : allStaffList
      ? "all_staff"
      : canAll
        ? "all"
        : canTeam
          ? "team"
          : "self";
  const scopeLabel =
    scope === "person_self"
      ? "self"
      : scope === "person_other"
        ? `person (${kpiSubject?.name ?? "other"})`
        : scope === "all_staff"
          ? "all staff"
          : scope;
  const avgRounded = avg != null ? Math.round(avg * 10) / 10 : null;
  const staffScores = allStaffList ? ranked : ranked.slice(0, 8);
  const data: Record<string, unknown> = {
    period: period.name,
    periodStatus: period.status,
    periodSource: "default_latest_kpi_period",
    from: period.startDate.toISOString().slice(0, 10),
    to: period.endDate.toISOString().slice(0, 10),
    reviewCount: reviews.length,
    averageScore: avgRounded,
    highestScore: scores.length ? Math.max(...scores) : null,
    lowestScore: scores.length ? Math.min(...scores) : null,
    scope,
    listMode: allStaffList ? "all_staff" : kpiSubject ? "person" : "summary",
    subject: kpiSubject,
    personFilter: personHint ?? null,
    scopeNote: allStaffList
      ? "All-staff KPI listing — enumerate every score in staffScores/top. Do not say the session user lacks a score unless they asked for my kpi."
      : kpiSubject
        ? kpiSubject.relation === "other"
          ? `KPI for ${kpiSubject.name} (third person). Never address the session user as ${kpiSubject.name}.`
          : "Your own KPI."
        : selfOnly
          ? "Your own KPI only (kpi.read.self)."
          : canTeam && !canAll
            ? "Team KPI scope (kpi.read.team)."
            : "Org-wide KPI.",
    myScore: explicitSelfAsk ? (myRow?.score ?? null) : null,
    myGrade: explicitSelfAsk ? (myRow?.grade ?? null) : null,
    sessionUserScore: sessionRow?.score ?? null,
    sessionUserGrade: sessionRow?.grade ?? null,
    top: staffScores,
    staffScores: allStaffList ? ranked : undefined,
    bottom: ranked.length > 1 ? [...ranked].reverse().slice(0, 3) : [],
  };

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  if (reportIntent) {
    const trend = await loadKpiScoreTrend(ctx);
    const trendBundle =
      trend && "bundle" in trend && trend.bundle ? trend.bundle : null;
    const periodLabel = trendBundle?.window.label ?? period.name;
    const { attachment } = buildKpiTrendReportPack({
      reportMode,
      toolName: name,
      title: "KPI trend report",
      headline: `${periodLabel} · ${reviews.length} review(s)${avgRounded != null ? ` · avg ${avgRounded}` : ""} · scope ${scope}`,
      params: {
        periodLabel,
        personLabel: kpiSubject?.name ?? (selfOnly ? user.name ?? "You" : null),
        scopeLabel,
        windowSource: trendBundle?.window.source ?? "default_latest_kpi_period",
      },
      reviewCount: reviews.length,
      averageScore: avgRounded,
      rankedStrip: ranked.slice(0, Math.min(8, rowCap)),
      trend,
      factData: data,
      links: [{ title: "KPI", href: "/kpi" }],
      scoreSamples: ranked.slice(0, rowCap),
    });
    // New object — never Object.assign onto `data` (pack.facts may reference it).
    const attached = withSkillReportAttachment(data, attachment);
    facts.push({ tool: name, ok: true, data: attached });
  } else {
    facts.push({ tool: name, ok: true, data });
  }
  links.push({ title: "KPI", href: "/kpi" });
  return finalize();
}

/**
 * Detailed KPI report card — why the score sits high/low (same ACL as UI scorecard).
 */
export async function runKpiReport(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, personHint, sampleLimit } = ctx;
  const name = "kpi_report";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  const canAll = can(user, "kpi.read.all");
  const canTeam = can(user, "kpi.read.team");
  const canSelf = can(user, "kpi.read.self");
  if (!canAll && !canTeam && !canSelf) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing kpi.read.*" });
    return finalize();
  }

  const { canViewKpiScorecard, loadKpiScorecard } = await import("@/lib/kpi/scorecard");

  let subjectUserId = user.id;
  let subjectMeta: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } = { name: "You", relation: "self", staffCode: null };

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
        },
      });
      links.push({ title: "KPI", href: "/kpi" });
      return finalize();
    }
    const p = resolved.person;
    if (!p.userId) {
      facts.push({
        tool: name,
        ok: true,
        data: {
          subject: { name: p.name, relation: p.relation, staffCode: p.staffCode },
          message: `${p.name} has no linked user account — KPI report card needs a user login.`,
        },
      });
      links.push({ title: "KPI", href: "/kpi" });
      return finalize();
    }
    if (!(await canViewKpiScorecard(user, p.userId))) {
      facts.push({
        tool: name,
        ok: false,
        denied: true,
        error:
          p.relation === "self"
            ? "Missing permission to view this KPI report card."
            : `You can only view KPI report cards in your allowed scope — not ${p.name}'s.`,
        data: { subject: { name: p.name, relation: p.relation, staffCode: p.staffCode } },
      });
      return finalize();
    }
    subjectUserId = p.userId;
    subjectMeta = { name: p.name, relation: p.relation, staffCode: p.staffCode };
  } else if (!(await canViewKpiScorecard(user, user.id))) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing kpi.read.self for report card.",
    });
    return finalize();
  }

  const period = await prisma.kpiPeriod.findFirst({
    where: { status: { in: ["APPROVED", "LOCKED", "CALCULATED", "UNDER_REVIEW", "DRAFT"] } },
    orderBy: { endDate: "desc" },
    select: { id: true, name: true },
  });
  if (!period) {
    facts.push({ tool: name, ok: true, data: { message: "No KPI periods found" } });
    links.push({ title: "KPI", href: "/kpi" });
    return finalize();
  }

  const card = await loadKpiScorecard(period.id, subjectUserId);
  if (!card) {
    facts.push({
      tool: name,
      ok: true,
      data: {
        message: "No scorecard data for this person / period.",
        subject: subjectMeta,
        period: period.name,
      },
    });
    links.push({ title: "KPI", href: "/kpi" });
    return finalize();
  }

  const rc = card.reportCard;
  const href = `/kpi/scorecard/${subjectUserId}?periodId=${period.id}`;
  facts.push({
    tool: name,
    ok: true,
    data: {
      period: card.period.name,
      periodStatus: card.period.status,
      periodSource: "default_latest_kpi_period",
      from: card.period.startDate.toISOString().slice(0, 10),
      to: card.period.endDate.toISOString().slice(0, 10),
      scope: subjectMeta.relation === "self" ? "person_self" : "person_other",
      subject: {
        name: card.subject.name,
        relation: subjectMeta.relation,
        staffCode: card.subject.staffCode,
        department: card.subject.department,
        designation: card.subject.designation,
      },
      totalScore: card.review?.totalScore ?? null,
      grade: card.review?.grade ?? rc.band.grade,
      reviewStatus: card.review?.status ?? null,
      verdict: rc.verdict,
      headline: rc.headline,
      summary: rc.summary,
      methodology: rc.methodology,
      trendNote: rc.trend?.note ?? null,
      trendDelta: rc.trend?.delta ?? null,
      trendDirection: rc.trend?.direction ?? null,
      drags: rc.drags.slice(0, 5).map((f) => ({
        name: f.parameterName,
        score: f.finalScore,
        weight: f.weightage,
        why: f.why,
        formula: f.formula,
      })),
      boosts: rc.boosts.slice(0, 5).map((f) => ({
        name: f.parameterName,
        score: f.finalScore,
        weight: f.weightage,
        why: f.why,
        formula: f.formula,
      })),
      missing: rc.missing.slice(0, 5).map((f) => ({
        name: f.parameterName,
        weight: f.weightage,
        why: f.why,
      })),
      href,
      scopeNote:
        subjectMeta.relation === "other"
          ? `KPI report card for ${subjectMeta.name} (third person). Never address the session user as ${subjectMeta.name}.`
          : "Your own KPI report card.",
    },
  });
  links.push({ title: "KPI report card", href });
  links.push({ title: "KPI", href: "/kpi" });
  return finalize();
}
