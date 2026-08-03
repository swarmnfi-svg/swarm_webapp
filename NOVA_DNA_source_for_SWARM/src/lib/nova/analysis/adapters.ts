/**
 * Domain adapters: catalog skill facts → NovaAnalysisBundle.
 * Each adapter only uses data the skill already returns under the same RBAC.
 * KPI: prefer sibling `buildKpiReportCard` factors (shared schema).
 */
import { inr } from "@/lib/format";
import { buildKpiAnalysisBundle } from "@/lib/kpi/report-card-factors";
import type { KpiReportCard, ReportCardFactor } from "@/lib/kpi/report-card";
import type { NovaAnalysisBundle, NovaAnalysisFactor } from "@/lib/nova/analysis/factor-schema";
import { NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION } from "@/lib/nova/analysis/factor-schema";
import type { NovaAnalysisDepth } from "@/lib/nova/analysis/depth";

function impactToPolarity(
  impact: ReportCardFactor["impact"]
): NovaAnalysisFactor["polarity"] {
  if (impact === "drag") return "hurts";
  if (impact === "boost") return "helps";
  if (impact === "missing") return "context";
  return "neutral";
}

function fmtScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

/** Bridge sibling KPI report-card → Analysis factor pack (schema v1). */
export function adaptKpiReportCardToBundle(input: {
  card: KpiReportCard;
  subjectLabel: string;
  subjectUserId?: string | null;
  periodName: string;
  totalScore: number | null;
  href?: string;
  depth?: NovaAnalysisDepth;
}): NovaAnalysisBundle {
  const depth = input.depth === "detail" ? "detail" : "summary";
  const stance =
    input.card.verdict === "low"
      ? "low"
      : input.card.verdict === "high"
        ? "high"
        : input.card.verdict === "mid"
          ? "mid"
          : "neutral";

  // Summary: top drags + boosts from report card (same why strings as UI).
  // Detail: full factor list with weight/contribution in evidence.
  const sourceFactors =
    depth === "detail"
      ? input.card.factors
      : [
          ...input.card.drags.slice(0, 4),
          ...input.card.boosts.slice(0, 3),
          ...input.card.missing.slice(0, 2),
        ];
  const seen = new Set<string>();
  const selected = sourceFactors.filter((f) => {
    const key = f.parameterCode || f.parameterName;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const useFactors = selected.length ? selected : input.card.factors;

  const factors: NovaAnalysisFactor[] = useFactors.map((f) => ({
    id: `kpi-${f.parameterCode || f.parameterName}`,
    label: f.parameterName,
    category: f.category,
    weight: f.weightage,
    contribution: f.weightedScore,
    actual: f.actualValue,
    target: f.targetValue,
    score: f.finalScore,
    polarity: impactToPolarity(f.impact),
    reason: [f.why, depth === "detail" ? f.formula : null, depth === "detail" ? f.contribution : null]
      .filter(Boolean)
      .join(" "),
    evidence: {
      toolId: "kpi_report_card",
      summary: `${f.parameterCode}: score=${fmtScore(f.finalScore)} weight=${f.weightage}% impact=${f.impact} actual=${fmtScore(f.actualValue)} target=${fmtScore(f.targetValue)}`,
    },
    href: input.href ?? null,
  }));

  return {
    schemaVersion: NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION,
    domain: "kpi",
    subject: {
      kind: "person",
      id: input.subjectUserId ?? null,
      label: input.subjectLabel,
    },
    headline: input.card.headline.replace(/\d+\.\d{3,}/g, (m) => {
      const n = Number(m);
      return Number.isFinite(n) ? fmtScore(n) : m;
    }),
    position: {
      value: input.totalScore,
      unit: "score",
      band: input.card.band.grade,
      stance,
    },
    factors,
    methodology: [
      input.card.summary,
      depth === "detail" ? input.card.methodology : null,
      input.card.trend?.note,
    ]
      .filter(Boolean)
      .join(" "),
    periodLabel: input.periodName,
    depth,
    links: [
      {
        title: "KPI scorecard",
        href:
          input.href ??
          (input.subjectUserId
            ? `/kpi/scorecard/${input.subjectUserId}`
            : "/kpi/my-performance"),
      },
    ],
  };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/** KPI — prefers full report-card lines when present; else thin kpi_summary top/bottom. */
export function adaptKpiFactsToAnalysisBundle(input: {
  subjectLabel: string;
  subjectUserId?: string | null;
  periodName: string;
  totalScore: number | null;
  grade?: string | null;
  /** Full parameter lines when sibling report-card / scorecard load succeeded */
  reportCardLines?: Parameters<typeof buildKpiAnalysisBundle>[0]["lines"];
  /** Thin fallback from kpi_summary */
  summaryData?: Record<string, unknown> | null;
}): NovaAnalysisBundle | null {
  if (input.reportCardLines && input.reportCardLines.length > 0) {
    return buildKpiAnalysisBundle({
      subjectLabel: input.subjectLabel,
      subjectUserId: input.subjectUserId,
      periodName: input.periodName,
      totalScore: input.totalScore,
      grade: input.grade,
      lines: input.reportCardLines,
    });
  }

  const d = input.summaryData;
  if (!d) return null;
  const factors: NovaAnalysisFactor[] = [];
  const top = Array.isArray(d.top) ? d.top : [];
  const bottom = Array.isArray(d.bottom) ? d.bottom : [];
  for (const row of bottom.slice(0, 5)) {
    const r = asRecord(row);
    if (!r) continue;
    const score = typeof r.score === "number" ? r.score : null;
    factors.push({
      id: `kpi-bottom-${String(r.name ?? factors.length)}`,
      label: String(r.name ?? "Review"),
      score,
      polarity: score != null && score < 60 ? "hurts" : "neutral",
      reason: `Review score ${score ?? "—"}${r.grade ? ` / ${r.grade}` : ""} in period ${input.periodName}.`,
      evidence: {
        toolId: "kpi_summary",
        summary: `${r.name}: score=${score ?? "—"} grade=${r.grade ?? "—"}`,
      },
    });
  }
  for (const row of top.slice(0, 3)) {
    const r = asRecord(row);
    if (!r) continue;
    const score = typeof r.score === "number" ? r.score : null;
    factors.push({
      id: `kpi-top-${String(r.name ?? factors.length)}`,
      label: String(r.name ?? "Review"),
      score,
      polarity: score != null && score >= 75 ? "helps" : "context",
      reason: `Higher review score ${score ?? "—"}${r.grade ? ` / ${r.grade}` : ""} (peer/self sample).`,
      evidence: {
        toolId: "kpi_summary",
        summary: `${r.name}: score=${score ?? "—"} grade=${r.grade ?? "—"}`,
      },
    });
  }
  if (typeof d.averageScore === "number") {
    factors.push({
      id: "kpi-avg",
      label: "Period average",
      score: d.averageScore as number,
      polarity: "context",
      reason: `Period average score is ${d.averageScore} across ${d.reviewCount ?? "—"} review(s).`,
      evidence: {
        toolId: "kpi_summary",
        summary: `avg=${d.averageScore} reviews=${d.reviewCount ?? "—"}`,
      },
    });
  }

  const myScore =
    input.totalScore ??
    (typeof d.myScore === "number" ? d.myScore : null) ??
    (typeof d.averageScore === "number" ? d.averageScore : null);
  const grade =
    input.grade ?? (typeof d.myGrade === "string" ? d.myGrade : null);

  if (!factors.length && myScore == null) return null;

  // Thin summary path: attach synthetic total line so engine always has ≥1 factor.
  if (!factors.length && myScore != null) {
    return buildKpiAnalysisBundle({
      subjectLabel: input.subjectLabel,
      subjectUserId: input.subjectUserId,
      periodName: input.periodName,
      totalScore: myScore,
      grade,
      lines: [
        {
          parameterName: "KPI total",
          parameterCode: "TOTAL",
          category: "summary",
          scoringRule: "MANUAL_SCORE",
          dataSource: "MANUAL",
          targetValue: null,
          actualValue: myScore,
          achievementPercent: null,
          weightage: 100,
          rawScore: myScore,
          weightedScore: myScore,
          finalScore: myScore,
        },
      ],
    });
  }

  const base = buildKpiAnalysisBundle({
    subjectLabel: input.subjectLabel,
    subjectUserId: input.subjectUserId,
    periodName: input.periodName,
    totalScore: myScore,
    grade,
    lines: [],
  });
  return { ...base, factors };
}

/** Sample / row cap shared by tasks, AR, attendance — summary keeps chat lean. */
function analysisSampleLimit(depth: NovaAnalysisDepth): number {
  return depth === "detail" ? 8 : 3;
}

export type AdaptTasksOpts = {
  subjectLabel: string;
  subjectKind?: NovaAnalysisBundle["subject"]["kind"];
  subjectId?: string | null;
  depth?: NovaAnalysisDepth;
  href?: string;
};

/** @deprecated Prefer opts object; kept for call sites that only pass a label. */
export function adaptTasksFactToAnalysisBundle(
  data: Record<string, unknown>,
  subjectLabelOrOpts: string | AdaptTasksOpts
): NovaAnalysisBundle | null {
  const opts: AdaptTasksOpts =
    typeof subjectLabelOrOpts === "string"
      ? { subjectLabel: subjectLabelOrOpts }
      : subjectLabelOrOpts;
  const depth = opts.depth === "detail" ? "detail" : "summary";
  const sampleCap = analysisSampleLimit(depth);
  const openCount = Number(data.openCount ?? 0);
  const overdueCount = Number(data.overdueCount ?? 0);
  const dueSoonCount = Number(data.dueSoonCount ?? 0);
  const completedCount = Number(data.completedCount ?? 0);
  const samples = Array.isArray(data.overdueSamples)
    ? data.overdueSamples
    : Array.isArray(data.samples)
      ? data.samples
      : [];
  const factors: NovaAnalysisFactor[] = [];
  const href = opts.href ?? "/tasks";

  factors.push({
    id: "tasks-overdue-count",
    label: "Overdue tasks",
    actual: overdueCount,
    polarity: overdueCount > 0 ? "hurts" : "helps",
    reason:
      overdueCount > 0
        ? `${overdueCount} open task(s) are past due (of ${openCount} open).`
        : `No overdue tasks among ${openCount} open.`,
    evidence: {
      toolId: "tasks_summary",
      summary: `overdue=${overdueCount} open=${openCount}`,
    },
    href,
  });

  if (dueSoonCount > 0 || depth === "detail") {
    factors.push({
      id: "tasks-due-soon",
      label: "Due soon",
      actual: dueSoonCount,
      polarity: dueSoonCount > 0 ? "neutral" : "helps",
      reason: `${dueSoonCount} open task(s) due within the next week.`,
      evidence: {
        toolId: "tasks_summary",
        summary: `dueSoon=${dueSoonCount}`,
      },
      href,
    });
  }

  if (depth === "detail" && completedCount > 0) {
    factors.push({
      id: "tasks-completed",
      label: "Completed in period",
      actual: completedCount,
      polarity: "helps",
      reason: `${completedCount} task(s) completed in ${String(data.completedPeriod ?? "period")}.`,
      evidence: {
        toolId: "tasks_summary",
        summary: `completed=${completedCount} period=${String(data.completedPeriod ?? "—")}`,
      },
      href,
    });
  }

  let sampleAdded = 0;
  for (const raw of samples) {
    if (sampleAdded >= sampleCap) break;
    const s = asRecord(raw);
    if (!s) continue;
    const isOverdue = Boolean(s.overdue);
    const selfAssigned = Boolean(s.selfAssigned || s.kpiExcluded);
    // Summary: overdue samples only. Detail: overdue first, then other opens.
    if (depth === "summary" && !isOverdue) continue;
    factors.push({
      id: `task-${String(s.no ?? s.title ?? sampleAdded)}`,
      label: String(s.title ?? s.no ?? "Task"),
      polarity: isOverdue ? "hurts" : "context",
      reason: `${isOverdue ? "Overdue" : "Open"} since ${s.due ?? "unknown due date"} · status ${s.status ?? "—"}${
        s.priority ? ` · ${s.priority}` : ""
      }${s.project ? ` · ${s.project}` : ""}${
        selfAssigned ? " · excluded from KPI (self-assigned)" : ""
      }.`,
      evidence: {
        toolId: "tasks_summary",
        summary: `${s.no ?? "task"}: due=${s.due ?? "—"} status=${s.status ?? "—"} overdue=${isOverdue}${
          selfAssigned ? " kpiExcluded=self-assigned" : ""
        }`,
      },
      href: typeof s.href === "string" ? s.href : href,
    });
    sampleAdded += 1;
  }

  const stance = overdueCount > 0 ? "low" : openCount > 0 ? "mid" : "high";
  const subjectKind =
    opts.subjectKind ??
    (data.projectScoped
      ? "project"
      : data.customerScoped
        ? "customer"
        : data.personFilter
          ? "person"
          : "queue");
  const selfAssignMethod =
    data.kpiSelfAssignedExcluded === true
      ? " Self-assigned tasks excluded from counts (KPI pool rule)."
      : " Self-assigned samples may be labeled excluded from KPI.";
  return {
    schemaVersion: NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION,
    domain: "tasks",
    subject: {
      kind: subjectKind,
      id: opts.subjectId ?? null,
      label: opts.subjectLabel,
    },
    headline:
      overdueCount > 0
        ? `${overdueCount} overdue task(s) · ${openCount} open`
        : `${openCount} open task(s) · none overdue`,
    position: {
      value: overdueCount,
      unit: "overdue",
      band: stance === "low" ? "attention" : "ok",
      stance,
    },
    factors,
    depth,
    methodology:
      depth === "detail"
        ? `Task counts and samples from the same ERP task ACL as /tasks (tasks_summary).${selfAssignMethod}`
        : `Tasks_summary queue.${selfAssignMethod}`,
    links: [{ title: "Tasks", href }],
  };
}

export function adaptOutstandingFactsToAnalysisBundle(input: {
  outstanding?: Record<string, unknown> | null;
  overdue?: Record<string, unknown> | null;
  receipts?: Record<string, unknown> | null;
  /** UI SoT aging buckets from getReceivablesAgingBuckets (org rollup). */
  aging?: {
    buckets: { b0: number; b30: number; b60: number; b90: number };
    total: number;
  } | null;
  subjectLabel: string;
  subjectId?: string | null;
  depth?: NovaAnalysisDepth;
  periodLabel?: string | null;
}): NovaAnalysisBundle | null {
  const depth = input.depth === "detail" ? "detail" : "summary";
  const topCap = analysisSampleLimit(depth);
  const factors: NovaAnalysisFactor[] = [];
  const out = input.outstanding;
  const ov = input.overdue;
  const rc = input.receipts;
  const aging = input.aging;

  const totalFromAging =
    aging && typeof aging.total === "number" ? aging.total : null;
  const total =
    out && typeof out.outstandingTotal === "number"
      ? out.outstandingTotal
      : totalFromAging;
  const overdueCount = ov && typeof ov.count === "number" ? ov.count : null;

  if (total != null) {
    factors.push({
      id: "ar-total",
      label: "Customer outstanding",
      actual: total,
      polarity: total > 0 ? "hurts" : "helps",
      reason: `Outstanding total ${out?.outstandingTotalInr ?? inr(total)} across ${
        out?.rowCount ?? "—"
      } row(s).`,
      evidence: {
        toolId: out ? "customer_outstanding" : "receivables_aging",
        summary: `total=${out?.outstandingTotalInr ?? total} rows=${out?.rowCount ?? "—"}`,
      },
      href: "/accounts/receivables",
    });
  }

  if (aging?.buckets) {
    const bucketDefs: Array<{ id: string; label: string; value: number }> = [
      { id: "ar-aging-0-30", label: "Aging 0–30 days", value: aging.buckets.b0 },
      { id: "ar-aging-31-60", label: "Aging 31–60 days", value: aging.buckets.b30 },
      { id: "ar-aging-61-90", label: "Aging 61–90 days", value: aging.buckets.b60 },
      { id: "ar-aging-90-plus", label: "Aging 90+ days", value: aging.buckets.b90 },
    ];
    const includeBuckets =
      depth === "detail"
        ? bucketDefs
        : [...bucketDefs]
            .filter((b) => b.value > 0)
            // Summary: surface the stickiest aging money first (90+ / 61–90).
            .sort((a, b) => b.value - a.value)
            .slice(0, 2);
    for (const b of includeBuckets) {
      if (depth === "summary" && b.value <= 0) continue;
      factors.push({
        id: b.id,
        label: b.label,
        actual: b.value,
        polarity: b.id.includes("90") && b.value > 0 ? "hurts" : b.value > 0 ? "neutral" : "helps",
        reason: `${inr(b.value)} in ${b.label.toLowerCase()} (receivables UI SoT).`,
        evidence: {
          toolId: "receivables_aging",
          summary: `${b.id}=${b.value}`,
        },
        href: "/accounts/receivables",
      });
    }
  }

  if (out) {
    const top = Array.isArray(out.top) ? out.top : [];
    for (const raw of top.slice(0, topCap)) {
      const r = asRecord(raw);
      if (!r) continue;
      const amt = typeof r.outstanding === "number" ? r.outstanding : null;
      factors.push({
        id: `ar-${String(r.customer ?? r.invoice)}`,
        label: String(r.customer ?? r.invoice ?? "Customer"),
        actual: amt,
        polarity: amt != null && amt > 0 ? "hurts" : "neutral",
        reason: `${r.outstandingInr ?? amt ?? "—"} outstanding${
          r.days != null ? ` · ${r.days} day(s)` : ""
        }${r.invoice ? ` · ${r.invoice}` : ""}.`,
        evidence: {
          toolId: "customer_outstanding",
          summary: `${r.customer}: ${r.outstandingInr ?? amt} days=${r.days ?? "—"}`,
        },
        href: "/accounts/receivables",
      });
    }
  }

  if (ov && overdueCount != null) {
    factors.push({
      id: "ar-overdue-invoices",
      label: "Overdue invoices",
      actual: overdueCount,
      polarity: overdueCount > 0 ? "hurts" : "helps",
      reason: `${overdueCount} overdue invoice(s) in billing.`,
      evidence: {
        toolId: "overdue_invoices",
        summary: `count=${overdueCount}`,
      },
      href: "/billing",
    });
    if (depth === "detail" && Array.isArray(ov.samples)) {
      for (const raw of ov.samples.slice(0, topCap)) {
        const s = asRecord(raw);
        if (!s) continue;
        factors.push({
          id: `ar-ov-${String(s.invoice ?? s.no ?? s.customer ?? factors.length)}`,
          label: String(s.invoice ?? s.customer ?? "Overdue invoice"),
          polarity: "hurts",
          reason: `Overdue invoice${s.customer ? ` · ${s.customer}` : ""}${
            s.days != null ? ` · ${s.days} day(s)` : ""
          }${s.outstandingInr ? ` · ${s.outstandingInr}` : ""}.`,
          evidence: {
            toolId: "overdue_invoices",
            summary: `${s.invoice ?? "inv"}: days=${s.days ?? "—"}`,
          },
          href: "/billing",
        });
      }
    }
  }

  const receiptTotal =
    rc && typeof rc.totalCollected === "number"
      ? (rc.totalCollected as number)
      : rc && typeof rc.totalAmount === "number"
        ? (rc.totalAmount as number)
        : null;
  if (rc && receiptTotal != null) {
    const receiptCount = rc.receiptCount ?? rc.count;
    factors.push({
      id: "receipts-period",
      label: "Receipts in period",
      actual: receiptTotal,
      polarity: receiptTotal > 0 ? "helps" : "neutral",
      reason: `Collections ${rc.totalCollectedInr ?? rc.totalAmountInr ?? inr(receiptTotal)} (${receiptCount ?? "—"} receipt(s)) in ${rc.period ?? "period"}.`,
      evidence: {
        toolId: "receipts_summary",
        summary: `total=${rc.totalCollectedInr ?? receiptTotal} count=${receiptCount ?? "—"}`,
      },
      href: "/receipts",
    });
  }

  if (!factors.length) return null;
  const stance =
    (overdueCount != null && overdueCount > 0) || (total != null && total > 0)
      ? "low"
      : "mid";
  const boundCustomer = Boolean(input.subjectId) || input.subjectLabel !== "Receivables";

  return {
    schemaVersion: NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION,
    domain: "outstanding",
    subject: {
      kind: boundCustomer ? "customer" : "org",
      id: input.subjectId ?? null,
      label: input.subjectLabel,
    },
    headline:
      total != null
        ? `Outstanding ${out?.outstandingTotalInr ?? inr(total)}${
            overdueCount != null ? ` · ${overdueCount} overdue invoice(s)` : ""
          }`
        : `Receivables attention${overdueCount != null ? ` · ${overdueCount} overdue` : ""}`,
    position: {
      value: total ?? overdueCount,
      unit: total != null ? "INR" : "overdue invoices",
      stance,
    },
    factors,
    depth,
    periodLabel: input.periodLabel ?? (typeof rc?.period === "string" ? rc.period : null),
    methodology:
      depth === "detail"
        ? "Receivables totals/aging from accounts SoT; customer rows from customer_outstanding under money-hide ACL."
        : null,
    links: [
      { title: "Receivables", href: "/accounts/receivables" },
      { title: "Billing", href: "/billing" },
    ],
  };
}

export type AdaptAttendanceOpts = {
  subjectLabel: string;
  subjectKind?: NovaAnalysisBundle["subject"]["kind"];
  subjectId?: string | null;
  depth?: NovaAnalysisDepth;
};

export function adaptAttendanceFactToAnalysisBundle(
  data: Record<string, unknown>,
  subjectLabelOrOpts: string | AdaptAttendanceOpts
): NovaAnalysisBundle | null {
  const opts: AdaptAttendanceOpts =
    typeof subjectLabelOrOpts === "string"
      ? { subjectLabel: subjectLabelOrOpts }
      : subjectLabelOrOpts;
  const depth = opts.depth === "detail" ? "detail" : "summary";
  const sampleCap = analysisSampleLimit(depth);
  const lateCount = Number(data.latePeopleCount ?? data.peopleWithLate ?? data.lateCount ?? 0);
  const presentCount = Number(data.presentPunchDays ?? data.presentCount ?? 0);
  const absentCount = Number(data.absentDays ?? data.absentCount ?? 0);
  const factors: NovaAnalysisFactor[] = [];
  const periodLabel = typeof data.period === "string" ? data.period : null;

  factors.push({
    id: "att-late",
    label: "Late comers",
    actual: lateCount,
    polarity: lateCount > 0 ? "hurts" : "helps",
    reason: `${lateCount} late comer(s) in period ${periodLabel ?? "—"}.`,
    evidence: {
      toolId: "attendance_late_summary",
      summary: `late=${lateCount}`,
    },
    href: "/attendance-hr",
  });
  factors.push({
    id: "att-present",
    label: "Present",
    actual: presentCount,
    polarity: "context",
    reason: `${presentCount} present punch-day(s) recorded.`,
    evidence: {
      toolId: "attendance_late_summary",
      summary: `present=${presentCount}`,
    },
  });
  factors.push({
    id: "att-absent",
    label: "Absent",
    actual: absentCount,
    polarity: absentCount > 0 ? "hurts" : "helps",
    reason: `${absentCount} absent day-row(s) recorded.`,
    evidence: {
      toolId: "attendance_late_summary",
      summary: `absent=${absentCount}`,
    },
  });

  const subjectAttendance = asRecord(data.subjectAttendance);
  if (subjectAttendance) {
    const status = String(subjectAttendance.status ?? "—");
    const subjectPunch =
      typeof subjectAttendance.punchInLabel === "string" &&
      subjectAttendance.punchInLabel.trim()
        ? String(subjectAttendance.punchInLabel).trim()
        : typeof subjectAttendance.punchInTime === "string" &&
            subjectAttendance.punchInTime.trim()
          ? String(subjectAttendance.punchInTime).trim()
          : null;
    factors.push({
      id: "att-subject-day",
      label: `${opts.subjectLabel} attendance`,
      polarity:
        /absent|missing/i.test(status) || !subjectAttendance.punchInTime
          ? "hurts"
          : "context",
      reason: `Subject day status ${status}${
        subjectAttendance.lateMinutes != null
          ? ` · late ${subjectAttendance.lateMinutes} min`
          : ""
      }${subjectPunch ? ` · punch-in ${subjectPunch}` : ""}.`,
      evidence: {
        toolId: "attendance_late_summary",
        summary: `subjectStatus=${status} lateMinutes=${subjectAttendance.lateMinutes ?? "—"} punchIn=${subjectPunch ?? "—"}`,
      },
      href: "/attendance-hr",
    });
  }

  const topLate = Array.isArray(data.topLateComers) ? data.topLateComers : [];
  for (const raw of topLate.slice(0, sampleCap)) {
    const p = asRecord(raw);
    if (!p) continue;
    const mins =
      typeof p.totalLateMinutes === "number"
        ? p.totalLateMinutes
        : typeof p.lateMinutes === "number"
          ? p.lateMinutes
          : null;
    const days =
      typeof p.lateDays === "number" ? p.lateDays : typeof p.days === "number" ? p.days : null;
    const punch =
      typeof p.punchInLabel === "string" && p.punchInLabel.trim()
        ? String(p.punchInLabel).trim()
        : typeof p.punchInTime === "string" && p.punchInTime.trim()
          ? String(p.punchInTime).trim()
          : null;
    factors.push({
      id: `att-person-${String(p.code ?? p.name)}`,
      label: String(p.name ?? "Staff"),
      actual: mins,
      polarity: "hurts",
      reason: `${p.name}${p.code ? ` (${p.code})` : ""} late${
        mins != null ? ` · ${mins} late-min total` : ""
      }${days != null ? ` · ${days} day(s)` : ""}${punch ? ` · punch-in ${punch}` : ""}.`,
      evidence: {
        toolId: "attendance_late_summary",
        summary: `${p.name}: lateMinutes=${mins ?? "—"} days=${days ?? "—"} punchIn=${punch ?? "—"}`,
      },
      href: "/attendance-hr",
    });
  }

  if (depth === "detail") {
    const topAbsent = Array.isArray(data.topAbsent)
      ? data.topAbsent
      : Array.isArray(data.mostAbsent)
        ? data.mostAbsent
        : [];
    for (const raw of topAbsent.slice(0, sampleCap)) {
      const p = asRecord(raw);
      if (!p) continue;
      const days =
        typeof p.absentDays === "number"
          ? p.absentDays
          : typeof p.days === "number"
            ? p.days
            : null;
      factors.push({
        id: `att-absent-${String(p.code ?? p.name)}`,
        label: String(p.name ?? "Staff"),
        actual: days,
        polarity: "hurts",
        reason: `${p.name}${p.code ? ` (${p.code})` : ""} absent${
          days != null ? ` · ${days} day(s)` : ""
        }.`,
        evidence: {
          toolId: "attendance_late_summary",
          summary: `${p.name}: absentDays=${days ?? "—"}`,
        },
        href: "/attendance-hr",
      });
    }
  }

  const stance = lateCount > 0 || absentCount > 0 ? "low" : "high";
  const factSubject = asRecord(data.subject);
  const subjectKind =
    opts.subjectKind ??
    (factSubject?.name || data.personFilter ? "person" : "org");
  return {
    schemaVersion: NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION,
    domain: "attendance",
    subject: {
      kind: subjectKind,
      id: opts.subjectId ?? null,
      label: opts.subjectLabel,
    },
    headline: `Attendance: ${lateCount} late · ${absentCount} absent · ${presentCount} present`,
    position: {
      value: lateCount,
      unit: "late",
      stance,
    },
    factors,
    depth,
    periodLabel,
    methodology:
      depth === "detail"
        ? "Late/absent/present counts from attendance_late_summary (same HR ACL as Attendance HR)."
        : null,
    links: [{ title: "Attendance", href: "/attendance-hr" }],
  };
}

export function adaptProjectFactsToAnalysisBundle(input: {
  projectLabel: string;
  projectId?: string | null;
  tasks?: Record<string, unknown> | null;
  projects?: Record<string, unknown> | null;
  /** Project Command dashboard spine chapters (UI SoT when project is bound). */
  commandSpine?: {
    project: { id: string; projectId: string; projectName: string; status: string };
    chapters: Array<{
      id: string;
      label: string;
      count?: number | null;
      display?: string | number | null;
      omitted?: boolean;
      deferred?: boolean;
    }>;
    links?: Array<{ title: string; href: string }>;
  } | null;
  depth?: NovaAnalysisDepth;
}): NovaAnalysisBundle | null {
  const depth = input.depth === "detail" ? "detail" : "summary";
  const taskBundle = input.tasks
    ? adaptTasksFactToAnalysisBundle(input.tasks, {
        subjectLabel: input.projectLabel,
        subjectKind: "project",
        subjectId: input.projectId ?? null,
        depth,
        href: input.projectId ? `/projects/${input.projectId}` : "/tasks",
      })
    : null;
  const factors: NovaAnalysisFactor[] = [...(taskBundle?.factors ?? [])];
  const href = input.projectId ? `/projects/${input.projectId}` : "/projects";

  const scoped = asRecord(input.projects?.scopedFacts);
  if (scoped) {
    const taskOpen = Number(scoped.taskOpen ?? 0);
    const checklistOpen = Number(scoped.checklistOpen ?? 0);
    const deliveryCount = Number(scoped.deliveryCount ?? 0);
    factors.push({
      id: "project-scoped-tasks",
      label: "Open project tasks",
      actual: taskOpen,
      polarity: taskOpen > 0 ? "neutral" : "helps",
      reason: `${taskOpen} open task(s) · ${Number(scoped.taskDone ?? 0)} done on this project.`,
      evidence: {
        toolId: "projects_summary",
        summary: `taskOpen=${taskOpen} taskDone=${scoped.taskDone ?? "—"}`,
      },
      href,
    });
    factors.push({
      id: "project-checklist",
      label: "Open checklist items",
      actual: checklistOpen,
      polarity: checklistOpen > 0 ? "neutral" : "helps",
      reason: `${checklistOpen} checklist item(s) still open (${Number(scoped.checklistDone ?? 0)} done).`,
      evidence: {
        toolId: "projects_summary",
        summary: `checklistOpen=${checklistOpen}`,
      },
      href,
    });
    if (depth === "detail") {
      factors.push({
        id: "project-deliveries",
        label: "Deliveries",
        actual: deliveryCount,
        polarity: "context",
        reason: `${deliveryCount} delivery record(s) linked to this project.`,
        evidence: {
          toolId: "projects_summary",
          summary: `deliveryCount=${deliveryCount}`,
        },
        href,
      });
      if (scoped.valueVisible && typeof scoped.projectValue === "number") {
        factors.push({
          id: "project-value",
          label: "Project value",
          actual: scoped.projectValue,
          polarity: "context",
          reason: `Contract value ${scoped.projectValueInr ?? inr(scoped.projectValue)}.`,
          evidence: {
            toolId: "projects_summary",
            summary: `projectValue=${scoped.projectValue}`,
          },
          href,
        });
      }
    }
  } else if (input.projects && !input.commandSpine) {
    const open = Number(input.projects.openCount ?? input.projects.activeCount ?? 0);
    factors.push({
      id: "project-status",
      label: "Project status",
      actual: open,
      polarity: "context",
      reason: `Project summary open/active signal: ${open} (from projects_summary).`,
      evidence: {
        toolId: "projects_summary",
        summary: `openOrActive=${open}`,
      },
      href,
    });
  }

  if (input.commandSpine) {
    const chapterCap = depth === "detail" ? 10 : 5;
    let added = 0;
    for (const ch of input.commandSpine.chapters) {
      if (ch.omitted || ch.deferred) continue;
      if (ch.id === "resolve" || ch.id === "spine") continue;
      const count = typeof ch.count === "number" ? ch.count : null;
      const displayNum =
        typeof ch.display === "number"
          ? ch.display
          : count;
      if (displayNum == null && (ch.display == null || ch.display === "hidden")) continue;
      factors.push({
        id: `project-cmd-${ch.id}`,
        label: ch.label,
        actual: typeof displayNum === "number" ? displayNum : null,
        polarity:
          ch.id === "overdue" && typeof count === "number" && count > 0
            ? "hurts"
            : "context",
        reason:
          typeof ch.display === "string" && ch.display !== "hidden"
            ? `${ch.label}: ${ch.display}.`
            : `${ch.label}: ${count ?? ch.display ?? "—"}.`,
        evidence: {
          toolId: "project_command_dashboard",
          summary: `${ch.id}=${count ?? ch.display ?? "—"}`,
        },
        href,
      });
      added += 1;
      if (added >= chapterCap) break;
    }
    if (input.commandSpine.project.status) {
      factors.push({
        id: "project-cmd-status",
        label: "Project status",
        polarity: "context",
        reason: `Project status ${input.commandSpine.project.status} (${input.commandSpine.project.projectId}).`,
        evidence: {
          toolId: "project_command_dashboard",
          summary: `status=${input.commandSpine.project.status}`,
        },
        href,
      });
    }
  }

  if (!factors.length) return null;
  const overdueFactor = factors.find((f) => f.id === "tasks-overdue-count");
  const overdueVal =
    typeof overdueFactor?.actual === "number" ? overdueFactor.actual : null;
  return {
    schemaVersion: NOVA_ANALYSIS_FACTOR_SCHEMA_VERSION,
    domain: "project",
    subject: {
      kind: "project",
      id: input.projectId ?? input.commandSpine?.project.id ?? null,
      label: input.projectLabel,
    },
    headline: taskBundle?.headline
      ? `${input.projectLabel}: ${taskBundle.headline}`
      : `Project analysis — ${input.projectLabel}`,
    position: taskBundle?.position ?? {
      value: overdueVal,
      unit: overdueVal != null ? "overdue tasks" : undefined,
      stance: overdueVal != null && overdueVal > 0 ? "low" : "neutral",
    },
    factors,
    depth,
    methodology:
      depth === "detail"
        ? "Project Command spine + scoped project facts (same reads as project detail / command API)."
        : null,
    links: [
      ...(input.commandSpine?.links?.length
        ? input.commandSpine.links
        : [{ title: "Project", href }]),
      { title: "Tasks", href: "/tasks" },
    ],
  };
}
