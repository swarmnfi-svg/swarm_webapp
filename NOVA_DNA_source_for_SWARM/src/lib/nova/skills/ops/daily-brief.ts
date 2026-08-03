/**
 * Skill — daily_brief (Phase 2).
 * Read-only role pack that composes existing registered skills — no silent writes.
 */
import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import { novaCanRunTool } from "@/lib/ai/nova-suggest";
import { novaDayBoundsFor, type DateRange } from "@/lib/ai/nova-dates";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolFact, NovaToolLink } from "@/lib/nova/core/tool-types";

export type DailyBriefRolePack = "director" | "manager" | "accountant" | "staff";

/** Role → registered skill tool ids (all read-only). */
export const DAILY_BRIEF_PACKS: Record<DailyBriefRolePack, readonly string[]> = {
  director: [
    "director_dashboard_summary",
    "sales_summary",
    "receipts_summary",
    "payment_requests_summary",
    "receivables_summary",
    "accounts_snapshot",
    "order_book_summary",
    "sales_orders_summary",
    "projects_summary",
    "reports_snapshot",
    "profitability_summary",
    "attendance_late_summary",
    "leave_summary",
    "overtime_summary",
    "regularisation_summary",
    "tasks_summary",
    "delivery_summary",
    "notifications_open",
  ],
  manager: [
    "attendance_late_summary",
    "tasks_summary",
    "leave_summary",
    "overtime_summary",
    "regularisation_summary",
    "stock_summary",
    "payment_requests_summary",
    "sales_orders_summary",
    "purchase_orders_summary",
    "delivery_summary",
    "projects_summary",
    "kpi_summary",
    "my_work_summary",
    "notifications_open",
  ],
  accountant: [
    "sales_summary",
    "receipts_summary",
    "payment_requests_summary",
    "bank_recon_summary",
    "receivables_summary",
    "staff_expense_summary",
    "accounts_snapshot",
    "gstr_snapshot",
    "gst_docs_summary",
    "purchase_orders_summary",
    "tally_status",
    "reports_snapshot",
    "notifications_open",
  ],
  staff: [
    "my_work_summary",
    "leave_summary",
    "kpi_summary",
    "incentives_summary",
    "notifications_open",
  ],
};

export function resolveDailyBriefPack(user: SessionUser): DailyBriefRolePack {
  if (
    user.role === "SUPER_ADMIN" ||
    user.role === "ADMIN" ||
    user.role === "DIRECTOR" ||
    can(user, "director.dashboard")
  ) {
    return "director";
  }
  if (user.role === "ACCOUNTANT" || can(user, "accounts.dashboard.read")) {
    return "accountant";
  }
  if (
    user.role === "MANAGER" ||
    can(user, "hr.attendance.team") ||
    can(user, "task.edit.team")
  ) {
    return "manager";
  }
  return "staff";
}

function todayRange(tz: string): DateRange {
  const { start, end } = novaDayBoundsFor(new Date(), tz);
  return { from: start, to: end, label: "today" };
}


/**
 * Max concurrent skill dispatches inside daily_brief (NOVA-A11 / NI-02).
 * Keeps DB load bounded while cutting director-pack wall time vs sequential await.
 */
export const DAILY_BRIEF_FANOUT_CONCURRENCY = 4;

/**
 * Run async work over items with a concurrency cap. Results preserve input order.
 * Exported for unit tests.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex;
      nextIndex += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T, i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/** Slim one skill fact for daily_brief sections (exported for unit tests). */
