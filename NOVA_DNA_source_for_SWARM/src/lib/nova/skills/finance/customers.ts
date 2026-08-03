/**
 * Finance skill — customers_summary.
 * Report-intent asks return a savable customers_report pack.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

export async function runCustomersSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, entityFilterName, resolvedEntityType, resolvedEntityDbId, sampleLimit } = ctx;
  const name = "customers_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "customer.read")) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing customer.read" },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const take = reportIntent ? rowCap : (sampleLimit ?? 6);

  const customerWhere =
    resolvedEntityType === "customer" && resolvedEntityDbId
      ? { id: resolvedEntityDbId }
      : entityFilterName
        ? {
            OR: [
              { customerName: { contains: entityFilterName, mode: "insensitive" as const } },
              { companyName: { contains: entityFilterName, mode: "insensitive" as const } },
              { customerId: { contains: entityFilterName, mode: "insensitive" as const } },
            ],
          }
        : {};

  const [activeCount, totalCount, recent, byState] = await Promise.all([
    prisma.customer.count({ where: { active: true, ...customerWhere } }),
    prisma.customer.count({ where: customerWhere }),
    prisma.customer.findMany({
      where: customerWhere,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        customerId: true,
        customerName: true,
        companyName: true,
        active: true,
        billingState: true,
      },
    }),
    reportIntent
      ? prisma.customer.groupBy({
          by: ["billingState"],
          where: { active: true, ...customerWhere },
          _count: { _all: true },
        })
      : Promise.resolve([] as { billingState: string | null; _count: { _all: number } }[]),
  ]);

  links.push({ title: "Customers", href: "/customers" });

  const recentCustomers = recent.map((c) => ({
    id: c.customerId,
    name: c.customerName,
    company: c.companyName,
    state: c.billingState,
    active: c.active,
    href: `/customers/${c.id}`,
  }));

  const data = withFactProvenance(
    {
      activeCount,
      totalCount,
      entityFilter: entityFilterName ?? null,
      recentCustomers,
    },
    { sources: ["customers_master"] }
  );

  if (reportIntent) {
    const statePoints = (byState as { billingState: string | null; _count: { _all: number } }[])
      .map((g) => ({
        label: String(g.billingState || "Unspecified").slice(0, 18),
        value: g._count._all,
        unit: "count" as const,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const { attachment } = buildSkillReportPack({
      packId: "customers_report",
      reportMode,
      title: "Customers report",
      headline: `${activeCount} active of ${totalCount} customer(s)${
        entityFilterName ? ` matching “${entityFilterName}”` : ""
      }`,
      period: {
        label: "point in time",
        grain: "open",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "customers.active_count",
          version: "1",
          certification: "draft",
          value: activeCount,
          display: `${activeCount} active`,
        },
        {
          metricId: "customers.total_count",
          version: "1",
          certification: "draft",
          value: totalCount,
          display: `${totalCount} total`,
        },
      ],
      charts: statePoints.length
        ? [
            {
              bindingId: "kpi_strip",
              metricIds: ["customers.active_count"],
              title: "Active customers by billing state",
              points: statePoints,
            },
          ]
        : [
            {
              bindingId: "kpi_strip",
              metricIds: ["customers.active_count", "customers.total_count"],
              title: "Active vs total customers",
              points: [
                { label: "Active", value: activeCount, unit: "count" },
                { label: "Total", value: totalCount, unit: "count" },
              ],
            },
          ],
      tables: [
        {
          id: "customers_rows",
          title: "Recent customers",
          columns: ["Code", "Name", "Company", "State", "Active"],
          rows: recentCustomers.map((c) => [
            reportCell(c.id),
            reportCell(c.name),
            reportCell(c.company),
            reportCell(c.state),
            c.active ? "yes" : "no",
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: ["Master directory counts only — not outstanding balances (use receivables)."],
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
