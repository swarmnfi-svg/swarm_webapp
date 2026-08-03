/**
 * Skill — projects_summary.
 * Default: FY active portfolio by contract value.
 * Confirmed/new-orders asks: projects with CONFIRMED status date in the period,
 * plus value / received / outstanding (Project P&L SoT).
 * Report-intent asks return a savable projects_portfolio_report pack.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { currentIndianFyRange, novaCurrentMonthRange } from "@/lib/ai/nova-dates";
import { isNovaConfirmedOrdersAsk } from "@/lib/ai/nova-lexicon";
import { summarizeProjectFinancials } from "@/lib/project-financial-summary";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const n = (v: unknown) => Number(v ?? 0);

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
          sources: ["project"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

async function runConfirmedProjectsInPeriod(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const {
    user,
    range,
    query,
    entityHint,
    entityFilterName,
    resolvedEntityDbId,
    resolvedEntityType,
    tz,
    sampleLimit,
  } = ctx;
  const name = "projects_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  const showValue =
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.role === "DIRECTOR" ||
    !!user.canSeeProjectValue;

  const { isNovaBookkeepingProjectName } = await import("@/lib/ai/nova-tools");

  // Period from utterance; default this calendar month (not full FY)
  const projectPeriod =
    range && !range.label.startsWith("FY ")
      ? range
      : range?.label.startsWith("FY ")
        ? range
        : novaCurrentMonthRange(new Date(), tz);

  const entityWhere =
    resolvedEntityType === "project" && resolvedEntityDbId
      ? { id: resolvedEntityDbId }
      : resolvedEntityType === "customer" && resolvedEntityDbId
        ? { customerId: resolvedEntityDbId }
        : entityHint
          ? {
              OR: [
                { projectName: { contains: entityFilterName, mode: "insensitive" as const } },
                { projectId: { contains: entityFilterName, mode: "insensitive" as const } },
                {
                  customer: {
                    customerName: { contains: entityFilterName, mode: "insensitive" as const },
                  },
                },
              ],
            }
          : {};

  const confirmedWhere = {
    statusDates: {
      some: {
        status: "CONFIRMED" as const,
        statusDate: { gte: projectPeriod.from, lte: projectPeriod.to },
      },
    },
    ...entityWhere,
  };

  const candidates = await prisma.project.findMany({
    where: confirmedWhere,
    orderBy: showValue ? { projectValue: "desc" } : { updatedAt: "desc" },
    take: 40,
    select: {
      id: true,
      projectId: true,
      projectName: true,
      status: true,
      projectValue: true,
      createdAt: true,
      customer: { select: { customerName: true } },
      statusDates: {
        where: { status: "CONFIRMED" },
        select: { statusDate: true },
        take: 1,
      },
      invoices: {
        where: { status: { notIn: ["DRAFT", "CANCELLED", "REVERSED"] } },
        select: {
          grandTotal: true,
          status: true,
          receipts: { select: { amount: true, postingStatus: true } },
          creditNotes: { select: { grandTotal: true, voidedAt: true } },
          debitNotes: { select: { grandTotal: true, voidedAt: true } },
        },
      },
      receipts: { select: { amount: true, postingStatus: true } },
      purchaseBills: {
        where: { approvalStatus: "ADMIN_APPROVED" },
        select: { totalInvoiceValue: true },
      },
      paymentRequests: {
        where: { status: "PAID", purchaseBillId: null },
        select: { amount: true, status: true, purchaseBillId: true },
      },
    },
  });

  const operational = candidates.filter((p) => !isNovaBookkeepingProjectName(p.projectName));
  const excludedBookkeeping = candidates.length - operational.length;

  const rows = operational.map((p) => {
    const fin = summarizeProjectFinancials({
      projectValue: p.projectValue,
      invoices: p.invoices,
      receipts: p.receipts,
      purchaseBills: p.purchaseBills,
      paymentRequests: p.paymentRequests,
    });
    const confirmedAt = p.statusDates[0]?.statusDate ?? null;
    return {
      id: p.projectId,
      name: p.projectName,
      customer: p.customer.customerName,
      status: p.status,
      confirmedAt: confirmedAt ? confirmedAt.toISOString().slice(0, 10) : null,
      value: showValue ? n(p.projectValue) : null,
      valueInr: showValue ? inr(n(p.projectValue)) : "hidden",
      received: showValue ? fin.received : null,
      receivedInr: showValue ? inr(fin.received) : "hidden",
      outstanding: showValue ? fin.outstanding : null,
      outstandingInr: showValue ? inr(fin.outstanding) : "hidden",
      href: `/projects/${p.id}`,
    };
  });

  const totalValue = rows.reduce((s, r) => s + (r.value ?? 0), 0);
  const totalReceived = rows.reduce((s, r) => s + (r.received ?? 0), 0);
  const totalOutstanding = rows.reduce((s, r) => s + (r.outstanding ?? 0), 0);
  const top = rows.slice(0, 8);

  const data = {
    metric: "projects.confirmed_in_period",
    mode: "confirmed_in_period",
    period: projectPeriod.label,
    from: projectPeriod.from.toISOString().slice(0, 10),
    to: projectPeriod.to.toISOString().slice(0, 10),
    scopeNote:
      "Projects whose CONFIRMED status date falls in this period (order-book style). Value = contract value; Received / Outstanding use Project P&L SoT (POSTED receipts; outstanding = value − received when value set).",
    confirmedCount: rows.length,
    excludedBookkeepingCount: excludedBookkeeping,
    totalProjectValue: showValue ? totalValue : "hidden",
    totalProjectValueInr: showValue ? inr(totalValue) : "hidden",
    totalReceived: showValue ? totalReceived : "hidden",
    totalReceivedInr: showValue ? inr(totalReceived) : "hidden",
    totalOutstanding: showValue ? totalOutstanding : "hidden",
    totalOutstandingInr: showValue ? inr(totalOutstanding) : "hidden",
    valueVisible: showValue,
    entityFilter: entityFilterName ?? null,
    samples: top,
    // Keep portfolio-shaped fields for older formatters / follow-ups
    activeCountInPeriod: rows.length,
    activeCount: rows.length,
    totalActiveProjectValue: showValue ? totalValue : "hidden",
    totalActiveProjectValueInr: showValue ? inr(totalValue) : "hidden",
    topProjectsByValue: top.map((r) => ({
      id: r.id,
      name: r.name,
      customer: r.customer,
      status: r.status,
      valueInr: r.valueInr,
      value: r.value,
      receivedInr: r.receivedInr,
      outstandingInr: r.outstandingInr,
      confirmedAt: r.confirmedAt,
    })),
  };

  links.push({ title: "Projects", href: "/projects" });
  links.push({ title: "Director / order book", href: "/director" });

  const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "projects_portfolio_report",
      reportMode,
      title: "Projects confirmed in period",
      headline: `${rows.length} confirmed in ${projectPeriod.label}${
        showValue
          ? ` · value ${inr(totalValue)} · received ${inr(totalReceived)} · outstanding ${inr(totalOutstanding)}`
          : " · values hidden"
      }`,
      period: {
        label: projectPeriod.label,
        grain: "month",
        calendarKind: "calendar_month",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "projects.confirmed_in_period",
          version: "1",
          certification: "draft",
          value: rows.length,
          display: `${rows.length} confirmed`,
          periodLabel: projectPeriod.label,
        },
        {
          metricId: "projects.contract_value",
          version: "1",
          certification: "draft",
          value: showValue ? totalValue : null,
          display: showValue ? inr(totalValue) : "hidden",
          periodLabel: projectPeriod.label,
        },
        {
          metricId: "projects.received",
          version: "1",
          certification: "draft",
          value: showValue ? totalReceived : null,
          display: showValue ? inr(totalReceived) : "hidden",
          periodLabel: projectPeriod.label,
        },
        {
          metricId: "projects.outstanding",
          version: "1",
          certification: "draft",
          value: showValue ? totalOutstanding : null,
          display: showValue ? inr(totalOutstanding) : "hidden",
          periodLabel: projectPeriod.label,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["projects.contract_value", "projects.received", "projects.outstanding"],
          title: "Confirmed projects money",
          points: showValue
            ? [
                { label: "Value", value: totalValue, unit: "inr" as const },
                { label: "Received", value: totalReceived, unit: "inr" as const },
                { label: "Outstanding", value: totalOutstanding, unit: "inr" as const },
              ]
            : [{ label: "Confirmed", value: rows.length, unit: "count" as const }],
        },
      ],
      tables: [
        {
          id: "projects_confirmed_rows",
          title: "Confirmed projects",
          columns: ["Project", "Customer", "Confirmed", "Value", "Received", "Outstanding"],
          rows: top.map((p) => [
            reportCell([p.id, p.name].filter(Boolean).join(" ")),
            reportCell(p.customer),
            reportCell(p.confirmedAt ?? "—"),
            reportCell(p.valueInr),
            reportCell(p.receivedInr),
            reportCell(p.outstandingInr),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "CONFIRMED status date in period (same gate as Director order book for the FY roll-up).",
        "Received = POSTED receipts; Outstanding = project value − received when value is set.",
      ],
    });
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
    });
    return finalize();
  }

  facts.push({ tool: name, ok: true, data });
  return finalize();
}

export async function runProjectsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const {
    user,
    range,
    query,
    entityHint,
    entityFilterName,
    resolvedEntityDbId,
    resolvedEntityType,
    sampleLimit,
  } = ctx;
  const name = "projects_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "project.read")) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing project.read" });
    return finalize();
  }

  if (isNovaConfirmedOrdersAsk(query ?? "")) {
    return runConfirmedProjectsInPeriod(ctx);
  }

  const showValue =
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.role === "DIRECTOR" ||
    !!user.canSeeProjectValue;

  const { isNovaBookkeepingProjectName } = await import("@/lib/ai/nova-tools");

  // Default / FY / month project value → current Indian FY (or explicit range if FY/month)
  const qLower = query.toLowerCase();
  const wantsFy =
    /\b(this\s+fy|current\s+fy|financial\s+year|fy\s*['’]?\d{2})\b/.test(qLower) ||
    (range?.label.startsWith("FY ") ?? false);
  const scopeFy =
    wantsFy || !range || range.label.startsWith("FY ")
      ? range?.label.startsWith("FY ")
        ? range
        : currentIndianFyRange()
      : null;
  // Month-named ranges: still use current FY for project portfolio (contract values aren't monthly)
  const projectPeriod = scopeFy ?? currentIndianFyRange();

  // Bound customer/project from ClarifyAct — filter by id, never re-fuzzy the label.
  const entityWhere =
    resolvedEntityType === "project" && resolvedEntityDbId
      ? { id: resolvedEntityDbId }
      : resolvedEntityType === "customer" && resolvedEntityDbId
        ? { customerId: resolvedEntityDbId }
        : entityHint
          ? {
              OR: [
                { projectName: { contains: entityFilterName, mode: "insensitive" as const } },
                { projectId: { contains: entityFilterName, mode: "insensitive" as const } },
                {
                  customer: {
                    customerName: { contains: entityFilterName, mode: "insensitive" as const },
                  },
                },
              ],
            }
          : {};

  const baseWhere = {
    status: { not: "CLOSED" as const },
    createdAt: { gte: projectPeriod.from, lte: projectPeriod.to },
    ...entityWhere,
  };

  const [activeInFy, closedInFy, allActive, candidates] = await Promise.all([
    prisma.project.count({ where: baseWhere }),
    prisma.project.count({
      where: {
        status: "CLOSED",
        createdAt: { gte: projectPeriod.from, lte: projectPeriod.to },
      },
    }),
    prisma.project.count({ where: { status: { not: "CLOSED" } } }),
    prisma.project.findMany({
      where: baseWhere,
      orderBy: showValue ? { projectValue: "desc" } : { updatedAt: "desc" },
      take: 40,
      select: {
        projectId: true,
        projectName: true,
        status: true,
        projectValue: true,
        createdAt: true,
        customer: { select: { customerName: true } },
      },
    }),
  ]);

  const operational = candidates.filter((p) => !isNovaBookkeepingProjectName(p.projectName));
  const excludedBookkeeping = candidates.length - operational.length;
  const totalValue = operational.reduce((s, p) => s + n(p.projectValue), 0);
  const top = operational.slice(0, 5);
  const biggest = top[0] ?? null;

  // Project-scoped fact inventory (Ship 7) — only when a filter is present.
  let scopedFacts: Record<string, unknown> | null = null;
  if ((entityHint || resolvedEntityDbId) && operational.length === 1) {
    const p = operational[0]!;
    const projectRow = await prisma.project.findFirst({
      where: { projectId: p.projectId },
      select: {
        id: true,
        projectId: true,
        projectName: true,
        status: true,
        projectValue: true,
        budget: true,
      },
    });
    if (projectRow) {
      const [taskOpen, taskDone, checklistOpen, checklistDone, deliveryCount, invoiceAgg] =
        await Promise.all([
          prisma.task.count({
            where: { projectId: projectRow.id, status: { notIn: ["COMPLETED", "CANCELLED", "ARCHIVED"] } },
          }),
          prisma.task.count({
            where: { projectId: projectRow.id, status: "COMPLETED" },
          }),
          prisma.projectChecklistItem.count({
            where: { projectId: projectRow.id, status: { not: "COMPLETED" } },
          }),
          prisma.projectChecklistItem.count({
            where: { projectId: projectRow.id, status: "COMPLETED" },
          }),
          prisma.deliveryRecord.count({ where: { projectRef: projectRow.projectId } }),
          prisma.salesInvoice.aggregate({
            where: { projectRef: projectRow.projectId },
            _sum: { grandTotal: true },
            _count: true,
          }),
        ]);
      const invoiced = n(invoiceAgg._sum.grandTotal);
      const value = n(projectRow.projectValue);
      const budget = n(projectRow.budget);
      scopedFacts = {
        projectId: projectRow.projectId,
        projectName: projectRow.projectName,
        status: projectRow.status,
        taskOpen,
        taskDone,
        checklistOpen,
        checklistDone,
        deliveryCount,
        invoiceCount: invoiceAgg._count,
        invoicedTotal: showValue ? invoiced : "hidden",
        invoicedTotalInr: showValue ? inr(invoiced) : "hidden",
        projectValue: showValue ? value : "hidden",
        projectValueInr: showValue ? inr(value) : "hidden",
        budget: showValue ? budget : "hidden",
        budgetInr: showValue ? inr(budget) : "hidden",
        valueVisible: showValue,
        siteAttendanceLinked: false,
        note: "Project-scoped tasks/checklist/deliveries/invoices from ERP — no site attendance-by-project until linked data exists.",
      };
    }
  }

  const topProjectsByValue = top.map((p) => ({
    id: p.projectId,
    name: p.projectName,
    customer: p.customer.customerName,
    status: p.status,
    valueInr: showValue ? inr(n(p.projectValue)) : "hidden",
    value: showValue ? n(p.projectValue) : null,
  }));

  const data = {
    metric: "project.projectValue (contract value on Project master — not receipts or sales)",
    period: projectPeriod.label,
    from: projectPeriod.from.toISOString().slice(0, 10),
    to: projectPeriod.to.toISOString().slice(0, 10),
    scopeNote:
      "Active projects created in this Indian FY; bookkeeping/adjustment projects excluded from value ranking",
    activeCountInPeriod: activeInFy,
    closedCountInPeriod: closedInFy,
    activeCountAllTime: allActive,
    activeCount: activeInFy,
    closedCount: closedInFy,
    excludedBookkeepingCount: excludedBookkeeping,
    totalActiveProjectValue: showValue ? totalValue : "hidden",
    totalActiveProjectValueInr: showValue ? inr(totalValue) : "hidden",
    valueVisible: showValue,
    entityFilter: entityFilterName ?? null,
    scopedFacts,
    projectHealthReady: Boolean(scopedFacts),
    biggestProject:
      showValue && biggest
        ? {
            id: biggest.projectId,
            name: biggest.projectName,
            customer: biggest.customer.customerName,
            status: biggest.status,
            valueInr: inr(n(biggest.projectValue)),
            value: n(biggest.projectValue),
          }
        : null,
    topProjectsByValue,
  };

  links.push({ title: "Projects", href: "/projects" });

  const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
  if (reportIntent) {
    const statusCounts = new Map<string, number>();
    for (const p of operational.slice(0, 40)) {
      const key = String(p.status || "UNKNOWN");
      statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
    }
    const statusPoints = [...statusCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label: label.slice(0, 18), value, unit: "count" as const }));
    const valuePoints = showValue
      ? topProjectsByValue
          .filter((p) => p.value != null)
          .slice(0, 8)
          .map((p) => ({
            label: String(p.id || p.name).slice(0, 18),
            value: Number(p.value ?? 0),
            unit: "inr" as const,
          }))
      : statusPoints;

    const { attachment } = buildSkillReportPack({
      packId: "projects_portfolio_report",
      reportMode,
      title: "Projects portfolio report",
      headline: `${activeInFy} active in ${projectPeriod.label}${
        showValue ? ` · contract value ${inr(totalValue)}` : " · values hidden"
      }`,
      period: {
        label: projectPeriod.label,
        grain: "fy",
        calendarKind: "financial_year",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "projects.active_in_period",
          version: "1",
          certification: "draft",
          value: activeInFy,
          display: `${activeInFy} active`,
          periodLabel: projectPeriod.label,
        },
        {
          metricId: "projects.contract_value",
          version: "1",
          certification: "draft",
          value: showValue ? totalValue : null,
          display: showValue ? inr(totalValue) : "hidden",
          periodLabel: projectPeriod.label,
        },
      ],
      charts: [
        {
          bindingId: showValue ? "kpi_strip" : "ageing_or_attention",
          metricIds: showValue
            ? ["projects.contract_value"]
            : ["projects.active_in_period"],
          title: showValue ? "Contract value by project (top)" : "Projects by status (sample)",
          points: valuePoints.length
            ? valuePoints
            : [{ label: "Active", value: activeInFy, unit: "count" }],
        },
        ...(statusPoints.length && showValue
          ? [
              {
                bindingId: "ageing_or_attention" as const,
                metricIds: ["projects.active_in_period"],
                title: "Projects by status (sample)",
                points: statusPoints,
              },
            ]
          : []),
      ],
      tables: [
        {
          id: "projects_portfolio_rows",
          title: "Top projects",
          columns: ["Project", "Customer", "Status", "Value"],
          rows: topProjectsByValue.map((p) => [
            reportCell([p.id, p.name].filter(Boolean).join(" ")),
            reportCell(p.customer),
            reportCell(p.status),
            reportCell(p.valueInr),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Contract value on Project master — not receipts or sales. Bookkeeping projects excluded from ranking.",
        showValue
          ? "Values visible for director/admin or canSeeProjectValue."
          : "Project values hidden without value visibility.",
      ],
    });
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
    });
    return finalize();
  }

  facts.push({
    tool: name,
    ok: true,
    data,
  });
  return finalize();
}