export function slimDailyBriefSection(tool: string, fact: NovaToolFact): Record<string, unknown> {
  const d = (fact.data && typeof fact.data === "object" ? fact.data : {}) as Record<
    string,
    unknown
  >;
  const base: Record<string, unknown> = {
    tool,
    ok: fact.ok,
    denied: Boolean(fact.denied),
    error: fact.error ?? null,
  };
  if (!fact.ok || fact.denied) return base;

  switch (tool) {
    case "sales_summary":
      return {
        ...base,
        period: d.period ?? null,
        invoiceCount: d.invoiceCount ?? null,
        grandTotalInr: d.grandTotalInr ?? null,
      };
    case "receipts_summary":
      return {
        ...base,
        period: d.period ?? null,
        receiptCount: d.receiptCount ?? null,
        totalCollectedInr: d.totalCollectedInr ?? null,
      };
    case "payment_requests_summary":
      return {
        ...base,
        awaitingCount: d.awaitingActionCount ?? d.awaitingCount ?? d.pendingCount ?? null,
        paidInPeriod: d.paidInPeriod ?? d.paidCount ?? null,
        period: d.period ?? null,
      };
    case "receivables_summary":
      return {
        ...base,
        openTotalInr: d.openTotalInr ?? d.outstandingTotalInr ?? null,
        overdueTotalInr: d.overdueTotalInr ?? null,
        openCount: d.openCount ?? d.invoiceCount ?? null,
      };
    case "bank_recon_summary":
      return {
        ...base,
        unreconciledCount: d.unreconciledCount ?? d.unreconciled ?? null,
        period: d.period ?? null,
      };
    case "accounts_snapshot":
      return {
        ...base,
        journalVoucherCount: d.journalVoucherCount ?? null,
        ledgerAccountCount: d.ledgerAccountCount ?? null,
        netFundsAvailableInr: d.netFundsAvailableInr ?? null,
        balancesVisible: d.balancesVisible ?? null,
      };
    case "gstr_snapshot":
      return {
        ...base,
        period: d.periodKey ?? d.period ?? null,
        gstr1TotalGstInr: d.gstr1TotalGstInr ?? null,
        gstr3bNetPayableInr: d.gstr3bNetPayableInr ?? null,
      };
    case "order_book_summary":
      return {
        ...base,
        period: d.period ?? null,
        orderBookValueInr: d.orderBookValueInr ?? null,
        fyTargetInr: d.fyTargetInr ?? null,
        targetAchievementPct: d.targetAchievementPct ?? null,
      };
    case "director_dashboard_summary":
      return {
        ...base,
        period: d.period ?? null,
        fySalesInr: d.fySalesInr ?? null,
        fyCollectionInr: d.fyCollectionInr ?? null,
        receivablesTotalInr: d.receivablesTotalInr ?? null,
        payablesTotalInr: d.payablesTotalInr ?? null,
        pendingPaymentCount: d.pendingPaymentCount ?? null,
        unreconciledBankTxns: d.unreconciledBankTxns ?? null,
        lowStockAlertCount: d.lowStockAlertCount ?? null,
      };
    case "sales_orders_summary":
      return {
        ...base,
        period: d.period ?? null,
        openOrderCount: d.openOrderCount ?? null,
        periodValueInr: d.periodValueInr ?? null,
      };
    case "purchase_orders_summary":
      return {
        ...base,
        period: d.period ?? null,
        openPoCount: d.openCount ?? null,
        periodValueInr: d.periodValueInr ?? null,
      };
    case "projects_summary":
      return {
        ...base,
        period: d.period ?? null,
        activeProjectCount: d.activeCount ?? d.activeCountInPeriod ?? null,
        totalActiveProjectValueInr:
          d.totalActiveProjectValueInr === "hidden"
            ? null
            : (d.totalActiveProjectValueInr ?? null),
      };
    case "reports_snapshot":
      return {
        ...base,
        period: d.period ?? d.fy ?? null,
        salesTotalInr: d.salesTotalInr ?? null,
        collectionsInr: d.collectionsInr ?? null,
        receivablesOutstandingInr: d.receivablesOutstandingInr ?? null,
        payablesOutstandingInr: d.payablesOutstandingInr ?? null,
      };
    case "profitability_summary":
      return {
        ...base,
        balancesVisible: d.balancesVisible ?? null,
        netFundsAvailableInr: d.netFundsAvailableInr ?? null,
        projectPlTotal: d.projectPlTotal ?? null,
      };
    case "tally_status":
      return {
        ...base,
        connectionCount: d.connectionCount ?? null,
        activeConnectionCount: d.activeConnectionCount ?? null,
      };
    case "gst_docs_summary":
      return {
        ...base,
        eInvoiceTotal: d.eInvoiceTotal ?? null,
        eWayTotal: d.eWayTotal ?? null,
      };
    case "staff_expense_summary":
      return {
        ...base,
        period: d.period ?? null,
        totalPaidInr: d.totalPaidInr ?? null,
      };
    case "attendance_late_summary":
      // Skill emits presentPunchDays / absentDays (not presentCount / absentCount).
      return {
        ...base,
        period: d.period ?? null,
        peopleWithLate: d.peopleWithLate ?? d.latePeopleCount ?? d.lateCount ?? null,
        presentPunchDays: d.presentPunchDays ?? d.presentCount ?? null,
        absentDays: d.absentDays ?? d.absentCount ?? null,
      };
    case "tasks_summary":
      return {
        ...base,
        openTaskCount: d.openCount ?? d.myOpenTasks ?? null,
        overdueTaskCount: d.overdueCount ?? d.myOverdueTasks ?? null,
        completedCount: d.completedCount ?? d.myCompletedTasks ?? null,
      };
    case "leave_summary":
      return {
        ...base,
        pendingCount: d.pendingCount ?? d.myPendingLeave ?? null,
        period: d.period ?? null,
      };
    case "overtime_summary":
      return {
        ...base,
        pendingCount: d.pendingCount ?? null,
        approvedCount: d.approvedCount ?? null,
        focus: d.focus ?? null,
      };
    case "regularisation_summary":
      return {
        ...base,
        pendingCount: d.pendingCount ?? null,
        approvedCount: d.approvedCount ?? null,
        focus: d.focus ?? null,
      };
    case "stock_summary":
      return {
        ...base,
        lowStockCount: d.lowStockCount ?? d.belowReorderCount ?? null,
        skuCount: d.skuCount ?? d.activeItemCount ?? d.itemCount ?? null,
        period: d.period ?? null,
      };
    case "delivery_summary":
      return {
        ...base,
        period: d.period ?? null,
        delayedCount: d.delayedCount ?? d.delayCount ?? null,
        totalCount: d.totalCount ?? d.deliveryCount ?? null,
      };
    case "kpi_summary":
      return {
        ...base,
        period: d.period ?? null,
        scope: d.scope ?? null,
        reviewCount: d.reviewCount ?? null,
        averageScore: d.averageScore ?? null,
        myScore: d.myScore ?? d.myKpiScore ?? null,
      };
    case "incentives_summary":
      return {
        ...base,
        scope: d.scope ?? null,
        openOrUnpaidCount: d.openOrUnpaidCount ?? null,
      };
    case "my_work_summary":
      return {
        ...base,
        name: d.name ?? null,
        myOpenTasks: d.myOpenTasks ?? null,
        myOverdueTasks: d.myOverdueTasks ?? null,
        myKpiScore: d.myKpiScore ?? null,
        myPendingLeave: d.myPendingLeave ?? null,
      };
    case "notifications_open":
      return {
        ...base,
        unreadCount: d.unreadCount ?? null,
        href: d.href ?? "/notifications",
      };
    default:
      return {
        ...base,
        period: d.period ?? null,
        note: typeof d.note === "string" ? d.note.slice(0, 160) : null,
      };
  }
}

