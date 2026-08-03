/**
 * Finance skill — purchase_bills_summary (extracted from nova-tools; behaviour identical).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { resolveToolPeriod } from "@/lib/ai/nova-dates";
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

export async function runPurchaseBillsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, query, tz, entityHint, entityFilterName, sampleLimit } = ctx;
  const name = "purchase_bills_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "purchasebill.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing purchasebill.read and/or accounts/finance reports permission",
      },
    };
  }

  const { period, periodGrain, periodSource } = resolveToolPeriod(range, "month", new Date(), tz);
  const where = {
    vendorInvoiceDate: { gte: period.from, lte: period.to },
    approvalStatus: { notIn: ["CANCELLED" as const, "REJECTED" as const] },
    ...(entityHint
      ? {
          OR: [
            { vendor: { vendorName: { contains: entityFilterName, mode: "insensitive" as const } } },
            { vendorInvoiceNumber: { contains: entityFilterName, mode: "insensitive" as const } },
            { purchaseBillId: { contains: entityFilterName, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [agg, pendingCount, samples] = await Promise.all([
    prisma.purchaseBill.aggregate({
      where,
      _sum: { totalInvoiceValue: true },
      _count: true,
    }),
    prisma.purchaseBill.count({
      where: {
        approvalStatus: { in: ["SUBMITTED", "MANAGER_VERIFIED"] },
        ...(entityHint
          ? {
              OR: [
                { vendor: { vendorName: { contains: entityFilterName, mode: "insensitive" as const } } },
                { vendorInvoiceNumber: { contains: entityFilterName, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
    }),
    prisma.purchaseBill.findMany({
      where,
      orderBy: { vendorInvoiceDate: "desc" },
      take: 5,
      select: {
        purchaseBillId: true,
        totalInvoiceValue: true,
        approvalStatus: true,
        vendorInvoiceNumber: true,
        vendor: { select: { vendorName: true } },
      },
    }),
  ]);

  links.push({ title: "Purchase bills", href: "/purchase-bills" });

  const data = withFactProvenance(
    {
      period: period.label,
      periodGrain,
      periodSource,
      entityFilter: entityFilterName ?? null,
      billCount: agg._count,
      totalInvoiceValue: n(agg._sum.totalInvoiceValue),
      totalInvoiceValueInr: inr(n(agg._sum.totalInvoiceValue)),
      pendingApprovalCount: pendingCount,
      sampleCount: samples.length,
      samplesShowing: samples.length,
      samplesOf: agg._count,
      samples: samples.map((s) => ({
        id: s.purchaseBillId,
        vendor: s.vendor?.vendorName ?? null,
        vendorInvoice: s.vendorInvoiceNumber,
        amount: n(s.totalInvoiceValue),
        amountInr: inr(n(s.totalInvoiceValue)),
        status: s.approvalStatus,
      })),
    },
    { period: period.label, sources: ["purchase_bills"] }
  );

  const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
  if (reportIntent) {
    const sampleRows = (data as { samples: Array<Record<string, unknown>> }).samples;
    const totalVal = n(agg._sum.totalInvoiceValue);
    const { attachment } = buildSkillReportPack({
      packId: "purchase_stock_report",
      reportMode,
      title: "Purchase bills report",
      headline: `${period.label}: ${agg._count} bill(s) · ${inr(totalVal)} · ${pendingCount} pending approval`,
      period: {
        label: period.label,
        grain:
          periodGrain === "day" || periodGrain === "week" || periodGrain === "month" || periodGrain === "fy"
            ? periodGrain
            : "month",
        calendarKind: "calendar_month",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "purchase.bill_count",
          version: "1",
          certification: "draft",
          value: agg._count,
          display: `${agg._count} bills`,
          periodLabel: period.label,
        },
        {
          metricId: "purchase.total_value",
          version: "1",
          certification: "draft",
          value: totalVal,
          display: inr(totalVal),
          periodLabel: period.label,
        },
        {
          metricId: "purchase.pending_approval",
          version: "1",
          certification: "draft",
          value: pendingCount,
          display: `${pendingCount} pending`,
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["purchase.total_value"],
          title: "Bill amount by vendor (sample)",
          points: sampleRows.slice(0, 8).map((s) => ({
            label: String(s.vendor ?? s.id ?? "Bill").slice(0, 18),
            value: Number(s.amount ?? 0),
            unit: "inr",
          })),
        },
      ],
      tables: [
        {
          id: "purchase_bills",
          title: "Purchase bills",
          columns: ["Bill", "Vendor", "Vendor inv", "Amount", "Status"],
          rows: sampleRows.map((s) => [
            reportCell(s.id),
            reportCell(s.vendor),
            reportCell(s.vendorInvoice),
            reportCell(s.amountInr),
            reportCell(s.status),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: ["Requires purchasebill.read + org finance aggregates."],
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
