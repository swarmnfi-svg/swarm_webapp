/**
 * Skill — delivery_summary.
 *
 * Source of truth: DeliveryRecord, including project/customer via Project.
 * Installation is a stage/date slice of DeliveryRecord, not a separate table.
 */
import type { DeliveryStage, Prisma } from "@prisma/client";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { resolveToolPeriod } from "@/lib/ai/nova-dates";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import { buildNovaPackResult, selectNovaPackAttentions } from "@/lib/nova/pack-result";
import { buildNovaFinding } from "@/lib/nova/recipes/finding";
import {
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const DELIVERY_DELAY_REPORT_PACK_VERSION = "1.0.0";
const DELIVERY_STATUS_REPORT_PACK_VERSION = "1.0.0";

type DeliveryFocus =
  | "summary"
  | "delivery_pending"
  | "delivery_delayed"
  | "dispatch"
  | "delivered"
  | "installation_pending"
  | "installation_delayed"
  | "installation_completed"
  | "responsibility";

const DELIVERY_PENDING_STAGES: DeliveryStage[] = [
  "PRODUCTION_PENDING",
  "PRODUCTION_STARTED",
  "PRODUCTION_COMPLETED",
  "QC_PENDING",
  "QC_COMPLETED",
  "READY_FOR_DISPATCH",
  "VEHICLE_ASSIGNED",
  "DISPATCHED",
];

const DISPATCH_STAGES: DeliveryStage[] = ["VEHICLE_ASSIGNED", "DISPATCHED"];
const DELIVERED_STAGES: DeliveryStage[] = [
  "DELIVERED",
  "INSTALLATION_PENDING",
  "INSTALLATION_STARTED",
  "INSTALLATION_COMPLETED",
  "CUSTOMER_SIGNOFF_COMPLETED",
];
const INSTALLATION_PENDING_STAGES: DeliveryStage[] = [
  "INSTALLATION_PENDING",
  "INSTALLATION_STARTED",
];
const INSTALLATION_COMPLETED_STAGES: DeliveryStage[] = [
  "INSTALLATION_COMPLETED",
  "CUSTOMER_SIGNOFF_COMPLETED",
];

function labelStage(stage: string): string {
  return stage
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function classifyDeliveryFocus(query: string): DeliveryFocus {
  const q = query.toLowerCase();
  const installation = /\b(install(?:ation|ed|ing)?|technician)\b/i.test(q);
  const responsibility =
    /\b(who|handled|handle|assigned|responsible|technician|engineer|team)\b/i.test(q);
  const delayed = /\b(delay|delays|delayed|overdue|stuck|late|due)\b/i.test(q);
  const pending = /\b(pending|open|incomplete|not\s+done|not\s+completed)\b/i.test(q);
  const completed = /\b(completed|complete|done|finished|signed\s*off|signoff)\b/i.test(q);
  const delivered = /\b(delivered|received\s+by\s+customer)\b/i.test(q);
  const dispatch = /\b(dispatch(?:ed|es)?|shipped|vehicle\s+assigned|lr\s+number)\b/i.test(q);

  if (responsibility && installation) return "responsibility";
  if (installation && delayed) return "installation_delayed";
  if (installation && completed) return "installation_completed";
  if (installation && (pending || /\bdue\b/i.test(q))) return "installation_pending";
  if (responsibility) return "responsibility";
  if (delayed) return "delivery_delayed";
  if (pending) return "delivery_pending";
  if (delivered) return "delivered";
  if (dispatch) return "dispatch";
  return "summary";
}

function wantsPartialDelivery(query: string): boolean {
  return /\bpartial(?:ly)?\s+deliver(?:y|ed|ies)?|part\s+deliver(?:y|ed)\b/i.test(query);
}

function wantsAllTime(query: string): boolean {
  return /\b(all[-\s]?time|overall|ever|lifetime)\b/i.test(query);
}

function stageWhereForFocus(focus: DeliveryFocus): Prisma.DeliveryRecordWhereInput | null {
  switch (focus) {
    case "delivery_pending":
    case "delivery_delayed":
      return { stage: { in: DELIVERY_PENDING_STAGES } };
    case "dispatch":
      return { stage: { in: DISPATCH_STAGES } };
    case "delivered":
      return {
        OR: [{ stage: { in: DELIVERED_STAGES } }, { deliveredDate: { not: null } }],
      };
    case "installation_pending":
    case "installation_delayed":
      return { stage: { in: INSTALLATION_PENDING_STAGES } };
    case "installation_completed":
      return {
        OR: [
          { stage: { in: INSTALLATION_COMPLETED_STAGES } },
          { installationEndDate: { not: null } },
        ],
      };
    default:
      return null;
  }
}

function dateWhereForFocus(
  focus: DeliveryFocus,
  period: { from: Date; to: Date }
): Prisma.DeliveryRecordWhereInput {
  const between = { gte: period.from, lte: period.to };
  if (focus === "dispatch") {
    return { OR: [{ dispatchDate: between }, { updatedAt: between }] };
  }
  if (focus === "delivered") {
    return { OR: [{ deliveredDate: between }, { updatedAt: between }] };
  }
  if (focus === "installation_pending" || focus === "installation_delayed") {
    return {
      OR: [
        { installationStartDate: between },
        { updatedAt: between },
        { project: { expectedCompletionDate: between } },
      ],
    };
  }
  if (focus === "installation_completed") {
    return { OR: [{ installationEndDate: between }, { updatedAt: between }] };
  }
  return {
    OR: [
      { dispatchDate: between },
      { deliveredDate: between },
      { installationStartDate: between },
      { installationEndDate: between },
      { updatedAt: between },
    ],
  };
}

function entityWhere(
  entityFilterName: string | undefined,
  resolvedEntityType: NovaSkillHandlerContext["resolvedEntityType"],
  resolvedEntityDbId: string | null
): Prisma.DeliveryRecordWhereInput | null {
  if (resolvedEntityType === "project" && resolvedEntityDbId) {
    return { project: { id: resolvedEntityDbId } };
  }
  if (resolvedEntityType === "customer" && resolvedEntityDbId) {
    return { project: { customerId: resolvedEntityDbId } };
  }
  if (!entityFilterName) return null;
  return {
    OR: [
      { project: { projectName: { contains: entityFilterName, mode: "insensitive" } } },
      { project: { projectId: { contains: entityFilterName, mode: "insensitive" } } },
      {
        project: {
          customer: {
            OR: [
              { customerName: { contains: entityFilterName, mode: "insensitive" } },
              { companyName: { contains: entityFilterName, mode: "insensitive" } },
              { customerId: { contains: entityFilterName, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}

function isDelayedRow(
  row: {
    stage: DeliveryStage;
    dispatchDate: Date | null;
    installationStartDate: Date | null;
    updatedAt: Date;
    project: { expectedCompletionDate: Date | null } | null;
  },
  focus: DeliveryFocus,
  nowMs: number
): {
  delayDays: number;
  projectDelayDays: number;
  dispatchOverdue: boolean;
  installationOverdue: boolean;
  stuckDays: number;
} {
  const expected = row.project?.expectedCompletionDate ?? null;
  const projectDelayDays = expected
    ? Math.max(0, Math.floor((nowMs - expected.getTime()) / 86400000))
    : 0;
  const dispatchOverdue =
    focus === "delivery_delayed" &&
    Boolean(row.dispatchDate) &&
    row.dispatchDate!.getTime() < nowMs &&
    DELIVERY_PENDING_STAGES.includes(row.stage);
  const installationOverdue =
    focus === "installation_delayed" &&
    Boolean(row.installationStartDate) &&
    row.installationStartDate!.getTime() < nowMs &&
    INSTALLATION_PENDING_STAGES.includes(row.stage);
  const stuckDays = Math.max(0, Math.floor((nowMs - row.updatedAt.getTime()) / 86400000));
  const delayDays = Math.max(
    projectDelayDays,
    dispatchOverdue && row.dispatchDate
      ? Math.floor((nowMs - row.dispatchDate.getTime()) / 86400000)
      : 0,
    installationOverdue && row.installationStartDate
      ? Math.floor((nowMs - row.installationStartDate.getTime()) / 86400000)
      : 0,
    stuckDays > 14 ? stuckDays : 0
  );
  return { delayDays, projectDelayDays, dispatchOverdue, installationOverdue, stuckDays };
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
          sources: ["delivery_record"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runDeliverySummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, tz, range, entityFilterName, resolvedEntityType, resolvedEntityDbId, sampleLimit } = ctx;
  const name = "delivery_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "delivery.read")) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing delivery.read" });
    return finalize();
  }

  const focus = classifyDeliveryFocus(query);
  const partialDelivery = wantsPartialDelivery(query);
  const allTime = wantsAllTime(query);
  const { period, periodGrain, periodSource } = resolveToolPeriod(range, "month", new Date(), tz);
  const nowMs = Date.now();
  const openDefault =
    focus === "delivery_pending" ||
    focus === "delivery_delayed" ||
    focus === "installation_pending" ||
    focus === "installation_delayed" ||
    focus === "responsibility";
  const applyDateFilter = !allTime && (Boolean(range) || !openDefault);
  const and: Prisma.DeliveryRecordWhereInput[] = [];
  const stageWhere = stageWhereForFocus(focus);
  const scopedWhere = entityWhere(entityFilterName, resolvedEntityType, resolvedEntityDbId);
  if (stageWhere) and.push(stageWhere);
  if (applyDateFilter) and.push(dateWhereForFocus(focus, period));
  if (scopedWhere) and.push(scopedWhere);
  const deliveryWhere: Prisma.DeliveryRecordWhereInput = and.length ? { AND: and } : {};
  const orderBy: Prisma.DeliveryRecordOrderByWithRelationInput =
    focus === "delivery_delayed" || focus === "installation_delayed"
      ? { updatedAt: "asc" }
      : focus === "dispatch"
        ? { dispatchDate: "desc" }
        : focus === "delivered"
          ? { deliveredDate: "desc" }
          : focus === "installation_completed"
            ? { installationEndDate: "desc" }
            : { updatedAt: "desc" };

  const [count, byStage, samples] = await Promise.all([
    prisma.deliveryRecord.count({ where: deliveryWhere }),
    prisma.deliveryRecord.groupBy({
      by: ["stage"],
      where: deliveryWhere,
      _count: true,
    }),
    prisma.deliveryRecord.findMany({
      where: deliveryWhere,
      orderBy,
      take: focus === "delivery_delayed" || focus === "installation_delayed" ? 40 : 8,
      select: {
        id: true,
        salesOrderId: true,
        stage: true,
        transportVendor: true,
        lrNumber: true,
        vehicleNumber: true,
        driverContact: true,
        engineerInCharge: true,
        dispatchDate: true,
        deliveredDate: true,
        installationStartDate: true,
        installationEndDate: true,
        updatedAt: true,
        project: {
          select: {
            projectName: true,
            projectId: true,
            expectedCompletionDate: true,
            customer: {
              select: {
                customerName: true,
                companyName: true,
                customerId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const sampleRowsRaw = Array.isArray(samples) ? samples : [];
  const byStageRows = Array.isArray(byStage) ? byStage : [];
  const deliveryCount = Number(count ?? 0);
  const countStages = (stages: readonly DeliveryStage[]) =>
    byStageRows
      .filter((g) => stages.includes(g.stage))
      .reduce((sum, g) => sum + Number(g._count ?? 0), 0);
  const scored = sampleRowsRaw.map((d) => {
    const delay = isDelayedRow(d, focus, nowMs);
    return {
      id: d.id,
      salesOrderId: d.salesOrderId,
      stage: d.stage,
      stageLabel: labelStage(d.stage),
      dispatch: d.dispatchDate?.toISOString().slice(0, 10) ?? null,
      delivered: d.deliveredDate?.toISOString().slice(0, 10) ?? null,
      installationStart: d.installationStartDate?.toISOString().slice(0, 10) ?? null,
      installationEnd: d.installationEndDate?.toISOString().slice(0, 10) ?? null,
      project: d.project?.projectName ?? "—",
      projectId: d.project?.projectId ?? "",
      customer:
        d.project?.customer?.customerName ??
        d.project?.customer?.companyName ??
        d.project?.customer?.customerId ??
        null,
      engineerInCharge: d.engineerInCharge ?? null,
      engineer: d.engineerInCharge ?? null,
      transportVendor: d.transportVendor ?? null,
      lrNumber: d.lrNumber ?? null,
      vehicleNumber: d.vehicleNumber ?? null,
      driverContact: d.driverContact ?? null,
      ...delay,
    };
  });
  const wantsDelays = focus === "delivery_delayed" || focus === "installation_delayed";
  const { reportMode, reportIntent: artifactIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  /** Delay-focused asks keep delivery_delay_report; other report asks get delivery_status_report. */
  const delayReportIntent = wantsDelays && artifactIntent;
  const statusReportIntent = artifactIntent && !wantsDelays;
  const ranked = wantsDelays
    ? [...scored].sort((a, b) => b.delayDays - a.delayDays || b.stuckDays - a.stuckDays)
    : scored;
  const topDelayed = wantsDelays
    ? ranked
        .filter(
          (r) =>
            r.delayDays > 0 ||
            r.dispatchOverdue ||
            r.installationOverdue ||
            r.stuckDays >= 7
        )
        .slice(0, 8)
    : [];
  const delayedCount = wantsDelays
    ? ranked.filter(
        (r) =>
          r.delayDays > 0 ||
          r.dispatchOverdue ||
          r.installationOverdue ||
          r.stuckDays >= 7
      ).length
    : 0;
  const sampleRows = (wantsDelays && topDelayed.length ? topDelayed : ranked.slice(0, 8)).map(
    (d) => ({
        id: d.id,
        stage: d.stage,
        stageLabel: d.stageLabel,
        dispatch: d.dispatch,
        delivered: d.delivered,
        installationStart: d.installationStart,
        installationEnd: d.installationEnd,
        project: d.project,
        projectId: d.projectId,
        customer: d.customer,
        salesOrderId: d.salesOrderId,
        engineerInCharge: d.engineerInCharge,
        engineer: d.engineer,
        transportVendor: d.transportVendor,
        lrNumber: d.lrNumber,
        vehicleNumber: d.vehicleNumber,
        delayDays: wantsDelays ? d.delayDays : undefined,
        stuckDays: wantsDelays ? d.stuckDays : undefined,
      })
  );
  const scopeKind =
    resolvedEntityType === "customer"
      ? "customer"
      : resolvedEntityType === "project"
        ? "project"
        : entityFilterName
          ? "party_or_project"
          : "org";
  const periodLabel = allTime
    ? "all time"
    : openDefault && !range
      ? "open / current"
      : period.label;

  links.push({ title: "Delivery", href: "/delivery" });
  const data = {
    period: periodLabel,
    periodGrain: allTime ? "all_time" : openDefault && !range ? "open" : periodGrain,
    periodSource: allTime
      ? "explicit_all_time"
      : openDefault && !range
        ? "default_open_current"
        : periodSource,
    focus,
    entityFilter: entityFilterName ?? null,
    scopeKind,
    sourceOfTruth: "DeliveryRecord",
    installationSot:
      "Installation status is stored as DeliveryRecord stage plus installationStartDate / installationEndDate.",
    relationSot:
      "DeliveryRecord.project links to Project and Customer; salesOrderId is stored when available.",
    partialDeliverySupported: false,
    partialDeliveryNote: partialDelivery
      ? "Partial delivery quantity/status is not a line-level field on DeliveryRecord; NOVA can show the available stage summary only."
      : undefined,
    responsibilityNote:
      focus === "responsibility"
        ? "DeliveryRecord stores engineerInCharge plus transport vendor / vehicle / driver contact. It does not store an assigned team relation."
        : undefined,
    deliveryCount,
    pendingDeliveryCount: countStages(DELIVERY_PENDING_STAGES),
    dispatchedCount: countStages(DISPATCH_STAGES),
    deliveredCount: countStages(DELIVERED_STAGES),
    installationPendingCount: countStages(INSTALLATION_PENDING_STAGES),
    installationCompletedCount: countStages(INSTALLATION_COMPLETED_STAGES),
    incompleteCount: wantsDelays ? deliveryCount : undefined,
    delayedCount: wantsDelays ? delayedCount : undefined,
    delayedSampleCount: wantsDelays ? delayedCount : undefined,
    byStage: byStageRows.map((g) => ({
      stage: g.stage,
      label: labelStage(g.stage),
      count: g._count,
    })),
    sampleCount: sampleRows.length,
    samplesShowing: sampleRows.length,
    samplesOf: deliveryCount,
    samples: sampleRows,
    topDelayed: wantsDelays
      ? topDelayed.map((d) => ({
          project: d.project,
          projectId: d.projectId,
          customer: d.customer,
          stage: d.stageLabel,
          delayDays: d.delayDays,
          dispatch: d.dispatch,
          installationStart: d.installationStart,
          engineer: d.engineer,
          engineerInCharge: d.engineerInCharge,
          dispatchOverdue: d.dispatchOverdue,
          installationOverdue: d.installationOverdue,
          projectDelayDays: d.projectDelayDays,
          stuckDays: d.stuckDays,
          salesOrderId: d.salesOrderId,
        }))
      : undefined,
  };

  if (delayReportIntent) {
    const periodLabel = String(data.period);
    const topRows = Array.isArray(data.topDelayed) ? data.topDelayed : [];
    const findings = [
      buildNovaFinding({
        observation:
          delayedCount > 0
            ? `${delayedCount} delivery record(s) are overdue or stuck in ${periodLabel}.`
            : `No overdue/stuck delivery records found in ${periodLabel}.`,
        evidence: [
          {
            toolId: name,
            summary: `${deliveryCount} incomplete delivery record(s); ${delayedCount} overdue/stuck.`,
          },
        ],
        contributors: [{ toolId: name, role: "source_of_truth" }],
        recommendation: { label: "Open Delivery", href: "/delivery" },
        confidence: "fact",
      }),
      ...topRows.slice(0, 3).map((row) => {
        const r = row as {
          project?: string;
          projectId?: string;
          stage?: string;
          delayDays?: number;
          stuckDays?: number;
          engineer?: string | null;
        };
        return buildNovaFinding({
          observation: `${r.projectId ?? ""} ${r.project ?? "Project"} is at ${r.stage ?? "current stage"} with ${Number(r.delayDays ?? 0)} delay day(s).`,
          evidence: [
            {
              toolId: name,
              summary: `stuckDays=${Number(r.stuckDays ?? 0)}; engineer=${r.engineer ?? "not set"}`,
            },
          ],
          contributors: [{ toolId: name, role: "delayed_sample" }],
          recommendation: { label: "Open Delivery", href: "/delivery" },
          confidence: "fact",
        });
      }),
    ];
    const pack = buildNovaPackResult({
      packId: "delivery_delay_report",
      packVersion: DELIVERY_DELAY_REPORT_PACK_VERSION,
      period: {
        label: periodLabel,
        grain: "open",
        calendarKind: "point_in_time",
        source: range ? "explicit" : "default",
      },
      dataAsOf: new Date().toISOString(),
      metrics: [
        {
          metricId: "delivery.incomplete_count",
          version: "1",
          certification: "draft",
          value: deliveryCount,
          display: `${deliveryCount} incomplete`,
          periodLabel,
        },
        {
          metricId: "delivery.overdue_or_stuck_count",
          version: "1",
          certification: "draft",
          value: delayedCount,
          display: `${delayedCount} overdue/stuck`,
          periodLabel,
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      findings,
      attentions: selectNovaPackAttentions(findings),
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["delivery.overdue_or_stuck_count"],
          title: "Delay days by project",
          points: topRows.slice(0, 8).map((row) => {
            const r = row as { projectId?: string; project?: string; delayDays?: number };
            return {
              label: r.projectId || r.project || "Project",
              value: Number(r.delayDays ?? 0),
              unit: "days",
            };
          }),
        },
        {
          bindingId: "kpi_strip",
          metricIds: ["delivery.incomplete_count"],
          title: "Status distribution",
          points: byStageRows.map((g) => ({
            label: labelStage(g.stage),
            value: Number(g._count ?? 0),
            unit: "count",
          })),
        },
      ],
      tables: [
        {
          id: "delivery_delay_details",
          title: "Delivery Delay Details",
          columns: ["Project", "Customer", "Stage", "Delay", "Stuck", "Engineer", "Dispatch"],
          rows: topRows.slice(0, rowCap).map((row) => {
            const r = row as {
              project?: string;
              projectId?: string;
              customer?: string | null;
              stage?: string;
              delayDays?: number;
              stuckDays?: number;
              engineer?: string | null;
              dispatch?: string | null;
            };
            return [
              reportCell([r.projectId, r.project].filter(Boolean).join(" ")),
              reportCell(r.customer),
              reportCell(r.stage),
              Number.isFinite(Number(r.delayDays)) ? `${Number(r.delayDays)}d` : "—",
              Number.isFinite(Number(r.stuckDays)) ? `${Number(r.stuckDays)}d` : "—",
              reportCell(r.engineer, "not set"),
              reportCell(r.dispatch),
            ];
          }),
        },
      ],
      links,
      warnings: [],
      omittedNotes: [
        "Source of truth: DeliveryRecord joined to Project/Customer. Engineer is DeliveryRecord.engineerInCharge when set.",
      ],
      narrativeHints: [
        `Delivery delay report for ${periodLabel}.`,
        `${deliveryCount} incomplete delivery record(s); ${delayedCount} overdue/stuck.`,
        "Charts: delay days by project and status distribution.",
        "Table: project, customer, stage, days stuck/delay, engineer, dispatch date.",
        "Savable via Save report; PDF/CSV/text download re-checks delivery.read.",
      ],
    });
    const narrative = [
      `**Delivery delay report — ${periodLabel}**`,
      `${deliveryCount} incomplete delivery record(s); ${delayedCount} overdue/stuck.`,
      "Use **Save report** to generate the immutable PDF with charts and the delivery delay table.",
      "Source of truth: DeliveryRecord.",
    ].join("\n\n");
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(
        {
          ...data,
          narrative,
        },
        {
          reportIntent: true,
          reportStatus: "ready",
          ...(reportMode ? { reportMode } : {}),
          packId: pack.packId,
          packVersion: pack.packVersion,
          chartBindings: pack.charts.map((c) => c.bindingId),
          narrative,
          pack,
        }
      ),
    });
  } else if (statusReportIntent) {
    const periodLabel = String(data.period);
    const statusRows = sampleRows.slice(0, rowCap);
    const findings = [
      buildNovaFinding({
        observation: `${deliveryCount} delivery record(s) in ${periodLabel} (focus: ${focus}).`,
        evidence: [
          {
            toolId: name,
            summary: `byStage=${byStageRows.length} groups; sample=${statusRows.length}.`,
          },
        ],
        contributors: [{ toolId: name, role: "source_of_truth" }],
        recommendation: { label: "Open Delivery", href: "/delivery" },
        confidence: "fact",
      }),
    ];
    const pack = buildNovaPackResult({
      packId: "delivery_status_report",
      packVersion: DELIVERY_STATUS_REPORT_PACK_VERSION,
      period: {
        label: periodLabel,
        grain: "open",
        calendarKind: "point_in_time",
        source: range ? "explicit" : "default",
      },
      dataAsOf: new Date().toISOString(),
      metrics: [
        {
          metricId: "delivery.record_count",
          version: "1",
          certification: "draft",
          value: deliveryCount,
          display: `${deliveryCount} records`,
          periodLabel,
        },
        {
          metricId: "delivery.pending_count",
          version: "1",
          certification: "draft",
          value: data.pendingDeliveryCount,
          display: `${data.pendingDeliveryCount} pending`,
          periodLabel,
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      findings,
      attentions: selectNovaPackAttentions(findings),
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["delivery.record_count"],
          title: "Status distribution",
          points: byStageRows.map((g) => ({
            label: labelStage(g.stage),
            value: Number(g._count ?? 0),
            unit: "count",
          })),
        },
      ],
      tables: [
        {
          id: "delivery_status_details",
          title: "Delivery status sample",
          columns: ["Project", "Customer", "Stage", "Dispatch", "Delivered", "Engineer"],
          rows: statusRows.map((r) => [
            reportCell([r.projectId, r.project].filter(Boolean).join(" ")),
            reportCell(r.customer),
            reportCell(r.stageLabel ?? r.stage),
            reportCell(r.dispatch),
            reportCell(r.delivered),
            reportCell(r.engineer ?? r.engineerInCharge, "not set"),
          ]),
        },
      ],
      links,
      warnings: [],
      omittedNotes: [
        "Status / stage snapshot from DeliveryRecord. For delay days ask “delivery delay report”.",
      ],
      narrativeHints: [
        `Delivery status report for ${periodLabel}.`,
        `${deliveryCount} delivery record(s); focus ${focus}.`,
        "Chart: status distribution. Table: project/customer/stage sample.",
        "Savable via Save report; PDF/CSV/text download re-checks delivery.read.",
      ],
    });
    const narrative = [
      `**Delivery status report — ${periodLabel}**`,
      `${deliveryCount} delivery record(s); focus ${focus}.`,
      "Use **Save report** to generate the immutable PDF with charts and the delivery status table.",
      "For overdue/stuck days, ask **delivery delay report**.",
    ].join("\n\n");
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(
        {
          ...data,
          narrative,
        },
        {
          reportIntent: true,
          reportStatus: "ready",
          ...(reportMode ? { reportMode } : {}),
          packId: pack.packId,
          packVersion: pack.packVersion,
          chartBindings: pack.charts.map((c) => c.bindingId),
          narrative,
          pack,
        }
      ),
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
