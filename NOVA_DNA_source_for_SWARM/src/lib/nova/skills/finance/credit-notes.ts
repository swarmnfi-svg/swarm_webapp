/**
 * Finance skill — credit_notes_summary (extracted from nova-tools; behaviour identical).
 * Report-intent asks return a savable credit_notes_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
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

const n = (v: unknown) => Number(v ?? 0);

export async function runCreditNotesSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, tz, query, entityFilterName, sampleLimit } = ctx;
  const name = "credit_notes_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing invoice.read and/or finance aggregates",
      },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const period = range ?? novaCurrentMonthRange(new Date(), tz);
  const customerFilter = entityFilterName
    ? {
        invoice: {
          customer: {
            customerName: { contains: entityFilterName, mode: "insensitive" as const },
          },
        },
      }
    : {};
  const cnWhere = {
    cnDate: { gte: period.from, lte: period.to },
    voidedAt: null,
    ...customerFilter,
  };
  const dnWhere = {
    dnDate: { gte: period.from, lte: period.to },
    ...(entityFilterName
      ? {
          OR: [
            {
              invoice: {
                customer: {
                  customerName: { contains: entityFilterName, mode: "insensitive" as const },
                },
              },
            },
            {
              projectRef: { contains: entityFilterName, mode: "insensitive" as const },
            },
          ],
        }
      : {}),
  };
  const sampleTake = reportIntent ? rowCap : (sampleLimit ?? 6);
  const [cnCount, cnAgg, dnCount, dnAgg, cnSamples] = await Promise.all([
    prisma.salesCreditNote.count({ where: cnWhere }),
    prisma.salesCreditNote.aggregate({ where: cnWhere, _sum: { grandTotal: true } }),
    prisma.salesDebitNote.count({ where: dnWhere }).catch(() => 0),
    prisma.salesDebitNote
      .aggregate({ where: dnWhere, _sum: { grandTotal: true } })
      .catch(() => ({ _sum: { grandTotal: 0 } })),
    prisma.salesCreditNote.findMany({
      where: cnWhere,
      orderBy: { cnDate: "desc" },
      take: sampleTake,
      select: { cnNumber: true, grandTotal: true, cnDate: true, reason: true },
    }),
  ]);

  links.push({ title: "Billing", href: "/billing" });

  const cnTotal = n(cnAgg._sum.grandTotal);
  const dnTotal = n(dnAgg._sum.grandTotal);
  const samples = cnSamples.map((c) => ({
    no: c.cnNumber,
    amount: n(c.grandTotal),
    amountInr: inr(n(c.grandTotal)),
    date: formatDateOnly(c.cnDate, tz),
    reason: c.reason,
  }));

  const data = withFactProvenance(
    {
      period: period.label,
      entityFilter: entityFilterName ?? null,
      creditNoteCount: cnCount,
      creditNoteTotal: cnTotal,
      creditNoteTotalInr: inr(cnTotal),
      debitNoteCount: dnCount,
      debitNoteTotal: dnTotal,
      debitNoteTotalInr: inr(dnTotal),
      samples,
    },
    { period: period.label, sources: ["credit_notes"] }
  );

  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "credit_notes_report",
      reportMode,
      title: "Credit / debit notes report",
      headline: `${period.label}: CN ${cnCount} (${inr(cnTotal)}) · DN ${dnCount} (${inr(dnTotal)})`,
      period: {
        label: period.label,
        grain: "month",
        calendarKind: "calendar_month",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "credit_notes.cn_count",
          version: "1",
          certification: "draft",
          value: cnCount,
          display: `${cnCount} CN`,
          periodLabel: period.label,
        },
        {
          metricId: "credit_notes.cn_total",
          version: "1",
          certification: "draft",
          value: cnTotal,
          display: inr(cnTotal),
          periodLabel: period.label,
        },
        {
          metricId: "credit_notes.dn_total",
          version: "1",
          certification: "draft",
          value: dnTotal,
          display: inr(dnTotal),
          periodLabel: period.label,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["credit_notes.cn_total", "credit_notes.dn_total"],
          title: "CN vs DN totals",
          points: [
            { label: "Credit notes", value: cnTotal, unit: "inr" as const },
            { label: "Debit notes", value: dnTotal, unit: "inr" as const },
          ],
        },
        {
          bindingId: "ageing_or_attention",
          metricIds: ["credit_notes.cn_total"],
          title: "Credit note amounts (sample)",
          points: samples.slice(0, 8).map((s) => ({
            label: String(s.no ?? "CN").slice(0, 18),
            value: s.amount,
            unit: "inr" as const,
          })),
        },
      ],
      tables: [
        {
          id: "credit_notes_rows",
          title: "Credit notes",
          columns: ["CN", "Date", "Amount", "Reason"],
          rows: samples.map((s) => [
            reportCell(s.no),
            reportCell(s.date),
            reportCell(s.amountInr),
            reportCell(s.reason),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Voided credit notes excluded. Org finance aggregate gate applies. Never re-sum sample rows.",
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
