/**
 * Finance skill — vendors_summary.
 * Report-intent asks return a savable vendors_report pack.
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

export async function runVendorsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, entityFilterName, resolvedEntityType, resolvedEntityDbId, sampleLimit } = ctx;
  const name = "vendors_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "vendor.read")) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing vendor.read" },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const take = reportIntent ? rowCap : (sampleLimit ?? 5);

  const vendorWhere =
    resolvedEntityType === "vendor" && resolvedEntityDbId
      ? { id: resolvedEntityDbId }
      : entityFilterName
        ? {
            OR: [
              { vendorName: { contains: entityFilterName, mode: "insensitive" as const } },
              { vendorId: { contains: entityFilterName, mode: "insensitive" as const } },
            ],
          }
        : {};

  const [activeCount, totalCount, recent] = await Promise.all([
    prisma.vendor.count({ where: { active: true, ...vendorWhere } }).catch(() =>
      prisma.vendor.count({ where: vendorWhere })
    ),
    prisma.vendor.count({ where: vendorWhere }),
    prisma.vendor.findMany({
      where: vendorWhere,
      orderBy: { updatedAt: "desc" },
      take,
      select: { id: true, vendorName: true, vendorId: true, active: true },
    }),
  ]);

  links.push({ title: "Vendors", href: "/vendors" });

  const recentVendors = recent.map((v) => ({
    id: v.vendorId,
    name: v.vendorName,
    active: v.active,
    href: `/vendors/${v.id}`,
  }));

  const data = withFactProvenance(
    {
      activeCount,
      totalCount,
      entityFilter: entityFilterName ?? null,
      recentVendors,
    },
    { sources: ["vendors_master"] }
  );

  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "vendors_report",
      reportMode,
      title: "Vendors report",
      headline: `${activeCount} active of ${totalCount} vendor(s)${
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
          metricId: "vendors.active_count",
          version: "1",
          certification: "draft",
          value: activeCount,
          display: `${activeCount} active`,
        },
        {
          metricId: "vendors.total_count",
          version: "1",
          certification: "draft",
          value: totalCount,
          display: `${totalCount} total`,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["vendors.active_count", "vendors.total_count"],
          title: "Active vs total vendors",
          points: [
            { label: "Active", value: activeCount, unit: "count" },
            { label: "Total", value: totalCount, unit: "count" },
          ],
        },
      ],
      tables: [
        {
          id: "vendors_rows",
          title: "Recent vendors",
          columns: ["Code", "Name", "Active"],
          rows: recentVendors.map((v) => [
            reportCell(v.id),
            reportCell(v.name),
            v.active ? "yes" : "no",
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: ["Master directory counts only — not payables (use purchase bills / payment requests)."],
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
