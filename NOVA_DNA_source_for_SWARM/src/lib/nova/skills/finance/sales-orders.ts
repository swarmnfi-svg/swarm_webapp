/**
 * Finance skill — sales_orders_summary (open SO queue + period value).
 * Report-intent asks return a savable sales_orders_report pack (values hidden when !showMoney).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { canViewProjectValue } from "@/lib/project-financials-access";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const n = (v: unknown) => Number(v ?? 0);

/** Order amounts: finance aggregates or project-value flag (no role≠STAFF bypass). */
function canViewSalesOrderMoney(user: NovaSkillHandlerContext["user"]): boolean {
  return canViewOrgFinanceAggregates(user) || canViewProjectValue(user);
}

export async function runSalesOrdersSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, query, entityFilterName, sampleLimit } = ctx;
  const name = "sales_orders_summary";

  if (!can(user, "salesorder.read")) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing salesorder.read" },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const showMoney = canViewSalesOrderMoney(user);
  const closed = ["CLOSED", "CANCELLED", "DELIVERED"] as const;
  const entitySo = entityFilterName
    ? {
        OR: [
          { customer: { customerName: { contains: entityFilterName, mode: "insensitive" as const } } },
          { project: { projectName: { contains: entityFilterName, mode: "insensitive" as const } } },
          { project: { projectId: { contains: entityFilterName, mode: "insensitive" as const } } },
          { salesOrderId: { contains: entityFilterName, mode: "insensitive" as const } },
        ],
      }
    : {};
  const periodWhere = range
    ? { orderDate: { gte: range.from, lte: range.to }, ...entitySo }
    : { ...entitySo };
  const openWhere = { status: { notIn: [...closed] }, ...entitySo };
  const take = reportIntent
    ? rowCap
    : Math.min(12, Math.max(1, sampleLimit ?? 6));
  const [openCount, periodCount, periodValue, samples] = await Promise.all([
    prisma.salesOrder.count({ where: openWhere }),
    prisma.salesOrder.count({ where: periodWhere }),
    showMoney
      ? prisma.salesOrder.aggregate({
          where: periodWhere,
          _sum: { totalOrderValue: true },
        })
      : Promise.resolve(null),
    prisma.salesOrder.findMany({
      where: openWhere,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        salesOrderId: true,
        status: true,
        totalOrderValue: true,
        customer: { select: { customerName: true } },
        project: { select: { projectName: true, projectId: true } },
      },
    }),
  ]);

  const periodValueNum = showMoney ? n(periodValue?._sum.totalOrderValue) : null;
  const mapped = samples.map((o) => ({
    id: o.salesOrderId,
    status: o.status,
    value: showMoney ? n(o.totalOrderValue) : null,
    valueInr: showMoney ? inr(n(o.totalOrderValue)) : "hidden",
    customer: o.customer.customerName,
    project: o.project.projectName,
    href: `/sales-orders/${o.id}`,
  }));
  const links = [{ title: "Sales orders", href: "/sales-orders" }];

  const data = withFactProvenance(
    {
      period: range?.label ?? "all time (open queue)",
      entityFilter: entityFilterName ?? null,
      openOrderCount: openCount,
      ordersInPeriod: periodCount,
      balancesVisible: showMoney,
      periodValueInr: showMoney ? inr(periodValueNum ?? 0) : "hidden",
      sampleCount: mapped.length,
      samplesShowing: mapped.length,
      samplesOf: openCount,
      samples: mapped.map(({ value: _v, ...rest }) => rest),
      note: showMoney
        ? undefined
        : "Order values hidden — need canSeeProjectValue or finance aggregate access.",
    },
    { period: range?.label ?? "open", sources: ["sales_order"] }
  );

  if (reportIntent) {
    const byStatus = new Map<string, number>();
    for (const s of mapped) {
      const key = String(s.status ?? "—").slice(0, 18);
      byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
    }
    const statusPoints = [...byStatus.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, unit: "count" as const }));

    const valuePoints = showMoney
      ? mapped
          .filter((s) => s.value != null)
          .slice(0, 8)
          .map((s) => ({
            label: String(s.id ?? s.customer).slice(0, 18),
            value: Number(s.value ?? 0),
            unit: "inr" as const,
          }))
      : [];

    const { attachment } = buildSkillReportPack({
      packId: "sales_orders_report",
      reportMode,
      title: "Sales orders report",
      headline: showMoney
        ? `${openCount} open SO · period value ${inr(periodValueNum ?? 0)}`
        : `${openCount} open SO · values hidden`,
      period: {
        label: range?.label ?? "open queue",
        grain: range ? "month" : "open",
        calendarKind: range ? "calendar_month" : "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "sales_orders.open_count",
          version: "1",
          certification: "draft",
          value: openCount,
          display: `${openCount} open`,
        },
        {
          metricId: "sales_orders.period_count",
          version: "1",
          certification: "draft",
          value: periodCount,
          display: `${periodCount} in period`,
        },
        ...(showMoney
          ? [
              {
                metricId: "sales_orders.period_value",
                version: "1",
                certification: "draft" as const,
                value: periodValueNum,
                display: inr(periodValueNum ?? 0),
              },
            ]
          : []),
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["sales_orders.open_count"],
          title: "Open by status",
          points: statusPoints,
        },
        ...(valuePoints.length
          ? [
              {
                bindingId: "ageing_or_attention" as const,
                metricIds: ["sales_orders.period_value"],
                title: "Order value (sample)",
                points: valuePoints,
              },
            ]
          : []),
      ],
      tables: [
        {
          id: "sales_orders_rows",
          title: "Open sales orders",
          columns: showMoney
            ? ["SO", "Customer", "Project", "Status", "Value"]
            : ["SO", "Customer", "Project", "Status"],
          rows: mapped.map((s) =>
            showMoney
              ? [
                  reportCell(s.id),
                  reportCell(s.customer),
                  reportCell(s.project),
                  reportCell(s.status),
                  reportCell(s.valueInr),
                ]
              : [
                  reportCell(s.id),
                  reportCell(s.customer),
                  reportCell(s.project),
                  reportCell(s.status),
                ]
          ),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        showMoney
          ? "Open SO queue (not CLOSED/CANCELLED/DELIVERED). Period value uses orderDate when a range is set."
          : "Order values hidden — need canSeeProjectValue or finance aggregate access. Report intent does not widen money visibility.",
      ],
    });
    return {
      fact: {
        tool: name,
        ok: true,
        data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
      },
      links,
    };
  }

  return {
    fact: {
      tool: name,
      ok: true,
      data,
    },
    links,
  };
}
