/**
 * Finance skill — customer_outstanding (extracted from nova-tools; behaviour identical).
 * Report-intent asks return a savable party_outstanding_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
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

export async function runCustomerOutstanding(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, entityHint, entityFilterName, resolvedEntityType, sampleLimit } = ctx;
  const name = "customer_outstanding";
  const links: NovaToolLink[] = [];

  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing invoice.read / finance aggregates",
      },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const hint = (entityFilterName || entityHint)?.trim();
  const { getReceivables } = await import("@/lib/reports/queries");
  const rows = await getReceivables();
  const filtered = hint
    ? rows.filter((r) => {
        const h = hint.toLowerCase();
        const customer = String(r.customer?.customerName ?? "").toLowerCase();
        const project = String(r.project?.projectName ?? "").toLowerCase();
        const projectCode = String(r.project?.projectId ?? r.projectRef ?? "").toLowerCase();
        if (resolvedEntityType === "project") {
          return project.includes(h) || projectCode.includes(h);
        }
        if (resolvedEntityType === "customer") {
          return customer.includes(h);
        }
        return customer.includes(h) || project.includes(h) || projectCode.includes(h);
      })
    : rows;
  const topLimit = reportIntent ? rowCap : (sampleLimit ?? 8);
  const top = [...filtered]
    .sort((a, b) => n(b.outstanding) - n(a.outstanding))
    .slice(0, topLimit);
  const total = filtered.reduce((s, r) => s + n(r.outstanding), 0);

  links.push({ title: "Receivables", href: "/accounts/receivables" });

  const data = withFactProvenance(
    {
      customerFilter: hint ?? null,
      filterScope: resolvedEntityType ?? "customer_or_project",
      outstandingTotal: total,
      outstandingTotalInr: inr(total),
      rowCount: filtered.length,
      moneyNote:
        "Use outstandingTotal / outstandingTotalInr — invoice AR from open sales invoices; do not sum top samples and do not label as project contract outstanding.",
      top: top.map((r) => ({
        customer: r.customer?.customerName ?? null,
        invoice: r.invoiceNumber ?? null,
        outstanding: n(r.outstanding),
        outstandingInr: inr(n(r.outstanding)),
        days: r.days ?? null,
      })),
    },
    { sources: ["customer_outstanding"] }
  );

  if (reportIntent) {
    const byCustomer = new Map<string, number>();
    for (const r of top) {
      const key = String(r.customer?.customerName ?? "—").slice(0, 18);
      byCustomer.set(key, (byCustomer.get(key) ?? 0) + n(r.outstanding));
    }
    const customerPoints = [...byCustomer.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, unit: "inr" as const }));
    const daysPoints = top.slice(0, 8).map((r) => ({
      label: String(r.invoiceNumber ?? r.customer?.customerName ?? "Inv").slice(0, 18),
      value: Number(r.days ?? 0),
      unit: "days" as const,
    }));

    const { attachment } = buildSkillReportPack({
      packId: "party_outstanding_report",
      reportMode,
      title: "Party outstanding (AR) report",
      headline: `${filtered.length} open invoice row(s) · ${inr(total)} outstanding`,
      period: {
        label: "open AR",
        grain: "open",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "party_outstanding.row_count",
          version: "1",
          certification: "draft",
          value: filtered.length,
          display: `${filtered.length} rows`,
        },
        {
          metricId: "party_outstanding.total",
          version: "1",
          certification: "draft",
          value: total,
          display: inr(total),
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["party_outstanding.total"],
          title: "Outstanding by customer",
          points: customerPoints,
        },
        {
          bindingId: "kpi_strip",
          metricIds: ["party_outstanding.row_count"],
          title: "Days overdue (sample)",
          points: daysPoints,
        },
      ],
      tables: [
        {
          id: "party_outstanding_rows",
          title: "Open invoice AR",
          columns: ["Customer", "Invoice", "Days", "Outstanding"],
          rows: top.map((r) => [
            reportCell(r.customer?.customerName),
            reportCell(r.invoiceNumber),
            reportCell(r.days),
            reportCell(inr(n(r.outstanding))),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Open sales-invoice AR only — not project contract outstanding. Org finance aggregate gate applies. Never re-sum sample rows.",
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
