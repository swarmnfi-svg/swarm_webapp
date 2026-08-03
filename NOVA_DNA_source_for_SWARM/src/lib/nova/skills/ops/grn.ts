/**
 * Ops skill — grn_summary (extracted from nova-tools; behaviour identical).
 * Report-intent asks return a savable grn_report pack.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { novaCurrentMonthRange } from "@/lib/ai/nova-dates";
import { formatDateOnly } from "@/lib/datetime-pure";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

export async function runGrnSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, tz, query, entityFilterName, sampleLimit } = ctx;
  const name = "grn_summary";
  const links: NovaToolLink[] = [];

  if (
    !can(user, "stock.read") &&
    !can(user, "purchaseorder.read") &&
    !can(user, "purchaserequest.read")
  ) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing stock/purchase read",
      },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const period = range ?? novaCurrentMonthRange(new Date(), tz);
  const entityGrn = entityFilterName
    ? {
        OR: [
          { projectRef: { contains: entityFilterName, mode: "insensitive" as const } },
          { po: { poId: { contains: entityFilterName, mode: "insensitive" as const } } },
          {
            po: {
              vendor: {
                vendorName: { contains: entityFilterName, mode: "insensitive" as const },
              },
            },
          },
        ],
      }
    : {};
  const where = {
    receivedDate: { gte: period.from, lte: period.to },
    ...entityGrn,
  };
  const sampleTake = reportIntent ? rowCap : (sampleLimit ?? 8);
  const [count, samples] = await Promise.all([
    prisma.materialReceipt.count({ where }),
    prisma.materialReceipt.findMany({
      where,
      orderBy: { receivedDate: "desc" },
      take: sampleTake,
      select: {
        receiptId: true,
        projectRef: true,
        receivedDate: true,
        poId: true,
        po: { select: { poId: true } },
      },
    }),
  ]);

  links.push({ title: "Stock", href: "/stock" });
  links.push({ title: "Purchase orders", href: "/purchase-orders" });

  const mapped = samples.map((s) => ({
    id: s.receiptId,
    project: s.projectRef,
    po: s.po?.poId ?? s.poId,
    date: formatDateOnly(s.receivedDate, tz),
  }));

  const data = withFactProvenance(
    {
      period: period.label,
      entityFilter: entityFilterName ?? null,
      grnCount: count,
      samples: mapped,
    },
    { period: period.label, sources: ["grn"] }
  );

  if (reportIntent) {
    const byProject = new Map<string, number>();
    for (const s of mapped) {
      const key = String(s.project ?? "—").slice(0, 18);
      byProject.set(key, (byProject.get(key) ?? 0) + 1);
    }
    const projectPoints = [...byProject.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, unit: "count" as const }));

    const { attachment } = buildSkillReportPack({
      packId: "grn_report",
      reportMode,
      title: "GRN / material receipts report",
      headline: `${period.label}: ${count} GRN(s)`,
      period: {
        label: period.label,
        grain: "month",
        calendarKind: "calendar_month",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "grn.count",
          version: "1",
          certification: "draft",
          value: count,
          display: `${count} GRN`,
          periodLabel: period.label,
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["grn.count"],
          title: "GRN count by project (sample)",
          points: projectPoints,
        },
      ],
      tables: [
        {
          id: "grn_rows",
          title: "Material receipts",
          columns: ["GRN", "Project", "PO", "Date"],
          rows: mapped.map((s) => [
            reportCell(s.id),
            reportCell(s.project),
            reportCell(s.po),
            reportCell(s.date),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Material receipts in period only. Requires stock.read or purchase order/request read.",
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
