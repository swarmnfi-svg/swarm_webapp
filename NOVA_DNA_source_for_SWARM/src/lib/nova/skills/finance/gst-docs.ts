/**
 * Finance skill — gst_docs_summary.
 * Report-intent asks return a savable gst_docs_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
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

export async function runGstDocsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, sampleLimit } = ctx;
  const name = "gst_docs_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing invoice.read and/or accounts/finance reports permission",
      },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const [eInv, eWay] = await Promise.all([
    prisma.eInvoiceRecord.groupBy({ by: ["status"], _count: { _all: true } }).catch(() => []),
    prisma.eWayBillRecord.groupBy({ by: ["status"], _count: { _all: true } }).catch(() => []),
  ]);

  links.push({ title: "GST summary", href: "/accounts/gst-summary" });
  links.push({ title: "Billing", href: "/billing" });

  const eInvoiceByStatus = Object.fromEntries(
    (eInv as { status: string; _count: { _all: number } }[]).map((r) => [
      r.status,
      r._count._all,
    ])
  );
  const eWayByStatus = Object.fromEntries(
    (eWay as { status: string; _count: { _all: number } }[]).map((r) => [
      r.status,
      r._count._all,
    ])
  );
  const eInvoiceTotal = (eInv as { _count: { _all: number } }[]).reduce(
    (s, r) => s + r._count._all,
    0
  );
  const eWayTotal = (eWay as { _count: { _all: number } }[]).reduce(
    (s, r) => s + r._count._all,
    0
  );

  const data = withFactProvenance(
    {
      eInvoiceByStatus,
      eWayByStatus,
      eInvoiceTotal,
      eWayTotal,
      note: "E-invoice / e-way bill status counts from compliance records.",
    },
    { sources: ["gst_docs"] }
  );

  if (reportIntent) {
    const eInvPoints = Object.entries(eInvoiceByStatus)
      .map(([label, value]) => ({
        label: String(label).slice(0, 18),
        value: Number(value),
        unit: "count" as const,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const eWayPoints = Object.entries(eWayByStatus)
      .map(([label, value]) => ({
        label: String(label).slice(0, 18),
        value: Number(value),
        unit: "count" as const,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const { attachment } = buildSkillReportPack({
      packId: "gst_docs_report",
      reportMode,
      title: "GST documents report",
      headline: `E-invoice ${eInvoiceTotal} · e-way ${eWayTotal} (status counts)`,
      period: {
        label: "all time",
        grain: "open",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "gst_docs.einvoice_total",
          version: "1",
          certification: "draft",
          value: eInvoiceTotal,
          display: `${eInvoiceTotal} e-invoices`,
        },
        {
          metricId: "gst_docs.eway_total",
          version: "1",
          certification: "draft",
          value: eWayTotal,
          display: `${eWayTotal} e-way bills`,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["gst_docs.einvoice_total"],
          title: "E-invoice by status",
          points: eInvPoints.length
            ? eInvPoints
            : [{ label: "None", value: 0, unit: "count" }],
        },
        {
          bindingId: "ageing_or_attention",
          metricIds: ["gst_docs.eway_total"],
          title: "E-way bill by status",
          points: eWayPoints.length
            ? eWayPoints
            : [{ label: "None", value: 0, unit: "count" }],
        },
      ],
      tables: [
        {
          id: "gst_einvoice_status",
          title: "E-invoice status counts",
          columns: ["Status", "Count"],
          rows: Object.entries(eInvoiceByStatus).map(([status, count]) => [
            reportCell(status),
            reportCell(count),
          ]),
        },
        {
          id: "gst_eway_status",
          title: "E-way bill status counts",
          columns: ["Status", "Count"],
          rows: Object.entries(eWayByStatus).map(([status, count]) => [
            reportCell(status),
            reportCell(count),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Status counts only — not GSTR taxable/payable totals (use gstr_snapshot / reports).",
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
