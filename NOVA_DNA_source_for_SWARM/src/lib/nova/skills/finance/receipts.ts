/**
 * Finance skill — receipts_summary (collections).
 * Report-intent asks return a savable receipts_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
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

export async function runReceiptsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, tz, range, entityHint, entityFilterName, sampleLimit } = ctx;
  const name = "receipts_summary";

  if (!can(user, "receipt.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing receipt.read and/or accounts/finance reports permission",
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
  const where = {
    receiptDate: { gte: period.from, lte: period.to },
    amount: { gt: 0 },
    postingStatus: "POSTED" as const,
    ...(entityHint
      ? {
          OR: [
            { customer: { customerName: { contains: entityFilterName, mode: "insensitive" as const } } },
            { project: { projectName: { contains: entityFilterName, mode: "insensitive" as const } } },
            { project: { projectId: { contains: entityFilterName, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const amountTokens = [
    ...query.matchAll(/\b(\d{1,3}(?:,\d{2}){1,3}|\d{1,3}(?:,\d{3})+|\d{4,})\b/g),
  ]
    .map((m) => Number(String(m[1]).replace(/,/g, "")))
    .filter((v) => Number.isFinite(v) && v >= 1000);

  const take = reportIntent ? rowCap : (sampleLimit ?? 8);

  const [agg, count, samples, amountHits] = await Promise.all([
    prisma.salesReceipt.aggregate({ where, _sum: { amount: true }, _count: true }),
    prisma.salesReceipt.count({ where }),
    prisma.salesReceipt.findMany({
      where,
      orderBy: [{ receiptDate: "desc" }, { amount: "desc" }],
      take,
      select: {
        id: true,
        receiptNumber: true,
        receiptDate: true,
        amount: true,
        paymentMode: true,
        bankReferenceId: true,
        reconciliationStatus: true,
        customer: { select: { customerName: true } },
        project: { select: { projectId: true, projectName: true } },
      },
    }),
    amountTokens.length
      ? prisma.salesReceipt.findMany({
          where: {
            amount: { in: amountTokens },
            // Align with period totals + 3.1.41 project Received: never surface PENDING.
            postingStatus: "POSTED",
          },
          orderBy: { receiptDate: "desc" },
          take: 10,
          select: {
            id: true,
            receiptNumber: true,
            receiptDate: true,
            amount: true,
            paymentMode: true,
            bankReferenceId: true,
            reconciliationStatus: true,
            customer: { select: { customerName: true } },
            project: { select: { projectId: true, projectName: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const mapReceipt = (s: {
    id?: string;
    receiptNumber: string;
    receiptDate: Date;
    amount: unknown;
    paymentMode?: string;
    bankReferenceId?: string | null;
    reconciliationStatus?: string;
    customer?: { customerName?: string } | null;
    project?: { projectId?: string; projectName?: string } | null;
  }) => ({
    number: s.receiptNumber,
    date: formatDateOnly(s.receiptDate, tz),
    customer: s.customer?.customerName ?? "—",
    project: s.project?.projectId
      ? `${s.project.projectId} ${s.project.projectName ?? ""}`.trim()
      : null,
    amount: n(s.amount),
    amountInr: inr(n(s.amount)),
    mode: s.paymentMode ?? null,
    refId: s.bankReferenceId ?? null,
    reconciliation: s.reconciliationStatus ?? null,
    href: s.id ? `/receipts/${s.id}` : "/receipts",
  });

  const sampleReceipts = samples.map(mapReceipt);
  const amountMatches = amountHits.map(mapReceipt);
  const seen = new Set(sampleReceipts.map((r) => r.number));
  for (const hit of amountMatches) {
    if (!seen.has(hit.number)) {
      sampleReceipts.unshift(hit);
      seen.add(hit.number);
    }
  }

  const total = n(agg._sum.amount);
  const collected = novaMoney(total);
  const links = [
    { title: "Receipts", href: "/receipts" },
    ...sampleReceipts.slice(0, 5).map((r) => ({ title: r.number, href: r.href })),
  ];

  const data = withFactProvenance(
    {
      period: period.label,
      periodGrain,
      periodSource,
      timezone: tz,
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      fromLabel: formatDateOnly(period.from, tz),
      toLabel: formatDateOnly(period.to, tz),
      receiptCount: count,
      totalCollected: collected.value,
      totalCollectedInr: collected.valueInr,
      moneyNote:
        "Use totalCollected / totalCollectedInr as the collections total. Never re-sum sampleReceipts. Indian grouping: commas are lakhs/thousands, not Western thousands.",
      sampleCount: Math.min(sampleReceipts.length, take),
      note:
        "Totals include all receipts in this period (matched and unmatched). Dates use company timezone.",
      sampleReceipts: sampleReceipts.slice(0, take),
      amountMatches: amountMatches.length ? amountMatches : undefined,
    },
    { period: period.label, sources: ["sales_receipt"] }
  );

  if (reportIntent) {
    const byCustomer = new Map<string, number>();
    for (const r of sampleReceipts.slice(0, take)) {
      const key = (r.customer || "—").slice(0, 18);
      byCustomer.set(key, (byCustomer.get(key) ?? 0) + Number(r.amount ?? 0));
    }
    const customerPoints = [...byCustomer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, unit: "inr" as const }));

    const { attachment } = buildSkillReportPack({
      packId: "receipts_report",
      reportMode,
      title: "Receipts / collections report",
      headline: `${period.label}: ${count} receipt(s) · ${collected.valueInr}`,
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
          metricId: "receipts.count",
          version: "1",
          certification: "draft",
          value: count,
          display: `${count} receipts`,
          periodLabel: period.label,
        },
        {
          metricId: "receipts.total_collected",
          version: "1",
          certification: "draft",
          value: collected.value,
          display: collected.valueInr,
          periodLabel: period.label,
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["receipts.total_collected"],
          title: "Collected amount by customer (sample)",
          points: customerPoints,
        },
        {
          bindingId: "kpi_strip",
          metricIds: ["receipts.count"],
          title: "Receipt amounts (sample)",
          points: sampleReceipts.slice(0, 8).map((s) => ({
            label: String(s.number || s.customer).slice(0, 18),
            value: Number(s.amount ?? 0),
            unit: "inr",
          })),
        },
      ],
      tables: [
        {
          id: "receipts_rows",
          title: "Posted receipts",
          columns: ["Receipt", "Date", "Customer", "Amount", "Mode", "Recon"],
          rows: sampleReceipts.slice(0, take).map((s) => [
            reportCell(s.number),
            reportCell(s.date),
            reportCell(s.customer),
            reportCell(s.amountInr),
            reportCell(s.mode),
            reportCell(s.reconciliation),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Posted receipts only (amount > 0). Org finance aggregate gate applies. Never re-sum sample rows.",
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
