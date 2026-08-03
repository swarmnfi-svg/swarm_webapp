/**
 * RBAC-gated loaders → NovaAnalysisBundle (P0 modules).
 * Universal pattern: resolve subject → depth → module SoT UI loader → adapter.
 * KPI SoT = Staff report card (`loadKpiScorecard` / same as `/kpi/scorecard/[userId]`).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { canViewKpiScorecard, loadKpiScorecard } from "@/lib/kpi/scorecard";
import type { NovaAnalysisLoadResult } from "@/lib/nova/analysis/module-contract";
import {
  adaptAttendanceFactToAnalysisBundle,
  adaptKpiReportCardToBundle,
  adaptOutstandingFactsToAnalysisBundle,
  adaptProjectFactsToAnalysisBundle,
  adaptTasksFactToAnalysisBundle,
} from "@/lib/nova/analysis/adapters";
import { inferNovaAnalysisDepth } from "@/lib/nova/analysis/depth";
import { getReceivablesAgingBuckets } from "@/lib/reports/queries";
import { loadProjectCommandDashboardSpine } from "@/lib/nova/packs/project-command-dashboard";
import { runTasksSummary } from "@/lib/nova/skills/ops/tasks";
import { runCustomerOutstanding } from "@/lib/nova/skills/finance/customer-outstanding";
import { runOverdueInvoices } from "@/lib/nova/skills/finance/overdue-invoices";
import { runReceiptsSummary } from "@/lib/nova/skills/finance/receipts";
import { runAttendanceLateSummary } from "@/lib/nova/skills/hr/attendance";
import { runProjectsSummary } from "@/lib/nova/skills/ops/projects";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";

export async function loadKpiAnalysisBundle(
  ctx: NovaSkillHandlerContext
): Promise<NovaAnalysisLoadResult> {
  const { user, personHint, query } = ctx;
  const depth = inferNovaAnalysisDepth(query);

  let subjectUserId = user.id;
  let subjectLabel = user.name?.trim() || "You";

  if (personHint) {
    const { resolveNovaPersonHint } = await import("@/lib/ai/nova-tools");
    const resolved = await resolveNovaPersonHint(personHint, user);
    if (resolved.kind === "ambiguous" || resolved.kind === "not_found") {
      return { ok: false, empty: true, message: resolved.message };
    }
    if (!resolved.person.userId) {
      return {
        ok: false,
        empty: true,
        message: `No user account linked for ${resolved.person.name} — cannot load KPI report card.`,
      };
    }
    subjectUserId = resolved.person.userId;
    subjectLabel = resolved.person.name;
  }

  const allowed = await canViewKpiScorecard(user, subjectUserId);
  if (!allowed) {
    return {
      ok: false,
      denied: true,
      error:
        subjectUserId === user.id
          ? "Missing kpi.read.self / kpi.read.team / kpi.read.all"
          : `You cannot view KPI analysis for ${subjectLabel} (ACL).`,
    };
  }

  const period = await prisma.kpiPeriod.findFirst({
    where: {
      status: {
        in: ["APPROVED", "LOCKED", "CALCULATED", "UNDER_REVIEW", "DRAFT", "REOPENED"],
      },
    },
    orderBy: { endDate: "desc" },
    select: { id: true, name: true },
  });
  if (!period) {
    return { ok: false, empty: true, message: "No KPI periods found." };
  }

  // Same SoT as Staff KPI report card page — never invent a peer/team rollup.
  const scorecard = await loadKpiScorecard(period.id, subjectUserId);
  if (!scorecard) {
    return {
      ok: false,
      empty: true,
      message: `No KPI report card data for ${subjectLabel} in ${period.name}.`,
    };
  }

  const displayName =
    scorecard.subject.staffCode && scorecard.subject.name.includes("—")
      ? scorecard.subject.name.split("—").slice(1).join("—").trim() || subjectLabel
      : scorecard.subject.name || subjectLabel;

  const resolvedScore = scorecard.review?.totalScore ?? null;

  if (
    !scorecard.lines.length &&
    resolvedScore == null &&
    scorecard.reportCard.factors.length === 0
  ) {
    return {
      ok: false,
      empty: true,
      message: `No KPI scorecard metrics for ${displayName} in ${scorecard.period.name}.`,
    };
  }

  return {
    ok: true,
    bundle: adaptKpiReportCardToBundle({
      card: scorecard.reportCard,
      subjectLabel: displayName,
      subjectUserId,
      periodName: scorecard.period.name,
      totalScore: resolvedScore,
      href: `/kpi/scorecard/${subjectUserId}?periodId=${period.id}`,
      depth,
    }),
  };
}

export async function loadTasksAnalysisBundle(
  ctx: NovaSkillHandlerContext
): Promise<NovaAnalysisLoadResult> {
  if (!can(ctx.user, "task.read.self")) {
    return { ok: false, denied: true, error: "Missing task.read.self" };
  }
  const depth = inferNovaAnalysisDepth(ctx.query);
  // Catalog skill already applies person/project ACL bind (same floor as /tasks).
  const tasks = await runTasksSummary(ctx);
  if (tasks.fact.denied) {
    return { ok: false, denied: true, error: tasks.fact.error ?? "Tasks denied" };
  }
  const d =
    tasks.fact.ok && tasks.fact.data && typeof tasks.fact.data === "object"
      ? (tasks.fact.data as Record<string, unknown>)
      : null;
  const subjectRec =
    d?.subject && typeof d.subject === "object"
      ? (d.subject as { name?: string; relation?: string })
      : null;
  const subjectLabel =
    (typeof subjectRec?.name === "string" && subjectRec.name) ||
    ctx.entityFilterName ||
    ctx.personHint ||
    ctx.user.name?.trim() ||
    "Tasks";
  const projectBound =
    ctx.resolvedEntityType === "project" && Boolean(ctx.resolvedEntityDbId);
  const personBound = Boolean(ctx.personHint) || subjectRec?.relation === "other";
  const bundle = d
    ? adaptTasksFactToAnalysisBundle(d, {
        subjectLabel,
        subjectKind: projectBound ? "project" : personBound ? "person" : "queue",
        subjectId: projectBound
          ? ctx.resolvedEntityDbId
          : personBound
            ? null
            : ctx.user.id,
        depth,
        href: projectBound ? `/projects/${ctx.resolvedEntityDbId}` : "/tasks",
      })
    : null;
  if (!bundle?.factors.length) {
    return { ok: false, empty: true, message: "No task factors to analyse." };
  }
  return { ok: true, bundle };
}

export async function loadOutstandingAnalysisBundle(
  ctx: NovaSkillHandlerContext
): Promise<NovaAnalysisLoadResult> {
  if (!can(ctx.user, "invoice.read") || !canViewOrgFinanceAggregates(ctx.user)) {
    return {
      ok: false,
      denied: true,
      error: "Missing invoice.read and/or org finance aggregates (money-hide)",
    };
  }
  const depth = inferNovaAnalysisDepth(ctx.query);
  const customerBound =
    ctx.resolvedEntityType === "customer" ||
    Boolean(ctx.entityFilterName || ctx.entityHint);

  const [outstanding, overdue, receipts, aging] = await Promise.all([
    runCustomerOutstanding(ctx),
    runOverdueInvoices(ctx),
    can(ctx.user, "receipt.read") && canViewOrgFinanceAggregates(ctx.user)
      ? runReceiptsSummary(ctx)
      : Promise.resolve(null),
    // Org receivables aging SoT (same buckets as /accounts/receivables) when not customer-bound.
    !customerBound ? getReceivablesAgingBuckets() : Promise.resolve(null),
  ]);
  if (outstanding.fact.denied) {
    return {
      ok: false,
      denied: true,
      error: outstanding.fact.error ?? "Outstanding denied",
    };
  }
  const outData =
    outstanding.fact.ok && outstanding.fact.data && typeof outstanding.fact.data === "object"
      ? (outstanding.fact.data as Record<string, unknown>)
      : null;
  const ovData =
    overdue.fact.ok && overdue.fact.data && typeof overdue.fact.data === "object"
      ? (overdue.fact.data as Record<string, unknown>)
      : null;
  const rcData =
    receipts?.fact.ok && receipts.fact.data && typeof receipts.fact.data === "object"
      ? (receipts.fact.data as Record<string, unknown>)
      : null;
  const label =
    ctx.entityFilterName ||
    ctx.entityHint ||
    (typeof outData?.customerFilter === "string" && outData.customerFilter) ||
    "Receivables";
  const bundle = adaptOutstandingFactsToAnalysisBundle({
    outstanding: outData,
    overdue: ovData,
    receipts: rcData,
    aging,
    subjectLabel: String(label),
    subjectId:
      ctx.resolvedEntityType === "customer" ? ctx.resolvedEntityDbId : null,
    depth,
    periodLabel: typeof rcData?.period === "string" ? rcData.period : null,
  });
  if (!bundle?.factors.length) {
    return { ok: false, empty: true, message: "No AR factors to analyse." };
  }
  return { ok: true, bundle };
}

export async function loadAttendanceAnalysisBundle(
  ctx: NovaSkillHandlerContext
): Promise<NovaAnalysisLoadResult> {
  const depth = inferNovaAnalysisDepth(ctx.query);
  const att = await runAttendanceLateSummary(ctx);
  if (att.fact.denied) {
    return { ok: false, denied: true, error: att.fact.error ?? "Attendance denied" };
  }
  const d =
    att.fact.ok && att.fact.data && typeof att.fact.data === "object"
      ? (att.fact.data as Record<string, unknown>)
      : null;
  const factSubject =
    d?.subject && typeof d.subject === "object"
      ? (d.subject as { name?: string; relation?: string })
      : null;
  const personBound =
    Boolean(ctx.personHint) ||
    (typeof factSubject?.name === "string" && factSubject.relation === "other");
  const subjectLabel =
    (typeof factSubject?.name === "string" && factSubject.name) ||
    ctx.personHint ||
    (personBound ? ctx.personHint : null) ||
    (typeof d?.scope === "string" ? String(d.scope) : null) ||
    "Attendance (team)";
  const bundle = d
    ? adaptAttendanceFactToAnalysisBundle(d, {
        subjectLabel: String(subjectLabel),
        subjectKind: personBound ? "person" : "org",
        depth,
      })
    : null;
  if (!bundle?.factors.length) {
    return { ok: false, empty: true, message: "No attendance factors." };
  }
  return { ok: true, bundle };
}

export async function loadProjectAnalysisBundle(
  ctx: NovaSkillHandlerContext
): Promise<NovaAnalysisLoadResult> {
  if (!can(ctx.user, "project.read") && !can(ctx.user, "task.read.self")) {
    return {
      ok: false,
      denied: true,
      error: "Missing project.read / task.read.self",
    };
  }
  const depth = inferNovaAnalysisDepth(ctx.query);
  const projectBound =
    ctx.resolvedEntityType === "project" && Boolean(ctx.resolvedEntityDbId);

  // Require an entity bind for Project Analysis — avoid org-wide portfolio noise.
  if (!projectBound && !ctx.entityFilterName && !ctx.entityHint) {
    return {
      ok: false,
      empty: true,
      message: "Bind a project (e.g. “analyze James School project”) to run Project Analysis.",
    };
  }

  const spinePromise =
    projectBound && can(ctx.user, "project.read")
      ? loadProjectCommandDashboardSpine(ctx.resolvedEntityDbId!, ctx.user)
      : Promise.resolve(null);

  const [tasks, projects, spineResult] = await Promise.all([
    can(ctx.user, "task.read.self") ? runTasksSummary(ctx) : Promise.resolve(null),
    can(ctx.user, "project.read") ? runProjectsSummary(ctx) : Promise.resolve(null),
    spinePromise,
  ]);
  if (tasks?.fact.denied) {
    return { ok: false, denied: true, error: tasks.fact.error ?? "Tasks denied" };
  }
  if (spineResult && spineResult.ok === false && spineResult.status === 403) {
    return { ok: false, denied: true, error: spineResult.error };
  }
  const taskData =
    tasks?.fact.ok && tasks.fact.data && typeof tasks.fact.data === "object"
      ? (tasks.fact.data as Record<string, unknown>)
      : null;
  const projectData =
    projects?.fact.ok && projects.fact.data && typeof projects.fact.data === "object"
      ? (projects.fact.data as Record<string, unknown>)
      : null;
  const spine = spineResult && spineResult.ok === true ? spineResult.spine : null;
  const label =
    spine?.project.projectName ||
    ctx.entityFilterName ||
    ctx.entityHint ||
    "This project";
  const bundle = adaptProjectFactsToAnalysisBundle({
    projectLabel: label,
    projectId: spine?.project.id ?? ctx.resolvedEntityDbId,
    tasks: taskData,
    projects: projectData,
    commandSpine: spine
      ? {
          project: spine.project,
          chapters: spine.chapters,
          links: spine.links,
        }
      : null,
    depth,
  });
  if (!bundle?.factors.length) {
    return {
      ok: false,
      empty: true,
      message: "No project factors available (bind a project or check permissions).",
    };
  }
  return { ok: true, bundle };
}
