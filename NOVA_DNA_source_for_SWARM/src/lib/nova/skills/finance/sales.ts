/**
 * Finance skill — sales_summary (tax invoices).
 * Report-intent asks return a savable sales_billing_report pack.
 */
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { formatDateOnly } from "@/lib/datetime-pure";
import { resolveToolPeriod } from "@/lib/ai/nova-dates";
import { novaMoney } from "@/lib/ai/nova-money";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const n = (v: unknown) => Number(v ?? 0);

export async function runSalesSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, tz, range, entityFilterName, resolvedEntityType, resolvedEntityDbId, sampleLimit } =
    ctx;
  const name = "sales_summary";

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
  const { period, periodGrain, periodSource } = resolveToolPeriod(
    range,
    "month",
    new Date(),
    tz
  );
  const fyKey = period.label.startsWith("FY ")
    ? period.label.replace(/^FY\s+/i, "").trim()
    : null;
  const excludedStatuses: InvoiceStatus[] = ["DRAFT", "CANCELLED", "REVERSED"];
  const taxWhere: Prisma.SalesInvoiceWhereInput = {
    ...(fyKey
      ? { financialYear: fyKey }
      : { invoiceDate: { gte: period.from, lte: period.to } }),
    status: { notIn: excludedStatuses },
    docType: "TAX_INVOICE",
    ...(entityFilterName
      ? resolvedEntityType === "customer" && resolvedEntityDbId
        ? { customerId: resolvedEntityDbId }
        : { customer: { customerName: { contains: entityFilterName, mode: "insensitive" } } }
      : {}),
  };
  const [agg, count, samples] = await Promise.all([
    prisma.salesInvoice.aggregate({
      where: taxWhere,
      _sum: { grandTotal: true, taxableValue: true, totalGst: true },
      _count: true,
    }),
    prisma.salesInvoice.count({ where: taxWhere }),
    prisma.salesInvoice.findMany({
      where: taxWhere,
      orderBy: { invoiceDate: "desc" },
      take: reportIntent ? rowCap : (sampleLimit ?? 8),
      select: {
        invoiceNumber: true,
        invoiceDate: true,
        grandTotal: true,
        status: true,
        customer: { select: { customerName: true } },
      },
    }),
  ]);
  const total = n(agg._sum.grandTotal);
  const taxable = n(agg._sum.taxableValue);
  const gst = n(agg._sum.totalGst);
  const money = novaMoney(total);
  const taxableMoney = novaMoney(taxable);
  const gstMoney = novaMoney(gst);
  const sampleInvoices = samples.map((s) => {
    const a = novaMoney(s.grandTotal);
    return {
      number: s.invoiceNumber,
      date: formatDateOnly(s.invoiceDate, tz),
      customer: s.customer.customerName,
      amount: a.value,
      amountInr: a.valueInr,
      status: s.status,
    };
  });

  const data = withFactProvenance(
    {
      period: period.label,
      periodGrain,
      periodSource,
      timezone: tz,
      fromLabel: formatDateOnly(period.from, tz),
      toLabel: formatDateOnly(period.to, tz),
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      filterBy: fyKey ? `financialYear=${fyKey}` : "invoiceDate",
      customerFilter: entityFilterName ?? null,
      invoiceCount: count,
      taxableTotal: taxableMoney.value,
      taxableTotalInr: taxableMoney.valueInr,
      gstTotal: gstMoney.value,
      gstTotalInr: gstMoney.valueInr,
      grandTotal: money.value,
      grandTotalInr: money.valueInr,
      moneyNote:
        "Use grandTotal / grandTotalInr as the sales total. Indian grouping: ₹6,37,000.00 = 637000. Never re-sum sampleInvoices. sampleInvoices is a partial list.",
      sampleCount: sampleInvoices.length,
      sampleInvoices,
    },
    { period: period.label, sources: ["sales_invoice"] }
  );

  const links = [{ title: "Billing", href: "/billing" }];

  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "sales_billing_report",
      reportMode,
      title: "Sales / billing report",
      headline: `${period.label}: ${count} tax invoice(s) · ${money.valueInr}`,
      period: {
        label: period.label,
        grain:
          periodGrain === "day" || periodGrain === "week" || periodGrain === "month" || periodGrain === "fy"
            ? periodGrain
            : fyKey
              ? "fy"
              : "month",
        calendarKind: fyKey ? "financial_year" : "calendar_month",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "sales.invoice_count",
          version: "1",
          certification: "draft",
          value: count,
          display: `${count} invoices`,
          periodLabel: period.label,
        },
        {
          metricId: "sales.grand_total",
          version: "1",
          certification: "draft",
          value: money.value,
          display: money.valueInr,
          periodLabel: period.label,
        },
        {
          metricId: "sales.gst_total",
          version: "1",
          certification: "draft",
          value: gstMoney.value,
          display: gstMoney.valueInr,
          periodLabel: period.label,
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["sales.grand_total"],
          title: "Invoice amount (sample)",
          points: sampleInvoices.slice(0, 8).map((s) => ({
            label: String(s.customer || s.number).slice(0, 18),
            value: Number(s.amount ?? 0),
            unit: "inr",
          })),
        },
      ],
      tables: [
        {
          id: "sales_invoices",
          title: "Tax invoices",
          columns: ["Invoice", "Date", "Customer", "Amount", "Status"],
          rows: sampleInvoices.map((s) => [
            reportCell(s.number),
            reportCell(s.date),
            reportCell(s.customer),
            reportCell(s.amountInr),
            reportCell(s.status),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: ["Tax invoices only (excl. draft/cancelled/reversed). Org finance aggregate gate applies."],
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
