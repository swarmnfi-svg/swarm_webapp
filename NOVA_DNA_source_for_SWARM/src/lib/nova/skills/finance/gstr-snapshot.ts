/**
 * Finance skill — gstr_snapshot (extracted from nova-tools; behaviour identical).
 * Calendar-month GSTR-1 / GSTR-3B totals from real report builders (no invented GST).
 * Report-intent asks return a savable gstr_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { getCalendarDateInTimezone } from "@/lib/datetime-pure";
import { novaMoney } from "@/lib/ai/nova-money";
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

export async function runGstrSnapshot(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, tz, query, sampleLimit } = ctx;
  const name = "gstr_snapshot";
  const links: NovaToolLink[] = [];

  if (!can(user, "reports.read") && !can(user, "invoice.read")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing reports.read / invoice.read",
      },
    };
  }
  if (!canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing finance aggregate access",
      },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const periodCal = range
    ? getCalendarDateInTimezone(range.from, tz)
    : getCalendarDateInTimezone(new Date(), tz);
  const periodKey = `${periodCal.year}-${String(periodCal.month).padStart(2, "0")}`;
  const [{ getGstr1Report }, { getGstr3bReport }] = await Promise.all([
    import("@/lib/reports/gstr1"),
    import("@/lib/reports/gstr3b"),
  ]);
  const [g1, g3] = await Promise.all([
    getGstr1Report(periodKey).catch(() => null),
    getGstr3bReport(periodKey).catch(() => null),
  ]);
  if (!g1 && !g3) {
    return {
      fact: {
        tool: name,
        ok: false,
        error: "GSTR lookup failed. Open /reports/gstr1 or /reports/gstr3b — do not treat as ₹0 GST.",
      },
      links: [
        { title: "GSTR-1", href: "/reports/gstr1" },
        { title: "GSTR-3B", href: "/reports/gstr3b" },
      ],
    };
  }
  const g1Tax = g1?.totals ? novaMoney(g1.totals.taxable) : null;
  const g1Gst = g1?.totals ? novaMoney(g1.totals.totalGst) : null;
  const g3OutRaw =
    g3?.totals?.outputTax && typeof g3.totals.outputTax === "object"
      ? n((g3.totals.outputTax as { igst?: number }).igst) +
        n((g3.totals.outputTax as { cgst?: number }).cgst) +
        n((g3.totals.outputTax as { sgst?: number }).sgst) +
        n((g3.totals.outputTax as { cess?: number }).cess)
      : n(g3?.totals?.outputTax);
  const g3NetRaw =
    g3?.totals?.netPayable && typeof g3.totals.netPayable === "object"
      ? n((g3.totals.netPayable as { total?: number }).total)
      : n(g3?.totals?.netPayable);
  const g3Out = g3?.totals ? novaMoney(g3OutRaw) : null;
  const g3Net = g3?.totals ? novaMoney(g3NetRaw) : null;

  links.push({ title: "GSTR-1", href: "/reports/gstr1" });
  links.push({ title: "GSTR-3B", href: "/reports/gstr3b" });

  const data = withFactProvenance(
    {
      periodKey,
      period: periodKey,
      gstr1Taxable: g1Tax?.value ?? null,
      gstr1TaxableInr: g1Tax?.valueInr ?? null,
      gstr1TotalGst: g1Gst?.value ?? null,
      gstr1TotalGstInr: g1Gst?.valueInr ?? null,
      gstr3bOutputTax: g3Out?.value ?? null,
      gstr3bOutputTaxInr: g3Out?.valueInr ?? null,
      gstr3bNetPayable: g3Net?.value ?? null,
      gstr3bNetPayableInr: g3Net?.valueInr ?? null,
      gstr1: g1
        ? {
            b2bCount: Array.isArray(g1.b2b) ? g1.b2b.length : 0,
            b2csCount: Array.isArray(g1.b2cs) ? g1.b2cs.length : 0,
            cdnrCount: Array.isArray(g1.cdnr) ? g1.cdnr.length : 0,
            taxable: g1Tax?.value ?? null,
            taxableInr: g1Tax?.valueInr ?? null,
            totalGst: g1Gst?.value ?? null,
            totalGstInr: g1Gst?.valueInr ?? null,
          }
        : null,
      gstr3b: g3
        ? {
            outputTax: g3Out?.value ?? null,
            outputTaxInr: g3Out?.valueInr ?? null,
            netPayable: g3Net?.value ?? null,
            netPayableInr: g3Net?.valueInr ?? null,
            purchaseBillCount: g3.totals?.purchaseBillCount ?? null,
          }
        : null,
      moneyNote: "Copy *Inr fields exactly. Period is calendar month (GST), not Indian FY.",
      note: `GSTR counts/totals for ${periodKey} (calendar month). Open Reports → GSTR for filing JSON.`,
    },
    { period: periodKey, sources: ["gstr_snapshot"] }
  );

  if (reportIntent) {
    const moneyPoints = [
      g1Tax ? { label: "GSTR-1 taxable", value: g1Tax.value, unit: "inr" as const } : null,
      g1Gst ? { label: "GSTR-1 GST", value: g1Gst.value, unit: "inr" as const } : null,
      g3Out ? { label: "3B output tax", value: g3Out.value, unit: "inr" as const } : null,
      g3Net ? { label: "3B net payable", value: g3Net.value, unit: "inr" as const } : null,
    ].filter(Boolean) as Array<{ label: string; value: number; unit: "inr" }>;

    const countPoints: Array<{ label: string; value: number; unit: "count" }> = [];
    if (g1) {
      countPoints.push(
        { label: "B2B", value: Array.isArray(g1.b2b) ? g1.b2b.length : 0, unit: "count" },
        { label: "B2CS", value: Array.isArray(g1.b2cs) ? g1.b2cs.length : 0, unit: "count" },
        { label: "CDNR", value: Array.isArray(g1.cdnr) ? g1.cdnr.length : 0, unit: "count" }
      );
    }

    const { attachment } = buildSkillReportPack({
      packId: "gstr_report",
      reportMode,
      title: "GSTR taxable / payable report",
      headline: `${periodKey}: GSTR-1 taxable ${g1Tax?.valueInr ?? "n/a"} · 3B net ${g3Net?.valueInr ?? "n/a"}`,
      period: {
        label: periodKey,
        grain: "month",
        calendarKind: "calendar_month",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "gstr.gstr1_taxable",
          version: "1",
          certification: "draft",
          value: g1Tax?.value ?? null,
          display: g1Tax?.valueInr ?? "unavailable",
          periodLabel: periodKey,
        },
        {
          metricId: "gstr.gstr1_total_gst",
          version: "1",
          certification: "draft",
          value: g1Gst?.value ?? null,
          display: g1Gst?.valueInr ?? "unavailable",
          periodLabel: periodKey,
        },
        {
          metricId: "gstr.gstr3b_net_payable",
          version: "1",
          certification: "draft",
          value: g3Net?.value ?? null,
          display: g3Net?.valueInr ?? "unavailable",
          periodLabel: periodKey,
        },
      ],
      charts: [
        ...(moneyPoints.length
          ? [
              {
                bindingId: "kpi_strip" as const,
                metricIds: ["gstr.gstr1_taxable", "gstr.gstr3b_net_payable"],
                title: "GSTR money totals",
                points: moneyPoints,
              },
            ]
          : []),
        ...(countPoints.length
          ? [
              {
                bindingId: "ageing_or_attention" as const,
                metricIds: ["gstr.gstr1_taxable"],
                title: "GSTR-1 document counts",
                points: countPoints,
              },
            ]
          : []),
      ],
      tables: [
        {
          id: "gstr_totals",
          title: "GSTR snapshot totals",
          columns: ["Source", "Metric", "Amount"],
          rows: [
            ["GSTR-1", "Taxable", reportCell(g1Tax?.valueInr, "unavailable")],
            ["GSTR-1", "Total GST", reportCell(g1Gst?.valueInr, "unavailable")],
            ["GSTR-3B", "Output tax", reportCell(g3Out?.valueInr, "unavailable")],
            ["GSTR-3B", "Net payable", reportCell(g3Net?.valueInr, "unavailable")],
          ],
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Calendar-month GST builders only — not e-invoice/e-way docs. Org finance gate applies. Soft-fail never invents ₹0.",
      ],
    });
    return {
      fact: {
        tool: name,
        ok: true,
        data: withSkillReportAttachment(data, attachment),
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
