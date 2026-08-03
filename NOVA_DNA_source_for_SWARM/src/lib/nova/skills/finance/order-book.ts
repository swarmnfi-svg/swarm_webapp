/**
 * Finance skill — order_book_summary (extracted from nova-tools; behaviour identical).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { inr } from "@/lib/format";
import { currentIndianFyRange } from "@/lib/ai/nova-dates";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

export async function runOrderBookSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, tz } = ctx;
  const name = "order_book_summary";
  const links: NovaToolLink[] = [];

  const canOrderBook =
    can(user, "director.dashboard") || canViewOrgFinanceAggregates(user);
  if (
    !canOrderBook ||
    (!can(user, "project.read") &&
      !can(user, "salesorder.read") &&
      !can(user, "director.dashboard"))
  ) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing director/finance access for order book aggregates",
      },
    };
  }

  const period = range?.label.startsWith("FY ")
    ? range
    : currentIndianFyRange(new Date(), tz);
  const fyKey =
    period.label.match(/(\d{2})-(\d{2})/)?.[0] ??
    period.label.replace(/^FY\s+/i, "").trim();
  const { getOrderBookMetrics } = await import("@/lib/order-book-metrics");
  const metrics = await getOrderBookMetrics(fyKey);
  const periodLabel = `FY ${metrics.fy}`;

  links.push({ title: "Director dashboard", href: "/director" });
  if (can(user, "project.read")) links.push({ title: "Projects", href: "/projects" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          period: periodLabel,
          fyTarget: metrics.targetOrderBook,
          fyTargetInr: inr(metrics.targetOrderBook),
          orderBookValue: metrics.orderBookValue,
          orderBookValueInr: inr(metrics.orderBookValue),
          completedValue: metrics.completedValue,
          completedValueInr: inr(metrics.completedValue),
          pendingOrderTotal: metrics.pendingOrderTotal,
          pendingOrderTotalInr: inr(metrics.pendingOrderTotal),
          targetAchievementPct: metrics.targetAchievementPct,
          prevFyOrderBook: metrics.prevFyOrderBook,
          prevFyOrderBookInr: inr(metrics.prevFyOrderBook),
          prevFyCompleted: metrics.prevFyCompleted,
          prevFyCompletedInr: inr(metrics.prevFyCompleted),
          moneyNote: "Copy *Inr fields exactly. Never reinterpret Indian commas.",
          note: "Order book = confirmed project pipeline vs FY target (Director Dashboard).",
        },
        { period: periodLabel, sources: ["order_book"] }
      ),
    },
    links,
  };
}
