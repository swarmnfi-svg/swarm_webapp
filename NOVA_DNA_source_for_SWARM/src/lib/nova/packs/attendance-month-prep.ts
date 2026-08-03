/**
 * PREP — Attendance Month pack contract + NovaPackResult stub.
 * Freezes savable HR month overview shape for handoff, evals, and wiring
 * without skill dispatch or invented punch theatre.
 *
 * Signature ask: “how is this month’s attendance?” / “how is this month attendance”
 *
 * DEPENDENCY GATE: do not merge to main until sole deployer confirms save-report
 * follow-up is live (health-matched) and pulls this prep. No version bump from
 * this branch — see ATTENDANCE_MONTH_HANDOFF.md.
 */

import {
  buildNovaPackResult,
  emptyNovaPackAttentions,
  selectNovaPackAttentions,
  type NovaPackMetricRef,
  type NovaPackResult,
} from "@/lib/nova/pack-result";
import { NOVA_MONTH_ATTENTION_PRIMARY_MAX } from "@/lib/nova/invariants";
import type { NovaFinding, NovaFindingConfidence } from "@/lib/nova/recipes/finding";
import { buildNovaFinding } from "@/lib/nova/recipes/finding";

/** Pack id — must match NovaPackId + future recipe id `attendance_month`. */
export const ATTENDANCE_MONTH_PACK_ID = "attendance_month" as const;

export const ATTENDANCE_MONTH_PREP_VERSION = "0.1.0-prep";

/**
 * Signature + routing questions (rules-first / recipe examples).
 * Canonical: “how is this month’s attendance?”
 */
export const ATTENDANCE_MONTH_QUESTIONS = [
  "how is this month's attendance?",
  "how is this month attendance",
  "attendance this month",
  "this month attendance",
  "month attendance overview",
  "attendance for July",
  "who was late this month",
  "absent days this month",
] as const;

/**
 * Catalog chapters for Attendance Month v1.
 * Core is attendance_late_summary with explicit calendar month; optional HR
 * chapters deepen attentions without inventing payroll theatre.
 */
export const ATTENDANCE_MONTH_CHAPTER_TOOLS = [
  "attendance_late_summary",
  "leave_summary",
  "regularisation_summary",
  "overtime_summary",
] as const;

/**
 * Metric ids for Attendance Month pack.
 * Draft until steward-certifies the HR set. Stub values stay null; live pack
 * fills from catalog skill facts only.
 *
 * Families:
 * - overview · late · present · absent · top late · leave · reg · OT
 */
export const ATTENDANCE_MONTH_METRIC_IDS = [
  /** Overview — period grain must be calendar month when pack routes */
  "attendance.period_overview",
  /** Late — late-comer day/person counts from register */
  "attendance.late_count",
  /** Present — present-like day counts (register statuses; not invented) */
  "attendance.present_days",
  /** Absent — MISSING_PUNCH_IN / unpaid leave register rows only */
  "attendance.absent_days",
  /** Top late — ranked late list (feeds ≤3 attentions when material) */
  "attendance.top_late",
  /** Optional deepen chapters */
  "leave.summary",
  "regularisation.pending",
  "overtime.pending",
] as const;

export type AttendanceMonthMetricId = (typeof ATTENDANCE_MONTH_METRIC_IDS)[number];

/**
 * RBAC witness notes — freeze for Save report envelope permissionsUsed.
 * Pack must re-check on download; omit chapters when permission missing
 * (permission_omission warning + omittedNotes), never invent punches.
 */
export const ATTENDANCE_MONTH_RBAC = {
  /** Any of these may open the pack; skill scopes self vs team vs org */
  permissionsAnyOf: [
    "hr.attendance.read",
    "hr.attendance.team",
    "hr.punch.self",
  ] as const,
  /** Optional chapter permissions */
  chapterPermissions: {
    leave_summary: ["hr.leave.read", "hr.leave.approve", "hr.attendance.read"] as const,
    regularisation_summary: ["hr.attendance.read", "hr.attendance.write"] as const,
    overtime_summary: ["hr.attendance.read", "hr.attendance.team"] as const,
  },
  dataClasses: ["hr_attendance", "hr_pii"] as const,
  sensitivity: "hr_sensitive" as const,
  notes: [
    "hr.punch.self → self-only scope; never leak teammates’ punches.",
    "hr.attendance.team / .read → team/org register per existing skill RBAC.",
    "Do not surface salary/payroll totals from this pack (use salary skill).",
    "Month grain is explicit calendar month — no silent-month default on bare asks.",
  ],
} as const;

export type AttendanceMonthFindingShapeId =
  | "period_resolve_gap"
  | "month_overview"
  | "late_material"
  | "absent_material"
  | "top_late"
  | "leave_pending"
  | "regularisation_pending"
  | "overtime_pending"
  | "no_material_attention";

