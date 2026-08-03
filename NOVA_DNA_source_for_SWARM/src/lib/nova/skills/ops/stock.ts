/**
 * Skill — stock_summary (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
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
          sources: ["stock_movement"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runStockSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, range, query, sampleLimit } = ctx;
  const name = "stock_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "stock.read")) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing stock.read" });
    return finalize();
  }
  const periodFilter = range
    ? { date: { gte: range.from, lte: range.to } }
    : undefined;
  const [itemCount, movementCount, recentMoves, lowStock] = await Promise.all([
    prisma.itemMaster.count({ where: { active: true } }),
    prisma.stockMovement.count({ where: periodFilter }),
    prisma.stockMovement.findMany({
      where: periodFilter,
      orderBy: { date: "desc" },
      take: 5,
      select: {
        stockMovementId: true,
        movementType: true,
        quantity: true,
        date: true,
        item: { select: { name: true, itemCode: true } },
      },
    }),
    prisma.itemMaster.findMany({
      where: {
        active: true,
        minimumStock: { gt: 0 },
      },
      orderBy: { currentStock: "asc" },
      take: 40,
      select: {
        itemCode: true,
        name: true,
        currentStock: true,
        minimumStock: true,
        unit: true,
      },
    }),
  ]);
  const belowMin = lowStock
    .filter((i) => n(i.currentStock) <= n(i.minimumStock))
    .slice(0, 8)
    .map((i) => ({
      code: i.itemCode,
      name: i.name,
      current: n(i.currentStock),
      minimum: n(i.minimumStock),
      unit: i.unit,
    }));
  facts.push({
    tool: name,
    ok: true,
    data: (() => {
      const data = {
        period: range?.label ?? "all time (movements: current filter)",
        activeItemCount: itemCount,
        movementsInPeriod: movementCount,
        lowStockCount: belowMin.length,
        lowStockItems: belowMin,
        recentMovements: recentMoves.map((m) => ({
          id: m.stockMovementId,
          type: m.movementType,
          qty: n(m.quantity),
          date: m.date.toISOString().slice(0, 10),
          item: m.item.name,
          code: m.item.itemCode,
        })),
      };
      const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
      if (!reportIntent) return data;
      const { attachment } = buildSkillReportPack({
        packId: "purchase_stock_report",
        reportMode,
        title: "Stock report",
        headline: `${itemCount} active items · ${movementCount} movements · ${belowMin.length} below minimum`,
        period: {
          label: range?.label ?? "current",
          grain: range ? "month" : "open",
          calendarKind: range ? "calendar_month" : "point_in_time",
          source: range ? "explicit" : "default",
        },
        metrics: [
          {
            metricId: "stock.active_items",
            version: "1",
            certification: "draft",
            value: itemCount,
            display: `${itemCount} items`,
          },
          {
            metricId: "stock.movements",
            version: "1",
            certification: "draft",
            value: movementCount,
            display: `${movementCount} movements`,
          },
          {
            metricId: "stock.low_stock",
            version: "1",
            certification: "draft",
            value: belowMin.length,
            display: `${belowMin.length} low`,
          },
        ],
        charts: [
          {
            bindingId: "ageing_or_attention",
            metricIds: ["stock.low_stock"],
            title: "Low stock (current vs min)",
            points: belowMin.slice(0, 8).map((i) => ({
              label: String(i.code || i.name).slice(0, 18),
              value: Number(i.current ?? 0),
              unit: "qty",
            })),
          },
        ],
        tables: [
          {
            id: "low_stock",
            title: "Low stock items",
            columns: ["Code", "Item", "Current", "Minimum", "Unit"],
            rows: belowMin.map((i) => [
              reportCell(i.code),
              reportCell(i.name),
              reportCell(i.current),
              reportCell(i.minimum),
              reportCell(i.unit),
            ]),
          },
        ],
        facts: [{ tool: name, ok: true, data }],
        links: [{ title: "Stock", href: "/stock" }],
        omittedNotes: ["Requires stock.read. Purchase bill totals use purchase_bills_summary report path."],
      });
      return withSkillReportAttachment(data, attachment);
    })(),
  });
  links.push({ title: "Stock", href: "/stock" });
  return finalize();
}
