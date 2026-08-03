/**
 * Normalize skill facts → NovAnalyserMetricSnapshot[] (deterministic).
 */
import type { NovaToolFact } from "@/lib/nova/core/tool-types";
import type { NovAnalyserMetricSnapshot } from "@/lib/novanalyser/types";

const n = (v: unknown): number | null => {
  if (v == null) return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

function pushMetric(
  out: NovAnalyserMetricSnapshot[],
  partial: NovAnalyserMetricSnapshot
): void {
  if (partial.value == null) return;
  out.push(partial);
}

/** Extract normalized metrics from a dispatched skill fact. */
export function normalizeSkillFactToMetrics(
  toolId: string,
  fact: NovaToolFact,
  moduleId?: string
): NovAnalyserMetricSnapshot[] {
  if (!fact.ok || fact.denied) return [];
  const d = (fact.data && typeof fact.data === "object" ? fact.data : {}) as Record<
    string,
    unknown
  >;
  const period = typeof d.period === "string" ? d.period : null;
  const out: NovAnalyserMetricSnapshot[] = [];

  switch (toolId) {
    case "sales_summary":
      pushMetric(out, {
        metricId: "finance.sales.total_inr",
        value: n(d.grandTotalInr),
        unit: "INR",
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      pushMetric(out, {
        metricId: "finance.sales.invoice_count",
        value: n(d.invoiceCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      break;
    case "receipts_summary":
      pushMetric(out, {
        metricId: "finance.receipts.total_inr",
        value: n(d.totalCollectedInr),
        unit: "INR",
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      pushMetric(out, {
        metricId: "finance.receipts.count",
        value: n(d.receiptCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      break;
    case "receivables_summary":
      pushMetric(out, {
        metricId: "finance.ar.open_total_inr",
        value: n(d.openTotalInr ?? d.outstandingTotalInr),
        unit: "INR",
        period,
        toolId,
        moduleId,
        entityScope: "org",
        severityHint: n(d.overdueTotalInr) && n(d.overdueTotalInr)! > 0 ? "high" : undefined,
      });
      pushMetric(out, {
        metricId: "finance.ar.overdue_total_inr",
        value: n(d.overdueTotalInr),
        unit: "INR",
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      pushMetric(out, {
        metricId: "finance.ar.open_count",
        value: n(d.openCount ?? d.invoiceCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      break;
    case "overdue_invoices":
      pushMetric(out, {
        metricId: "finance.ar.overdue_count",
        value: n(d.overdueCount ?? d.count),
        period,
        toolId,
        moduleId,
        entityScope: "org",
        severityHint: n(d.overdueCount ?? d.count) ? "high" : undefined,
      });
      pushMetric(out, {
        metricId: "finance.ar.overdue_amount_inr",
        value: n(d.overdueTotalInr ?? d.totalInr ?? d.grandTotalInr),
        unit: "INR",
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      break;
    case "projects_summary":
      pushMetric(out, {
        metricId: "ops.projects.active_count",
        value: n(d.activeCount ?? d.activeCountInPeriod),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      pushMetric(out, {
        metricId: "ops.projects.delayed_count",
        value: n(d.delayedCount ?? d.pastEcdCount ?? d.overdueCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
        severityHint: n(d.delayedCount ?? d.pastEcdCount) ? "high" : undefined,
      });
      break;
    case "delivery_summary":
      pushMetric(out, {
        metricId: "ops.delivery.delayed_count",
        value: n(d.delayedCount ?? d.delayCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
        severityHint: n(d.delayedCount ?? d.delayCount) ? "high" : undefined,
      });
      pushMetric(out, {
        metricId: "ops.delivery.total_count",
        value: n(d.totalCount ?? d.deliveryCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      break;
    case "approvals_summary":
      pushMetric(out, {
        metricId: "ops.approvals.open_count",
        value: n(d.openCount ?? d.pendingCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      pushMetric(out, {
        metricId: "ops.approvals.aged_count",
        value: n(d.agedCount ?? d.idleCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
        severityHint: n(d.agedCount ?? d.idleCount) ? "medium" : undefined,
      });
      break;
    case "stock_summary":
      pushMetric(out, {
        metricId: "ops.stock.low_count",
        value: n(d.lowStockCount ?? d.belowReorderCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
        severityHint: n(d.lowStockCount ?? d.belowReorderCount) ? "medium" : undefined,
      });
      break;
    case "director_dashboard_summary":
      pushMetric(out, {
        metricId: "finance.director.receivables_inr",
        value: n(d.receivablesTotalInr),
        unit: "INR",
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      pushMetric(out, {
        metricId: "finance.director.low_stock_alerts",
        value: n(d.lowStockAlertCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      pushMetric(out, {
        metricId: "finance.director.pending_payments",
        value: n(d.pendingPaymentCount),
        period,
        toolId,
        moduleId,
        entityScope: "org",
      });
      break;
    case "kpi_summary":
      pushMetric(out, {
        metricId: "ops.kpi.average_score",
        value: n(d.averageScore),
        period: typeof d.period === "string" ? d.period : period,
        toolId,
        moduleId,
        entityScope: typeof d.scope === "string" ? (d.scope as "org" | "team" | "self") : "self",
        severityHint:
          n(d.averageScore) != null && n(d.averageScore)! < 70 ? "medium" : undefined,
      });
      pushMetric(out, {
        metricId: "ops.kpi.my_score",
        value: n(d.myScore ?? d.myKpiScore),
        period: typeof d.period === "string" ? d.period : period,
        toolId,
        moduleId,
        entityScope: "self",
      });
      break;
    case "my_work_summary":
      pushMetric(out, {
        metricId: "ops.my_work.open_tasks",
        value: n(d.myOpenTasks),
        period,
        toolId,
        moduleId,
        entityScope: "self",
      });
      pushMetric(out, {
        metricId: "ops.my_work.overdue_tasks",
        value: n(d.myOverdueTasks),
        period,
        toolId,
        moduleId,
        entityScope: "self",
        severityHint: n(d.myOverdueTasks) ? "high" : undefined,
      });
      pushMetric(out, {
        metricId: "ops.my_work.kpi_score",
        value: n(d.myKpiScore),
        period: typeof d.kpiPeriod === "string" ? d.kpiPeriod : period,
        toolId,
        moduleId,
        entityScope: "self",
      });
      break;
    case "attendance_late_summary":
      pushMetric(out, {
        metricId: "hr.attendance.late_count",
        value: n(d.peopleWithLate ?? d.latePeopleCount ?? d.lateCount),
        period,
        toolId,
        moduleId,
        entityScope: "self",
        severityHint: n(d.peopleWithLate ?? d.lateCount) ? "medium" : undefined,
      });
      break;
    case "leave_summary":
      pushMetric(out, {
        metricId: "hr.leave.pending_count",
        value: n(d.pendingCount ?? d.myPendingLeave),
        period,
        toolId,
        moduleId,
        entityScope: "self",
      });
      break;
    case "tasks_summary":
      pushMetric(out, {
        metricId: "ops.tasks.open_count",
        value: n(d.openCount ?? d.myOpenTasks),
        period,
        toolId,
        moduleId,
        entityScope: "self",
      });
      pushMetric(out, {
        metricId: "ops.tasks.overdue_count",
        value: n(d.overdueCount ?? d.myOverdueTasks),
        period,
        toolId,
        moduleId,
        entityScope: "self",
        severityHint: n(d.overdueCount ?? d.myOverdueTasks) ? "high" : undefined,
      });
      break;
    default:
      break;
  }

  return out;
}

export function metricById(
  metrics: NovAnalyserMetricSnapshot[],
  metricId: string
): NovAnalyserMetricSnapshot | undefined {
  return metrics.find((m) => m.metricId === metricId);
}

export function metricNumber(
  metrics: NovAnalyserMetricSnapshot[],
  metricId: string
): number | null {
  const m = metricById(metrics, metricId);
  if (!m || m.value == null) return null;
  const nVal = Number(m.value);
  return Number.isFinite(nVal) ? nVal : null;
}
