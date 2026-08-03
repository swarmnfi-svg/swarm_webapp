/**
 * Sprint 5 PREP — Project Command pack contract + NovaPackResult stub.
 * Full fan-out lives in `project-command.ts`; this module freezes the shape for
 * handoff, evals, and wiring without skill dispatch.
 *
 * Plan: NOVA_3_0_PLAN.md §9 pack #2 / Phase 5 / Ship #9.
 *
 * DEPENDENCY GATE: do not merge to main until Sprint 3 report plane is
 * deployer health-matched (Save report / download ACL / regenerate). Sprint 4
 * certified metrics ideal for badges — see PROJECT_COMMAND_HANDOFF.md.
 */

import {
  buildNovaPackResult,
  emptyNovaPackAttentions,
  type NovaPackMetricRef,
  type NovaPackResult,
} from "@/lib/nova/pack-result";
import type { NovaFindingConfidence } from "@/lib/nova/recipes/finding";

/** Pack id — must match NovaPackId + recipe id `project_command`. */
export const PROJECT_COMMAND_PACK_ID = "project_command" as const;

export const PROJECT_COMMAND_PREP_VERSION = "0.1.0-prep";

/**
 * Signature + routing questions (rules-first / recipe examples).
 * Canonical: “tell me everything important about this project”.
 */
export const PROJECT_COMMAND_QUESTIONS = [
  "tell me everything important about this project",
  "Project Command for Tata plant",
  "project deep dive",
  "everything important about project X",
  "project command for this project",
  "how is this project doing — full picture",
] as const;

/**
 * EPC spine chapters (plan: SO / PO / delivery / invoice / cash / milestones / attention).
 * Tool ids must stay catalog-only.
 */
export const PROJECT_COMMAND_CHAPTER_TOOLS = [
  "projects_summary",
  "tasks_summary",
  "sales_orders_summary",
  "purchase_orders_summary",
  "delivery_summary",
  "sales_summary",
  "receipts_summary",
  "overdue_invoices",
] as const;

/**
 * Metric ids for Project Command v1 (draft certification until Sprint 4 steward pass
 * is extended). Values stay null in the stub; live pack fills from skill facts.
 */
export const PROJECT_COMMAND_METRIC_IDS = [
  "projects.active_count",
  "tasks.open",
  "sales_orders.count",
  "purchase_orders.count",
  "delivery.summary",
  "sales.period_total",
  "receipts.period_collected",
  "ar.overdue_invoice_count",
] as const;

export type ProjectCommandMetricId = (typeof PROJECT_COMMAND_METRIC_IDS)[number];

/**
 * Finding shape catalog — observation templates + evidence/contributor roles.
 * Implementer maps skill facts → buildNovaFinding using these shapes only.
 * Never invent ₹ or health scores; confidence is fact | supported_inference only
 * (predictions only via labeled estimate path elsewhere).
 */
export type ProjectCommandFindingShapeId =
  | "project_resolve_gap"
  | "project_spine"
  | "open_tasks"
  | "sales_orders"
  | "purchase_orders"
  | "deliveries"
  | "invoices"
  | "cash_collected"
  | "overdue_attention"
  | "milestones_gap";

export type ProjectCommandFindingShape = {
  id: ProjectCommandFindingShapeId;
  /** Human chapter label */
  chapter: string;
  /** Primary catalog tool that must back evidence */
  evidenceToolId: (typeof PROJECT_COMMAND_CHAPTER_TOOLS)[number] | "projects_summary";
  contributorRole: string;
  confidence: Exclude<NovaFindingConfidence, "prediction">;
  /** When true, only emit if material (feeds ≤3 attentions) */
  materialWhenPresent: boolean;
  /** Observation pattern for docs/evals — `{name}` = resolved project label */
  observationPattern: string;
  recommendation?: { label: string; href: string };
  /** Prep note — milestones not yet a catalog skill; shape reserved */
  deferred?: boolean;
};

