/**
 * Finance skill — cbg_quotations_summary.
 * Report-intent asks return a savable cbg_quotations_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
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

export async function runCbgQuotationsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, query, sampleLimit } = ctx;
  const name = "cbg_quotations_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "cbgquotation.read")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing cbgquotation.read",
      },
    };
  }

  /** Defense-in-depth with NOVA_ORG_FINANCE_TOOL_IDS money-hide. */
  const showMoney = canViewOrgFinanceAggregates(user);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const take = reportIntent ? rowCap : (sampleLimit ?? 6);
  const periodWhere = range ? { createdAt: { gte: range.from, lte: range.to } } : {};
  const [count, samples, statusGroups] = await Promise.all([
    prisma.cbgQuotation.count({ where: periodWhere }),
    prisma.cbgQuotation.findMany({
      where: periodWhere,
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        id: true,
        quotationNo: true,
        status: true,
        clientName: true,
        projectName: true,
        totalProjectCost: true,
      },
    }),
    prisma.cbgQuotation.groupBy({
      by: ["status"],
      where: periodWhere,
      _count: { _all: true },
    }),
  ]);

  const byStatus = statusGroups
    .map((g) => ({ status: g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  links.push({ title: "CBG quotations", href: "/cbg-quotations" });

  const sampleRows = samples.map((q) => ({
    no: q.quotationNo,
    status: q.status,
    client: q.clientName,
    project: q.projectName,
    cost: showMoney ? n(q.totalProjectCost) : null,
    costInr: showMoney ? inr(n(q.totalProjectCost)) : "hidden",
    href: `/cbg-quotations/${q.id}`,
  }));

  const data = withFactProvenance(
    {
      period: range?.label ?? "all time",
      quotationCount: count,
      byStatus,
      statusCount: byStatus.length,
      balancesVisible: showMoney,
      samples: sampleRows.map(({ cost: _c, ...rest }) => rest),
      note: showMoney
        ? "Status funnel from CbgQuotation.status counts — not a scored conversion model."
        : "Project costs hidden for Staff without finance aggregate access.",
    },
    { period: range?.label ?? null, sources: ["cbg_quotations"] }
  );

  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "cbg_quotations_report",
      reportMode,
      title: "CBG quotations report",
      headline: `${count} quotation(s) in ${range?.label ?? "all time"} · ${byStatus.length} status group(s)`,
      period: {
        label: range?.label ?? "all time",
        grain: range ? "month" : "open",
        calendarKind: range ? "calendar_month" : "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "cbg_quotations.count",
          version: "1",
          certification: "draft",
          value: count,
          display: `${count} quotations`,
          periodLabel: range?.label ?? "all time",
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["cbg_quotations.count"],
          title: "Quotations by status",
          points: byStatus.slice(0, 8).map((s) => ({
            label: String(s.status).slice(0, 18),
            value: s.count,
            unit: "count",
          })),
        },
      ],
      tables: [
        {
          id: "cbg_quotations_rows",
          title: "Recent quotations",
          columns: ["Quotation", "Status", "Client", "Project", "Cost"],
          rows: sampleRows.map((q) => [
            reportCell(q.no),
            reportCell(q.status),
            reportCell(q.client),
            reportCell(q.project),
            reportCell(q.costInr),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        showMoney
          ? "Costs from CbgQuotation.totalProjectCost — not scored conversion."
          : "Project costs hidden without org finance aggregate access.",
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
