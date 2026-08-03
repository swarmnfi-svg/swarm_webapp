/**
 * Finance skill — reports_snapshot (extracted from nova-tools; behaviour identical).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { currentIndianFyRange } from "@/lib/ai/nova-dates";
import { novaMoney } from "@/lib/ai/nova-money";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const n = (v: unknown) => Number(v ?? 0);

export async function runReportsSnapshot(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, tz, query } = ctx;
  const name = "reports_snapshot";
  const links: NovaToolLink[] = [];

  if (!can(user, "reports.read") && !canViewOrgFinanceAggregates(user)) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing reports.read" },
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

  const fyResolved =
    range?.label.startsWith("FY ") ? range : currentIndianFyRange(new Date(), tz);
  const fy = fyResolved.label.replace(/^FY\s+/i, "");
  const q = query.toLowerCase();
  const wantsSalesReg = /\b(sales\s+register|invoice\s+register)\b/.test(q);
  const wantsAging = /\b(aging|ageing|ar\s+aging|receivable\s+aging)\b/.test(q);
  const {
    getReportSummary,
    getReceivablesAgingBuckets,
    getReceivablesOutstandingTotal,
    getPayablesOutstandingTotal,
    getSalesRegisterPage,
  } = await import("@/lib/reports/queries");
  type MoneySettle = { ok: true; value: number } | { ok: false };
  const settleMoney = async (promise: Promise<number>): Promise<MoneySettle> => {
    try {
      return { ok: true, value: await promise };
    } catch {
      return { ok: false };
    }
  };

  const [summary, arBuckets, arSettle, apSettle, salesPage] = await Promise.all([
    getReportSummary(fy).catch(() => null),
    wantsAging || !wantsSalesReg
      ? getReceivablesAgingBuckets().catch(() => null)
      : Promise.resolve(null),
    settleMoney(getReceivablesOutstandingTotal()),
    settleMoney(getPayablesOutstandingTotal()),
    wantsSalesReg ? getSalesRegisterPage(fy, 1, 8).catch(() => null) : Promise.resolve(null),
  ]);

  // Unambiguous soft-fail: primary money totals both errored and no summary → surface error, not ₹0.
  if (!summary && !arSettle.ok && !apSettle.ok) {
    return {
      fact: {
        tool: name,
        ok: false,
        error: "Reports money lookup failed. Open /reports or try again — do not treat as ₹0.",
      },
      links: [{ title: "Reports", href: "/reports" }],
    };
  }

  const arTotal = arSettle.ok ? arSettle.value : 0;
  const apTotal = apSettle.ok ? apSettle.value : 0;
  const salesM = summary ? novaMoney(summary.salesTotal) : null;
  const collM = summary ? novaMoney(summary.collections) : null;
  const purchM = summary ? novaMoney(summary.purchases) : null;
  const arM = summary ? novaMoney(summary.receivables) : null;
  const apM = summary ? novaMoney(summary.payables) : null;
  const arOut = novaMoney(arTotal);
  const apOut = novaMoney(apTotal);

  links.push({ title: "Reports", href: "/reports" });
  if (wantsSalesReg) links.push({ title: "Sales register", href: "/reports/sales-register" });
  if (wantsAging) links.push({ title: "Receivables", href: "/accounts/receivables" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          fy,
          period: fyResolved.label,
          salesTotalInr: salesM?.valueInr ?? null,
          collectionsInr: collM?.valueInr ?? null,
          reportSummary: summary
            ? {
                salesTotal: salesM!.value,
                salesTotalInr: salesM!.valueInr,
                collections: collM!.value,
                collectionsInr: collM!.valueInr,
                purchases: purchM!.value,
                purchasesInr: purchM!.valueInr,
                receivables: arM!.value,
                receivablesInr: arM!.valueInr,
                payables: apM!.value,
                payablesInr: apM!.valueInr,
              }
            : null,
          receivablesOutstanding: arSettle.ok ? arOut.value : null,
          receivablesOutstandingInr: arSettle.ok ? arOut.valueInr : null,
          payablesOutstanding: apSettle.ok ? apOut.value : null,
          payablesOutstandingInr: apSettle.ok ? apOut.valueInr : null,
          moneyLookupPartialFailure: !arSettle.ok || !apSettle.ok,
          receivablesAging: arBuckets
            ? {
                b0: n(arBuckets.buckets.b0),
                b0Inr: novaMoney(arBuckets.buckets.b0).valueInr,
                b30: n(arBuckets.buckets.b30),
                b30Inr: novaMoney(arBuckets.buckets.b30).valueInr,
                b60: n(arBuckets.buckets.b60),
                b60Inr: novaMoney(arBuckets.buckets.b60).valueInr,
                b90: n(arBuckets.buckets.b90),
                b90Inr: novaMoney(arBuckets.buckets.b90).valueInr,
                agingTotal: n(arBuckets.total),
                agingTotalInr: novaMoney(arBuckets.total).valueInr,
              }
            : null,
          salesRegisterSampleCount: salesPage?.rows?.length ?? null,
          salesRegisterTotal: salesPage?.total ?? null,
          moneyNote: "Copy *Inr fields exactly. Never reinterpret Indian commas. Null outstanding = lookup failed (not ₹0).",
          note: `Reports snapshot for ${fyResolved.label} (Indian FY). Open /reports for full registers.`,
        },
        { period: fyResolved.label, sources: ["reports_snapshot"] }
      ),
    },
    links,
  };
}
