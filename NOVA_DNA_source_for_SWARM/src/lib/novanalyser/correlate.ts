/**
 * NovANALYSER correlation rules v1 (P0: C01–C04) — deterministic cross-module issues.
 */
import { inr } from "@/lib/format";
import { buildNovaFinding } from "@/lib/nova/recipes/finding";
import { metricNumber } from "@/lib/novanalyser/normalize";
import type { NovAnalyserIssue, NovAnalyserMetricSnapshot } from "@/lib/novanalyser/types";

function issueFromFinding(
  partial: Omit<NovAnalyserIssue, "finding" | "score"> & { score?: number }
): NovAnalyserIssue {
  const finding = buildNovaFinding({
    observation: partial.observation,
    evidence: partial.evidence,
    contributors: partial.contributors.map((c) => ({
      toolId: c.toolId,
      role: c.metricId ?? "source",
    })),
    recommendation: partial.recommendations[0],
    confidence: partial.confidence,
  });
  return { ...partial, finding, score: partial.score ?? 0 };
}

/** Single-module threshold issues (always emitted when facts present). */
export function buildSingleModuleIssues(metrics: NovAnalyserMetricSnapshot[]): NovAnalyserIssue[] {
  const issues: NovAnalyserIssue[] = [];

  const overdueAmt = metricNumber(metrics, "finance.ar.overdue_amount_inr");
  const overdueCount = metricNumber(metrics, "finance.ar.overdue_count");
  if (overdueCount != null && overdueCount > 0) {
    issues.push(
      issueFromFinding({
        id: "overdue_collections",
        title: "Overdue collections",
        severity: overdueAmt != null && overdueAmt >= 500000 ? "critical" : "high",
        observation:
          overdueAmt != null
            ? `${overdueCount} overdue invoice(s) totalling ${inr(overdueAmt)}.`
            : `${overdueCount} overdue invoice(s) on file.`,
        evidence: [
          {
            toolId: "overdue_invoices",
            summary:
              overdueAmt != null
                ? `${overdueCount} overdue · ${inr(overdueAmt)}`
                : `${overdueCount} overdue`,
          },
        ],
        contributors: [{ toolId: "overdue_invoices", metricId: "finance.ar.overdue_count" }],
        recommendations: [{ label: "Open billing", href: "/billing" }],
        confidence: "fact",
        financialExposureInr: overdueAmt ?? undefined,
        countImpact: overdueCount,
      })
    );
  }

  const projectDelayed = metricNumber(metrics, "ops.projects.delayed_count");
  if (projectDelayed != null && projectDelayed > 0) {
    issues.push(
      issueFromFinding({
        id: "project_delays",
        title: "Project delays",
        severity: projectDelayed >= 3 ? "high" : "medium",
        observation: `${projectDelayed} active project(s) past expected completion.`,
        evidence: [
          { toolId: "projects_summary", summary: `${projectDelayed} delayed project(s)` },
        ],
        contributors: [{ toolId: "projects_summary", metricId: "ops.projects.delayed_count" }],
        recommendations: [{ label: "Open projects", href: "/projects" }],
        confidence: "fact",
        countImpact: projectDelayed,
      })
    );
  }

  const deliveryDelayed = metricNumber(metrics, "ops.delivery.delayed_count");
  if (deliveryDelayed != null && deliveryDelayed > 0) {
    issues.push(
      issueFromFinding({
        id: "delivery_delays",
        title: "Delivery delays",
        severity: deliveryDelayed >= 3 ? "high" : "medium",
        observation: `${deliveryDelayed} delivery delay(s) in the period.`,
        evidence: [
          { toolId: "delivery_summary", summary: `${deliveryDelayed} delayed delivery(ies)` },
        ],
        contributors: [{ toolId: "delivery_summary", metricId: "ops.delivery.delayed_count" }],
        recommendations: [{ label: "Open delivery", href: "/delivery" }],
        confidence: "fact",
        countImpact: deliveryDelayed,
      })
    );
  }

  const agedApprovals = metricNumber(metrics, "ops.approvals.aged_count");
  const openApprovals = metricNumber(metrics, "ops.approvals.open_count");
  if (agedApprovals != null && agedApprovals > 0) {
    issues.push(
      issueFromFinding({
        id: "approval_bottlenecks",
        title: "Approval bottlenecks",
        severity: agedApprovals >= 5 ? "high" : "medium",
        observation: `${agedApprovals} open approval(s) idle ≥ 3 days${
          openApprovals != null ? ` (${openApprovals} open total).` : "."
        }`,
        evidence: [
          { toolId: "approvals_summary", summary: `${agedApprovals} aged approvals` },
        ],
        contributors: [{ toolId: "approvals_summary", metricId: "ops.approvals.aged_count" }],
        recommendations: [{ label: "Open approvals", href: "/approvals" }],
        confidence: "fact",
        countImpact: agedApprovals,
      })
    );
  }

  const lowStock = metricNumber(metrics, "ops.stock.low_count");
  if (lowStock != null && lowStock > 0) {
    issues.push(
      issueFromFinding({
        id: "low_stock",
        title: "Low stock",
        severity: lowStock >= 10 ? "high" : "medium",
        observation: `${lowStock} SKU(s) at or below minimum stock.`,
        evidence: [{ toolId: "stock_summary", summary: `${lowStock} low-stock SKU(s)` }],
        contributors: [{ toolId: "stock_summary", metricId: "ops.stock.low_count" }],
        recommendations: [{ label: "Open stock", href: "/stock" }],
        confidence: "fact",
        countImpact: lowStock,
      })
    );
  }

  const myOverdue = metricNumber(metrics, "ops.my_work.overdue_tasks");
  const tasksOverdue = metricNumber(metrics, "ops.tasks.overdue_count");
  const overdueTasks = myOverdue ?? tasksOverdue;
  if (overdueTasks != null && overdueTasks > 0) {
    issues.push(
      issueFromFinding({
        id: "task_overdue_self",
        title: "Task overdue concentration",
        severity: overdueTasks >= 5 ? "high" : "medium",
        observation: `${overdueTasks} overdue task(s) on your plate.`,
        evidence: [
          {
            toolId: myOverdue != null ? "my_work_summary" : "tasks_summary",
            summary: `${overdueTasks} overdue task(s)`,
          },
        ],
        contributors: [
          {
            toolId: myOverdue != null ? "my_work_summary" : "tasks_summary",
            metricId: "ops.my_work.overdue_tasks",
          },
        ],
        recommendations: [{ label: "Open tasks", href: "/tasks" }],
        confidence: "fact",
        countImpact: overdueTasks,
      })
    );
  }

  const kpiScore = metricNumber(metrics, "ops.kpi.my_score") ?? metricNumber(metrics, "ops.kpi.average_score");
  if (kpiScore != null && kpiScore < 70) {
    issues.push(
      issueFromFinding({
        id: "kpi_gap",
        title: "KPI gap",
        severity: kpiScore < 50 ? "high" : "medium",
        observation: `KPI score at ${kpiScore}% — below target band.`,
        evidence: [{ toolId: "kpi_summary", summary: `Score ${kpiScore}%` }],
        contributors: [{ toolId: "kpi_summary", metricId: "ops.kpi.my_score" }],
        recommendations: [{ label: "Open KPI", href: "/kpi" }],
        confidence: "fact",
        countImpact: Math.round(100 - kpiScore),
      })
    );
  }

  const lateCount = metricNumber(metrics, "hr.attendance.late_count");
  if (lateCount != null && lateCount > 0) {
    issues.push(
      issueFromFinding({
        id: "late_attendance_self",
        title: "Late arrivals",
        severity: lateCount >= 5 ? "medium" : "low",
        observation: `${lateCount} late day(s) recorded in the period.`,
        evidence: [
          { toolId: "attendance_late_summary", summary: `${lateCount} late day(s)` },
        ],
        contributors: [
          { toolId: "attendance_late_summary", metricId: "hr.attendance.late_count" },
        ],
        recommendations: [{ label: "Open attendance", href: "/attendance-hr" }],
        confidence: "fact",
        countImpact: lateCount,
      })
    );
  }

  const pendingLeave = metricNumber(metrics, "hr.leave.pending_count");
  if (pendingLeave != null && pendingLeave > 0) {
    issues.push(
      issueFromFinding({
        id: "leave_pipeline",
        title: "Leave pipeline",
        severity: "low",
        observation: `${pendingLeave} pending leave request(s).`,
        evidence: [{ toolId: "leave_summary", summary: `${pendingLeave} pending` }],
        contributors: [{ toolId: "leave_summary", metricId: "hr.leave.pending_count" }],
        recommendations: [{ label: "Open leave", href: "/leave" }],
        confidence: "fact",
        countImpact: pendingLeave,
      })
    );
  }

  return issues;
}

