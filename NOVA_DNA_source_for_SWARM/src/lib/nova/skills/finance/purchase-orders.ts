/**
 * Finance skill — purchase_orders_summary (open PO queue + period value).
 * Report-intent asks return a savable purchase_orders_report pack (values hidden when !showMoney).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
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

/** PO money: org-finance aggregates only (no role≠STAFF bypass). */
function canViewPurchaseOrderMoney(user: NovaSkillHandlerContext["user"]): boolean {
  return canViewOrgFinanceAggregates(user);
}

export async function runPurchaseOrdersSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, query, entityFilterName, sampleLimit } = ctx;
  const name = "purchase_orders_summary";

  if (!can(user, "purchaseorder.read")) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing purchaseorder.read" },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const showMoney = canViewPurchaseOrderMoney(user);
  const openStatuses = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "SENT_TO_VENDOR",
    "PARTIALLY_RECEIVED",
    "PAYMENT_PENDING",
  ] as const;
  const entityPo = entityFilterName
    ? {
        OR: [
          { vendor: { vendorName: { contains: entityFilterName, mode: "insensitive" as const } } },
          { poId: { contains: entityFilterName, mode: "insensitive" as const } },
          { projectRef: { contains: entityFilterName, mode: "insensitive" as const } },
        ],
      }
    : {};
  const openWhere = { status: { in: [...openStatuses] }, ...entityPo };
  const take = reportIntent
    ? rowCap
    : Math.min(12, Math.max(1, sampleLimit ?? 6));
  const periodWhere = range
    ? { createdAt: { gte: range.from, lte: range.to }, ...entityPo }
    : null;

  const [openCount, samples, createdInPeriod, periodSum] = await Promise.all([
    prisma.purchaseOrder.count({ where: openWhere }),
    prisma.purchaseOrder.findMany({
      where: openWhere,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        poId: true,
        status: true,
        totalValue: true,
        projectRef: true,
        vendor: { select: { vendorName: true } },
      },
    }),
    periodWhere
      ? prisma.purchaseOrder.count({ where: periodWhere })
      : Promise.resolve(null),
    periodWhere && showMoney
      ? prisma.purchaseOrder.aggregate({
          where: periodWhere,
          _sum: { totalValue: true },
        })
      : Promise.resolve(null),
  ]);

  const periodValueNum =
    showMoney && periodSum ? n(periodSum._sum.totalValue) : showMoney ? null : null;
  const mapped = samples.map((p) => ({
    id: p.poId,
    status: p.status,
    value: showMoney ? n(p.totalValue) : null,
    valueInr: showMoney ? inr(n(p.totalValue)) : "hidden",
    vendor: p.vendor.vendorName,
    project: p.projectRef,
    href: `/purchase-orders/${p.id}`,
  }));
  const links = [{ title: "Purchase orders", href: "/purchase-orders" }];

  const data = withFactProvenance(
    {
      period: range?.label ?? "current",
      entityFilter: entityFilterName ?? null,
      openCount,
      createdInPeriod,
      balancesVisible: showMoney,
      periodValueInr:
        showMoney && periodSum
          ? inr(n(periodSum._sum.totalValue))
          : showMoney
            ? null
            : "hidden",
      sampleCount: mapped.length,
      samplesShowing: mapped.length,
      samplesOf: openCount,
      samples: mapped.map(({ value: _v, ...rest }) => rest),
      note: showMoney ? undefined : "PO values hidden — need finance aggregate access.",
    },
    { period: range?.label ?? "open", sources: ["purchase_order"] }
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

    const byVendor = new Map<string, number>();
    if (showMoney) {
      for (const s of mapped) {
        const key = String(s.vendor ?? "—").slice(0, 18);
        byVendor.set(key, (byVendor.get(key) ?? 0) + Number(s.value ?? 0));
      }
    }
    const vendorPoints = [...byVendor.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, unit: "inr" as const }));

    const { attachment } = buildSkillReportPack({
      packId: "purchase_orders_report",
      reportMode,
      title: "Purchase orders report",
      headline: showMoney
        ? `${openCount} open PO · period value ${
            periodValueNum != null ? inr(periodValueNum) : "n/a"
          }`
        : `${openCount} open PO · values hidden`,
      period: {
        label: range?.label ?? "open queue",
        grain: range ? "month" : "open",
        calendarKind: range ? "calendar_month" : "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "purchase_orders.open_count",
          version: "1",
          certification: "draft",
          value: openCount,
          display: `${openCount} open`,
        },
        {
          metricId: "purchase_orders.created_in_period",
          version: "1",
          certification: "draft",
          value: createdInPeriod,
          display:
            createdInPeriod != null ? `${createdInPeriod} created` : "n/a",
        },
        ...(showMoney && periodValueNum != null
          ? [
              {
                metricId: "purchase_orders.period_value",
                version: "1",
                certification: "draft" as const,
                value: periodValueNum,
                display: inr(periodValueNum),
              },
            ]
          : []),
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["purchase_orders.open_count"],
          title: "Open by status",
          points: statusPoints,
        },
        ...(vendorPoints.length
          ? [
              {
                bindingId: "ageing_or_attention" as const,
                metricIds: ["purchase_orders.period_value"],
                title: "Value by vendor (sample)",
                points: vendorPoints,
              },
            ]
          : []),
      ],
      tables: [
        {
          id: "purchase_orders_rows",
          title: "Open purchase orders",
          columns: showMoney
            ? ["PO", "Vendor", "Project", "Status", "Value"]
            : ["PO", "Vendor", "Project", "Status"],
          rows: mapped.map((s) =>
            showMoney
              ? [
                  reportCell(s.id),
                  reportCell(s.vendor),
                  reportCell(s.project),
                  reportCell(s.status),
                  reportCell(s.valueInr),
                ]
              : [
                  reportCell(s.id),
                  reportCell(s.vendor),
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
          ? "Open PO statuses only. Period value uses createdAt when a range is set."
          : "PO values hidden — need finance aggregate access. Report intent does not widen money visibility.",
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