export async function runDailyBrief(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const name = "daily_brief";
  const links: NovaToolLink[] = [];
  const rolePack = resolveDailyBriefPack(ctx.user);
  // Fan-out only skills the caller can run — never rely on handler deny alone.
  const toolIds = DAILY_BRIEF_PACKS[rolePack].filter((toolId) =>
    novaCanRunTool(ctx.user, toolId)
  );
  const period = ctx.range ?? todayRange(ctx.tz);

  // Dynamic import avoids registry ↔ skill cycle at module load.
  const { dispatchNovaSkill, hasNovaSkill } = await import("@/lib/nova/skills/registry");

  const subCtx: NovaSkillHandlerContext = {
    ...ctx,
    range: period,
    // Org/self brief — never steal another person's named query into composed pack
    personHint: null,
    entityHint: null,
    entityFilterName: undefined,
    resolvedEntityType: null,
    resolvedEntityDbId: null,
  };

  const sections: Record<string, unknown>[] = [];
  const sources = new Set<string>(["daily_brief"]);
  const skippedForPerms = DAILY_BRIEF_PACKS[rolePack].length - toolIds.length;
  const runnableToolIds = toolIds.filter((toolId) => hasNovaSkill(toolId));
  const fanOutStarted = Date.now();

  type FanOutRow = {
    toolId: string;
    section: Record<string, unknown> | null;
    links: NovaToolLink[];
    sourceIds: string[];
  };

  const fanOutRows = await mapWithConcurrency(
    runnableToolIds,
    DAILY_BRIEF_FANOUT_CONCURRENCY,
    async (toolId): Promise<FanOutRow> => {
      try {
        const result = await dispatchNovaSkill(toolId, subCtx);
        if (!result) {
          return { toolId, section: null, links: [], sourceIds: [] };
        }
        // Second gate: handler may still deny (e.g. finance aggregates inside skill).
        if (result.fact.denied) {
          return { toolId, section: null, links: [], sourceIds: [] };
        }
        const data = result.fact.data;
        const sourceIds: string[] = [];
        if (
          data &&
          typeof data === "object" &&
          Array.isArray((data as { sources?: unknown }).sources)
        ) {
          for (const s of (data as { sources: string[] }).sources) sourceIds.push(s);
        } else {
          sourceIds.push(toolId);
        }
        return {
          toolId,
          section: slimDailyBriefSection(toolId, result.fact),
          links: result.links?.length ? [...result.links] : [],
          sourceIds,
        };
      } catch {
        return {
          toolId,
          section: {
            tool: toolId,
            ok: false,
            denied: false,
            error: "Lookup failed for this section",
          },
          links: [],
          sourceIds: [],
        };
      }
    }
  );

  for (const row of fanOutRows) {
    if (!row.section) continue;
    sections.push(row.section);
    if (row.links.length) links.push(...row.links);
    for (const s of row.sourceIds) sources.add(s);
  }

  const fanOutMs = Date.now() - fanOutStarted;
  console.info(
    `[nova-daily-brief] pack=${rolePack} tools=${runnableToolIds.length} concurrency=${DAILY_BRIEF_FANOUT_CONCURRENCY} fanOutMs=${fanOutMs} sections=${sections.length}`
  );

  const usable = sections.filter((s) => s.ok === true && s.denied !== true);

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          period: period.label,
          role: ctx.user.role,
          rolePack,
          sectionCount: sections.length,
          usableSectionCount: usable.length,
          skippedForPerms,
          sections,
          note:
            "Read-only role daily brief composed from registered NOVA skills the caller can run. No writes or free LLM tool pick.",
        },
        {
          period: period.label,
          sources: [...sources],
        }
      ),
    },
    links,
  };
}