export const PROJECT_COMMAND_FINDING_SHAPES: readonly ProjectCommandFindingShape[] = [
  {
    id: "project_resolve_gap",
    chapter: "Resolve",
    evidenceToolId: "projects_summary",
    contributorRole: "gap",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Project Command needs a single resolved project — name it or confirm from clarify. I will not invent EPC health scores.",
    recommendation: { label: "Projects", href: "/projects" },
  },
  {
    id: "project_spine",
    chapter: "Spine",
    evidenceToolId: "projects_summary",
    contributorRole: "project spine",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "{name}: {taskOpen} open tasks, {checklistOpen} checklist open, {deliveryCount} deliveries, {invoiceCount} invoices.",
    recommendation: { label: "Projects", href: "/projects" },
  },
  {
    id: "open_tasks",
    chapter: "Tasks",
    evidenceToolId: "tasks_summary",
    contributorRole: "tasks",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "{open} open task(s) on {name}.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
  {
    id: "sales_orders",
    chapter: "SO",
    evidenceToolId: "sales_orders_summary",
    contributorRole: "SO",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Sales orders in scope: {count}.",
    recommendation: { label: "Sales orders", href: "/sales-orders" },
  },
  {
    id: "purchase_orders",
    chapter: "PO",
    evidenceToolId: "purchase_orders_summary",
    contributorRole: "PO",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Purchase orders in scope: {count}.",
    recommendation: { label: "Purchase orders", href: "/purchase-orders" },
  },
  {
    id: "deliveries",
    chapter: "Delivery",
    evidenceToolId: "delivery_summary",
    contributorRole: "delivery",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Deliveries in scope: {count}.",
    recommendation: { label: "Deliveries", href: "/delivery" },
  },
  {
    id: "invoices",
    chapter: "Invoice",
    evidenceToolId: "sales_summary",
    contributorRole: "invoices",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Invoiced: {grandTotal} ({invoiceCount} invoice(s)).",
    recommendation: { label: "Billing", href: "/billing" },
  },
  {
    id: "cash_collected",
    chapter: "Cash",
    evidenceToolId: "receipts_summary",
    contributorRole: "cash",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Cash collected: {totalCollected}.",
    recommendation: { label: "Receipts", href: "/receipts" },
  },
  {
    id: "overdue_attention",
    chapter: "Attention",
    evidenceToolId: "overdue_invoices",
    contributorRole: "overdue",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "{count} overdue invoice(s) on {name} — collection attention.",
    recommendation: { label: "Billing", href: "/billing" },
  },
  {
    id: "milestones_gap",
    chapter: "Milestones",
    evidenceToolId: "projects_summary",
    contributorRole: "milestones",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "Milestone chapter deferred — no catalog skill yet; do not invent milestone theatre.",
    recommendation: { label: "Projects", href: "/projects" },
    deferred: true,
  },
] as const;

/** Project-scoped golden queries for Sprint 5 eval / SearchEngine routing. */
export type ProjectCommandGolden = {
  id: string;
  query: string;
  /** Expected recipe / pack route */
  expectRecipeId: typeof PROJECT_COMMAND_PACK_ID | "project_health" | "clarify";
  notes: string;
};

export const PROJECT_COMMAND_GOLDENS: readonly ProjectCommandGolden[] = [
  {
    id: "pc-james-school-work-tasks-photos",
    query:
      "Could you please share the complete details of the work carried out at the James School project, including who was responsible for each task? Also, if you have any plant photos, site images, or other related pictures available, kindly share them with me.",
    expectRecipeId: "project_command",
    notes:
      "Named project + work/tasks/photos → Project Command (entity resolve), never FY projects_summary.",
  },
  {
    id: "pc-james-school-short",
    query: "James School project tasks and who handled them",
    expectRecipeId: "project_command",
    notes: "Short named-project task ask → Project Command.",
  },
  {
    id: "pc-signature",
    query: "tell me everything important about this project",
    expectRecipeId: "project_command",
    notes: "Signature ask — needs resolved project entity or clarify.",
  },
  {
    id: "pc-named",
    query: "Project Command for Tata plant",
    expectRecipeId: "project_command",
    notes: "Named project bind → full EPC spine.",
  },
  {
    id: "pc-deep-dive",
    query: "project deep dive",
    expectRecipeId: "project_command",
    notes: "Alias phrasing for Project Command.",
  },
  {
    id: "pc-everything-x",
    query: "everything important about project Solar Phase 2",
    expectRecipeId: "project_command",
    notes: "Natural language project name in query.",
  },
  {
    id: "pc-follow-up-after-month",
    query: "and for this project?",
    expectRecipeId: "project_command",
    notes: "Follow-up after Month Performance — DialogState project slot.",
  },
  {
    id: "pc-so-po-cash",
    query: "SO PO delivery invoice cash for Tata plant",
    expectRecipeId: "project_command",
    notes: "Spine keyword ask should still land Project Command not free tool pick.",
  },
  {
    id: "pc-overdue-on-project",
    query: "overdue invoices on this project",
    expectRecipeId: "project_command",
    notes: "Attention chapter; may also hit overdue skill — pack preferred when project-scoped.",
  },
  {
    id: "pc-health-thin",
    query: "project health for Tata plant",
    expectRecipeId: "project_health",
    notes: "Thin recipe remains; Project Command is the deep pack.",
  },
  {
    id: "pc-ambiguous",
    query: "tell me everything important about this project",
    expectRecipeId: "clarify",
    notes: "When no project resolved — clarify, never invent scopedFacts.",
  },
  {
    id: "pc-no-theatre",
    query: "is project X healthy?",
    expectRecipeId: "project_command",
    notes: "Refuse invented health scores; facts + ≤3 attentions only.",
  },
];

function draftMetricRefs(projectLabel?: string): NovaPackMetricRef[] {
  return PROJECT_COMMAND_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: null,
    display: undefined,
    periodLabel: projectLabel ? `project:${projectLabel}` : "project:unresolved",
  }));
}

