/**
 * Skill — receivables_summary (extracted from nova-tools; behaviour identical).
 * Report-intent asks return a savable receivables_report pack (PDF + charts).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { novaTodayStart } from "@/lib/ai/nova-dates";
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
          sources: ["sales_invoice"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runReceivablesSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, tz, entityFilterName, sampleLimit } = ctx;
  const name = "receivables_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing invoice.read and/or accounts/finance reports permission",
    });
    return finalize();
  }
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const today = novaTodayStart(new Date(), tz);
  const customerFilter = entityFilterName
    ? { customer: { customerName: { contains: entityFilterName, mode: "insensitive" as const } } }
    : {};
  const overdueWhere = {
    OR: [
      { status: "OVERDUE" as const },
      { status: { in: ["SENT" as const, "PART_PAID" as const] }, dueDate: { lt: today } },
    ],
    ...customerFilter,
  };
  const openWhere = {
    status: { in: ["SENT" as const, "PART_PAID" as const, "OVERDUE" as const] },
    ...customerFilter,
  };
  const [overdueCount, overdueAgg, openCount, openAgg, overdueRows] = await Promise.all([
    prisma.salesInvoice.count({ where: overdueWhere }),
    prisma.salesInvoice.aggregate({ where: overdueWhere, _sum: { grandTotal: true } }),
    prisma.salesInvoice.count({ where: openWhere }),
    prisma.salesInvoice.aggregate({ where: openWhere, _sum: { grandTotal: true } }),
    prisma.salesInvoice.findMany({
      where: overdueWhere,
      orderBy: { dueDate: "asc" },
      take: reportIntent ? rowCap : (sampleLimit ?? 8),
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        grandTotal: true,
        status: true,
        customer: { select: { customerName: true } },
      },
    }),
  ]);
  const overdueTotal = n(overdueAgg._sum.grandTotal);
  const openTotal = n(openAgg._sum.grandTotal);
  const samples = overdueRows.map((r) => {
    const dueMs = r.dueDate?.getTime() ?? null;
    const daysOverdue =
      dueMs != null ? Math.max(0, Math.floor((today.getTime() - dueMs) / 86400000)) : 0;
    return {
      number: r.invoiceNumber,
      customer: r.customer.customerName,
      due: r.dueDate?.toISOString().slice(0, 10) ?? null,
      amount: n(r.grandTotal),
      amountInr: inr(n(r.grandTotal)),
      status: r.status,
      daysOverdue,
      href: `/billing/${r.id}`,
    };
  });
  const data = {
    overdueCount,
    overdueTotal,
    overdueTotalInr: inr(overdueTotal),
    openInvoiceCount: openCount,
    openInvoiceTotal: openTotal,
    openInvoiceTotalInr: inr(openTotal),
    sampleCount: samples.length,
    samples,
    note: "Totals are invoice grand totals (not net of receipts). Use *Inr / raw totals — do not re-sum. samples[].customer are party names for 'who are they' follow-ups.",
  };
  for (const r of overdueRows.slice(0, 5)) {
    links.push({ title: `${r.customer.customerName} · ${r.invoiceNumber}`, href: `/billing/${r.id}` });
  }
  links.push({ title: "Billing", href: "/billing" });
  links.push({ title: "Receivables", href: "/accounts/receivables" });

  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "receivables_report",
      reportMode,
      title: "Receivables / overdue invoices report",
      headline: `${overdueCount} overdue invoice(s) · ${inr(overdueTotal)} overdue · ${openCount} open (${inr(openTotal)})`,
      period: {
        label: "open / overdue",
        grain: "open",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "receivables.overdue_count",
          version: "1",
          certification: "draft",
          value: overdueCount,
          display: `${overdueCount} overdue`,
        },
        {
          metricId: "receivables.overdue_total",
          version: "1",
          certification: "draft",
          value: overdueTotal,
          display: inr(overdueTotal),
        },
        {
          metricId: "receivables.open_count",
          version: "1",
          certification: "draft",
          value: openCount,
          display: `${openCount} open`,
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["receivables.overdue_total"],
          title: "Overdue amount by customer",
          points: samples.slice(0, 8).map((s) => ({
            label: (s.customer || s.number || "Invoice").slice(0, 18),
            value: s.amount,
            unit: "inr",
          })),
        },
        {
          bindingId: "kpi_strip",
          metricIds: ["receivables.overdue_count"],
          title: "Days overdue (sample)",
          points: samples.slice(0, 8).map((s) => ({
            label: (s.number || s.customer || "Inv").slice(0, 18),
            value: s.daysOverdue,
            unit: "days",
          })),
        },
      ],
      tables: [
        {
          id: "overdue_invoices",
          title: "Overdue invoices",
          columns: ["Invoice", "Customer", "Due", "Days", "Amount", "Status"],
          rows: samples.map((s) => [
            reportCell(s.number),
            reportCell(s.customer),
            reportCell(s.due),
            `${s.daysOverdue}d`,
            reportCell(s.amountInr),
            reportCell(s.status),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Totals are invoice grand totals (not net of receipts). Permission floor: invoice.read + org finance aggregates.",
      ],
    });
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(data, attachment),
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