export type AttendanceMonthFindingShape = {
  id: AttendanceMonthFindingShapeId;
  chapter: string;
  evidenceToolId: (typeof ATTENDANCE_MONTH_CHAPTER_TOOLS)[number];
  contributorRole: string;
  confidence: Exclude<NovaFindingConfidence, "prediction">;
  materialWhenPresent: boolean;
  observationPattern: string;
  recommendation?: { label: string; href: string };
  deferred?: boolean;
};

export const ATTENDANCE_MONTH_FINDING_SHAPES: readonly AttendanceMonthFindingShape[] = [
  {
    id: "period_resolve_gap",
    chapter: "Resolve",
    evidenceToolId: "attendance_late_summary",
    contributorRole: "gap",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Attendance Month needs an explicit calendar month (e.g. this month / July) — I will not invent a silent month or punch theatre.",
    recommendation: { label: "Attendance register", href: "/attendance-hr/register" },
  },
  {
    id: "month_overview",
    chapter: "Overview",
    evidenceToolId: "attendance_late_summary",
    contributorRole: "overview",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "{periodLabel}: present {presentDays}, late {lateCount}, absent {absentDays} (register facts only).",
    recommendation: { label: "My attendance", href: "/attendance-hr/my-attendance" },
  },
  {
    id: "late_material",
    chapter: "Late",
    evidenceToolId: "attendance_late_summary",
    contributorRole: "late",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "{lateCount} late day(s) / late comer(s) in {periodLabel}.",
    recommendation: { label: "Exceptions", href: "/attendance-hr/exceptions" },
  },
  {
    id: "absent_material",
    chapter: "Absent",
    evidenceToolId: "attendance_late_summary",
    contributorRole: "absent",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "{absentDays} absent register day(s) in {periodLabel} (MISSING_PUNCH_IN / unpaid leave — no invented no-shows for month overview).",
    recommendation: { label: "Register", href: "/attendance-hr/register" },
  },
  {
    id: "top_late",
    chapter: "Top late",
    evidenceToolId: "attendance_late_summary",
    contributorRole: "top late",
    confidence: "supported_inference",
    materialWhenPresent: true,
    observationPattern: "Top late (≤3): {p1}; {p2}; {p3}. Overflow: {overflowCount}.",
    recommendation: { label: "Register", href: "/attendance-hr/register" },
  },
  {
    id: "leave_pending",
    chapter: "Leave",
    evidenceToolId: "leave_summary",
    contributorRole: "leave",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "Pending leave in scope: {pendingCount}.",
    recommendation: { label: "Leave", href: "/attendance-hr/leave" },
  },
  {
    id: "regularisation_pending",
    chapter: "Regularisation",
    evidenceToolId: "regularisation_summary",
    contributorRole: "regularisation",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "Pending regularisation: {pendingCount}.",
    recommendation: { label: "Regularisation", href: "/attendance-hr/regularisation" },
  },
  {
    id: "overtime_pending",
    chapter: "Overtime",
    evidenceToolId: "overtime_summary",
    contributorRole: "overtime",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "Pending overtime approvals: {pendingCount}.",
    recommendation: { label: "Overtime", href: "/attendance-hr/overtime" },
    deferred: true,
  },
  {
    id: "no_material_attention",
    chapter: "Quiet",
    evidenceToolId: "attendance_late_summary",
    contributorRole: "quiet",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "No material attendance attentions for {periodLabel}.",
    recommendation: { label: "Register", href: "/attendance-hr/register" },
  },
] as const;

export const ATTENDANCE_MONTH_PRIMARY_MAX = NOVA_MONTH_ATTENTION_PRIMARY_MAX;

export function selectAttendanceMonthAttentions(
  materialFindings: NovaFinding[],
  maxPrimary = ATTENDANCE_MONTH_PRIMARY_MAX
) {
  return selectNovaPackAttentions(materialFindings, maxPrimary);
}

export type AttendanceMonthGolden = {
  id: string;
  query: string;
  expectRecipeId: typeof ATTENDANCE_MONTH_PACK_ID | "month_performance" | "clarify" | "skill:attendance_late_summary";
  notes: string;
};