/** Cross-module correlation rules C01–C04. */
export function correlateNovAnalyserMetrics(
  metrics: NovAnalyserMetricSnapshot[]
): NovAnalyserIssue[] {
  const correlated: NovAnalyserIssue[] = [];

  const overdueAmt = metricNumber(metrics, "finance.ar.overdue_amount_inr");
  const receiptsInr = metricNumber(metrics, "finance.receipts.total_inr");
  const openAr = metricNumber(metrics, "finance.ar.open_total_inr");

  // C01 — overdue AR + weak receipts → collections gap
  if (
    overdueAmt != null &&
    overdueAmt > 0 &&
    receiptsInr != null &&
    openAr != null &&
    openAr > 0 &&
    receiptsInr < openAr * 0.5
  ) {
    correlated.push(
      issueFromFinding({
        id: "c01_collections_gap",
        title: "Collections gap",
        severity: "critical",
        correlationRuleId: "C01",
        observation: `Overdue AR ${inr(overdueAmt)} with receipts at ${inr(receiptsInr)} vs open ${inr(openAr)} — collection pace may be lagging billing.`,
        evidence: [
          { toolId: "overdue_invoices", summary: `Overdue ${inr(overdueAmt)}` },
          { toolId: "receipts_summary", summary: `Receipts ${inr(receiptsInr)}` },
          { toolId: "receivables_summary", summary: `Open AR ${inr(openAr)}` },
        ],
        contributors: [
          { toolId: "overdue_invoices", metricId: "finance.ar.overdue_amount_inr" },
          { toolId: "receipts_summary", metricId: "finance.receipts.total_inr" },
        ],
        recommendations: [{ label: "Open receivables", href: "/accounts/receivables" }],
        confidence: "supported_inference",
        financialExposureInr: overdueAmt,
        countImpact: metricNumber(metrics, "finance.ar.overdue_count") ?? undefined,
      })
    );
  }

  const projectDelayed = metricNumber(metrics, "ops.projects.delayed_count");
  const deliveryDelayed = metricNumber(metrics, "ops.delivery.delayed_count");

  // C02 — project past ECD + delivery delays
  if (
    projectDelayed != null &&
    projectDelayed > 0 &&
    deliveryDelayed != null &&
    deliveryDelayed > 0
  ) {
    correlated.push(
      issueFromFinding({
        id: "c02_delivery_project_slip",
        title: "Delivery / project slip",
        severity: "high",
        correlationRuleId: "C02",
        observation: `${projectDelayed} delayed project(s) and ${deliveryDelayed} delivery delay(s) — fulfilment chain may be stressed.`,
        evidence: [
          { toolId: "projects_summary", summary: `${projectDelayed} project delay(s)` },
          { toolId: "delivery_summary", summary: `${deliveryDelayed} delivery delay(s)` },
        ],
        contributors: [
          { toolId: "projects_summary", metricId: "ops.projects.delayed_count" },
          { toolId: "delivery_summary", metricId: "ops.delivery.delayed_count" },
        ],
        recommendations: [{ label: "Open projects", href: "/projects" }],
        confidence: "supported_inference",
        countImpact: projectDelayed + deliveryDelayed,
      })
    );
  }

  const kpiAvg = metricNumber(metrics, "ops.kpi.average_score");
  const lateCount = metricNumber(metrics, "hr.attendance.late_count");

  // C03 — low KPI + late attendance (org or self)
  if (kpiAvg != null && kpiAvg < 70 && lateCount != null && lateCount >= 3) {
    correlated.push(
      issueFromFinding({
        id: "c03_attendance_kpi_drag",
        title: "Attendance drag on KPI",
        severity: "medium",
        correlationRuleId: "C03",
        observation: `KPI averaging ${kpiAvg}% with ${lateCount} late day(s) — attendance may be weighing on scorecard parameters.`,
        evidence: [
          { toolId: "kpi_summary", summary: `Avg KPI ${kpiAvg}%` },
          { toolId: "attendance_late_summary", summary: `${lateCount} late day(s)` },
        ],
        contributors: [
          { toolId: "kpi_summary", metricId: "ops.kpi.average_score" },
          { toolId: "attendance_late_summary", metricId: "hr.attendance.late_count" },
        ],
        recommendations: [{ label: "Open KPI", href: "/kpi" }],
        confidence: "supported_inference",
        countImpact: lateCount,
      })
    );
  }

  const agedApprovals = metricNumber(metrics, "ops.approvals.aged_count");
  const pendingPayments = metricNumber(metrics, "finance.director.pending_payments");

  // C04 — approval queue + payment requests pending
  if (agedApprovals != null && agedApprovals > 0 && pendingPayments != null && pendingPayments > 0) {
    correlated.push(
      issueFromFinding({
        id: "c04_workflow_bottleneck",
        title: "Workflow bottleneck",
        severity: "high",
        correlationRuleId: "C04",
        observation: `${agedApprovals} aged approval(s) and ${pendingPayments} pending payment request(s) — workflow may be blocking cash-out.`,
        evidence: [
          { toolId: "approvals_summary", summary: `${agedApprovals} aged approvals` },
          {
            toolId: "director_dashboard_summary",
            summary: `${pendingPayments} pending payments`,
          },
        ],
        contributors: [
          { toolId: "approvals_summary", metricId: "ops.approvals.aged_count" },
          { toolId: "director_dashboard_summary", metricId: "finance.director.pending_payments" },
        ],
        recommendations: [{ label: "Open approvals", href: "/approvals" }],
        confidence: "supported_inference",
        countImpact: agedApprovals + pendingPayments,
      })
    );
  }

  return correlated;
}

export function buildNovAnalyserIssues(metrics: NovAnalyserMetricSnapshot[]): NovAnalyserIssue[] {
  const singles = buildSingleModuleIssues(metrics);
  const correlated = correlateNovAnalyserMetrics(metrics);

  const byId = new Map<string, NovAnalyserIssue>();
  for (const issue of [...correlated, ...singles]) {
    const existing = byId.get(issue.id);
    if (!existing || issue.severity === "critical") {
      byId.set(issue.id, issue);
    }
  }
  return [...byId.values()];
}