export type BuildProjectCommandPackStubInput = {
  /** Display name for narrative hints */
  projectLabel?: string;
  /** ISO as-of; defaults to now */
  dataAsOf?: string;
  packVersion?: string;
};

/**
 * Stub builder — NovaPackResult-compatible empty EPC spine.
 * No skill fan-out, no invented facts. Implementer fills metrics/findings from catalog skills.
 */
export function buildProjectCommandPackStub(
  input: BuildProjectCommandPackStubInput = {}
): NovaPackResult {
  const label = input.projectLabel?.trim() || "unresolved project";
  const dataAsOf = input.dataAsOf ?? new Date().toISOString();

  return buildNovaPackResult({
    packId: PROJECT_COMMAND_PACK_ID,
    packVersion: input.packVersion ?? PROJECT_COMMAND_PREP_VERSION,
    period: {
      label: `as-of ${label}`,
      grain: "latest",
      calendarKind: "point_in_time",
      source: "default",
    },
    dataAsOf,
    metrics: draftMetricRefs(input.projectLabel),
    facts: [],
    findings: [],
    attentions: emptyNovaPackAttentions(),
    charts: [],
    links: [],
    warnings: [
      {
        code: "completeness",
        message:
          "Sprint 5 PREP stub — chapters not executed; fill via runProjectCommandPack skill fan-out.",
      },
      {
        code: "freshness",
        message: "Stub dataAsOf is build time only until live ledger reads run.",
      },
    ],
    omittedNotes: [
      ...PROJECT_COMMAND_CHAPTER_TOOLS.map((t) => `Stub omitted ${t} (not dispatched).`),
      "Milestone chapter deferred (no catalog skill).",
    ],
    narrativeHints: [
      `Project Command PREP stub for ${label}.`,
      "Signature: tell me everything important about this project.",
      "Spine: SO / PO / delivery / invoice / cash / tasks — milestones deferred.",
      "Attentions: empty until material findings exist (≤3 primary, no theatre).",
      "Blocked from main until Sprint 3 report plane is deployer health-matched.",
    ],
  });
}