export const ATTENDANCE_MONTH_GOLDENS: readonly AttendanceMonthGolden[] = [
  {
    id: "am-signature",
    query: "how is this month's attendance?",
    expectRecipeId: "attendance_month",
    notes: "Signature ask — calendar month attendance pack, savable.",
  },
  {
    id: "am-typo-month",
    query: "how is this month attendance",
    expectRecipeId: "attendance_month",
    notes: "User typo/phrasing without possessive — same pack.",
  },
  {
    id: "am-this-month",
    query: "attendance this month",
    expectRecipeId: "attendance_month",
    notes: "Month overview phrasing → pack, not day skill default.",
  },
  {
    id: "am-overview",
    query: "this month attendance",
    expectRecipeId: "attendance_month",
    notes: "Inverted phrasing still routes to pack.",
  },
  {
    id: "am-named-month",
    query: "attendance for July",
    expectRecipeId: "attendance_month",
    notes: "Explicit calendar month label.",
  },
  {
    id: "am-late-month",
    query: "who was late this month",
    expectRecipeId: "attendance_month",
    notes: "Late chapter inside month pack; ≤3 attentions from top late.",
  },
  {
    id: "am-absent-month",
    query: "absent days this month",
    expectRecipeId: "attendance_month",
    notes: "Absent chapter — register facts only.",
  },
  {
    id: "am-day-stays-skill",
    query: "late comers today",
    expectRecipeId: "skill:attendance_late_summary",
    notes: "Day asks stay on thin skill — not a savable month pack.",
  },
  {
    id: "am-director-month",
    query: "How is this month going?",
    expectRecipeId: "month_performance",
    notes: "Director commercial Month stays pack #1; attendance is separate.",
  },
  {
    id: "am-bare-clarify",
    query: "attendance",
    expectRecipeId: "clarify",
    notes: "Bare attendance → period clarify upstream; never silent-month invent.",
  },
];

function draftMetricRefs(periodLabel?: string): NovaPackMetricRef[] {
  return ATTENDANCE_MONTH_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: null,
    display: undefined,
    periodLabel: periodLabel ?? "month:unresolved",
  }));
}

export type BuildAttendanceMonthPackStubInput = {
  periodLabel?: string;
  dataAsOf?: string;
  packVersion?: string;
  materialFindings?: NovaFinding[];
};

/**
 * Stub builder — NovaPackResult-compatible Attendance Month spine.
 * No skill fan-out, no invented punches. Implementer fills after save-report gate.
 */
export function buildAttendanceMonthPackStub(
  input: BuildAttendanceMonthPackStubInput = {}
): NovaPackResult {
  const label = input.periodLabel?.trim() || "this month";
  const dataAsOf = input.dataAsOf ?? new Date().toISOString();
  const attentions = input.materialFindings
    ? selectAttendanceMonthAttentions(input.materialFindings)
    : emptyNovaPackAttentions();

  return buildNovaPackResult({
    packId: ATTENDANCE_MONTH_PACK_ID,
    packVersion: input.packVersion ?? ATTENDANCE_MONTH_PREP_VERSION,
    period: {
      label,
      grain: "month",
      calendarKind: "calendar_month",
      source: input.periodLabel ? "explicit" : "default",
    },
    dataAsOf,
    metrics: draftMetricRefs(label),
    facts: [],
    findings: input.materialFindings ?? [],
    attentions,
    charts: [
      {
        bindingId: "kpi_strip",
        metricIds: [
          "attendance.present_days",
          "attendance.late_count",
          "attendance.absent_days",
        ],
        title: "Attendance month",
        points: [],
      },
      {
        bindingId: "ageing_or_attention",
        metricIds: ["attendance.top_late"],
        title: "Late attention",
        points: [],
      },
    ],
    links: [],
    warnings: [
      {
        code: "completeness",
        message:
          "Attendance Month PREP stub — chapters not executed; fill via catalog attendance fan-out.",
      },
      {
        code: "freshness",
        message: "Stub dataAsOf is build time only until live HR register reads run.",
      },
    ],
    omittedNotes: [
      ...ATTENDANCE_MONTH_CHAPTER_TOOLS.map((t) => `Stub omitted ${t} (not dispatched).`),
      "Not payroll / salary — use salary skill for payslips.",
      ...ATTENDANCE_MONTH_RBAC.notes,
    ],
    narrativeHints: [
      `Attendance Month PREP stub for ${label}.`,
      "Signature: how is this month's attendance?",
      "Metrics: overview · late · present · absent · top late · leave/reg/OT optional.",
      `Attentions: ≤${ATTENDANCE_MONTH_PRIMARY_MAX} primary; overflowCount for the rest; empty if nothing material.`,
      "RBAC: hr.attendance.read | hr.attendance.team | hr.punch.self (self-scoped).",
      "Savable via Save report / chat save-report follow-up.",
    ],
  });
}

/** Demo material findings for overflow-rule smoke (tests only — not live facts). */
export function buildAttendanceMonthDemoMaterialFindings(count: number): NovaFinding[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    buildNovaFinding({
      observation: `Demo late attention ${i + 1} — register follow-up.`,
      evidence: [{ toolId: "attendance_late_summary", summary: `demo-${i + 1}` }],
      contributors: [{ toolId: "attendance_late_summary", role: "top late" }],
      confidence: "fact",
    })
  );
}
