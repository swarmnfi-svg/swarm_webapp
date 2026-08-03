/**
 * Finance skill — director_dashboard_summary (extracted from nova-tools; behaviour identical).
 * Same metrics source as /director — no invented TB or bank IDs.
 */
import { can } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { currentIndianFyRange } from "@/lib/ai/nova-dates";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const n = (v: unknown) => Number(v ?? 0);

export async function runDirectorDashboardSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, tz } = ctx;
  const name = "director_dashboard_summary";
  const links: NovaToolLink[] = [];

  if (
    !can(user, "director.dashboard") &&
    !can(user, "finance.dashboard.read") &&
    !can(user, "accounts.dashboard.read")
  ) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing director.dashboard / finance dashboard access",
      },
    };
  }

  const period = range?.label.startsWith("FY ")
    ? range
    : currentIndianFyRange(new Date(), tz);
  const fyKey =
    period.label.match(/(\d{2})-(\d{2})/)?.[0] ??
    period.label.replace(/^FY\s+/i, "").trim();
  const { getDirectorDashboardData } = await import("@/lib/director-metrics");
  const d = await getDirectorDashboardData(fyKey);
  const ob = d.orderBook;
  const periodLabel = `FY ${d.fy}`;

  links.push({ title: "Director dashboard", href: "/director" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          period: periodLabel,
          isCurrentFy: d.isCurrentFy,
          bankBalance: d.bankBal,
          bankBalanceInr: inr(d.bankBal),
          todayIn: d.todayIn,
          todayInInr: inr(d.todayIn),
          todayOut: d.todayOut,
          todayOutInr: inr(d.todayOut),
          periodSales: d.monthSales,
          periodSalesInr: inr(d.monthSales),
          periodCollection: d.monthCollection,
          periodCollectionInr: inr(d.monthCollection),
          fySales: n(d.fySummary?.salesTotal),
          fySalesInr: inr(n(d.fySummary?.salesTotal)),
          fyCollection: n(d.fySummary?.collections),
          fyCollectionInr: inr(n(d.fySummary?.collections)),
          receivablesTotal: d.receivablesTotal,
          receivablesTotalInr: inr(d.receivablesTotal),
          payablesTotal: d.payablesTotal,
          payablesTotalInr: inr(d.payablesTotal),
          netGst: d.netGst,
          netGstInr: inr(d.netGst),
          unreconciledBankTxns: d.unreconciled,
          pendingPaymentCount: d.pendingPaymentCount,
          pendingBillCount: d.pendingBillCount,
          orderBook: {
            target: ob.targetOrderBook,
            targetInr: inr(ob.targetOrderBook),
            orderBookValue: ob.orderBookValue,
            orderBookValueInr: inr(ob.orderBookValue),
            completedValue: ob.completedValue,
            completedValueInr: inr(ob.completedValue),
            pendingOrders: ob.pendingOrderTotal,
            pendingOrdersInr: inr(ob.pendingOrderTotal),
            achievementPct: ob.targetAchievementPct,
          },
          lowStockAlertCount: Array.isArray(d.lowStock) ? d.lowStock.length : 0,
          moneyNote: "Copy *Inr fields exactly for every amount. Never re-sum or reinterpret commas.",
          note: "Snapshot from Director Dashboard metrics (same source as /director).",
        },
        { period: periodLabel, sources: ["director_dashboard"] }
      ),
    },
    links,
  };
}
