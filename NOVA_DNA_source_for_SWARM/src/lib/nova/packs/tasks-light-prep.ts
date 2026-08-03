/**
 * PREP — Tasks chapter deepen (Project Command) + optional light tasks pack.
 * Freezes open / overdue / due-soon / completed shapes from `tasks_summary`
 * (+ optional `my_work_summary`) without inventing assignee theatre.
 *
 * Signature asks:
 * - Project chapter: “open / overdue tasks on this project” (inside Project Command)
 * - Light pack: “my overdue tasks” / “team tasks this week”
 *
 * DEPENDENCY GATE: do not merge to main until sole deployer confirms presentation
 * polish is live (health-matched) and pulls this prep. No version bump from this
 * branch — see TASKS_LIGHT_HANDOFF.md.
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

/** Pack id — must match NovaPackId + future recipe id `tasks_light` when named. */
export const TASKS_LIGHT_PACK_ID = "tasks_light" as const;

export const TASKS_LIGHT_PREP_VERSION = "0.1.0-prep";

/**
 * Signature + routing questions.
 * Canonical light pack: “my overdue tasks”
 * Project chapter deepen reuses Project Command when project-scoped.
 */
export const TASKS_LIGHT_QUESTIONS = [
  "my overdue tasks",
  "overdue tasks",
  "open tasks on this project",
  "tasks pending in Tata plant",
  "team tasks this week",
  "Zeeshan overdue tasks",
  "due soon tasks",
  "what tasks are open?",
] as const;

/**
 * Catalog chapters — ops skills already on tip.
 * Project Command already fans out `tasks_summary`; this PREP deepens finding
 * shapes (overdue / due-soon / completed) and optionally a savable light pack.
 */
export const TASKS_LIGHT_CHAPTER_TOOLS = [
  "tasks_summary",
  "my_work_summary",
] as const;

/**
 * Metric ids for Tasks chapter / light pack.
 * Draft until steward-certifies. Shared with Project Command where noted.
 *
 * Families:
 * - open · overdue · due soon · completed · my work (self)
 */
export const TASKS_LIGHT_METRIC_IDS = [
  /** Open — shared with Project Command (`tasks.open`) */
  "tasks.open",
  /** Overdue — overdueCount from tasks_summary */
  "tasks.overdue",
  /** Due soon — dueSoonCount (within 7 days) */
  "tasks.due_soon",
  /** Completed in period — completedCount + completedPeriod label */
  "tasks.completed_period",
  /** Self snapshot — optional light-pack chapter (not Project Command spine) */
  "my_work.summary",
] as const;

export type TasksLightMetricId = (typeof TASKS_LIGHT_METRIC_IDS)[number];

/**
 * RBAC witness notes — task scopes are permission-gated inside the skill.
 * Save report must record permissionsUsed; download ACL re-check; never invent
 * org-wide totals when project- or person-scoped.
 */
export const TASKS_LIGHT_RBAC = {
  /** Gate to open pack / Project Command tasks chapter */
  permissionsAnyOf: ["task.read.self", "task.edit.team", "task.admin"] as const,
  chapterPermissions: {
    tasks_summary: ["task.read.self", "task.edit.team", "task.admin"] as const,
    my_work_summary: ["task.read.self", "kpi.read.self", "hr.leave.create"] as const,
  },
  dataClasses: ["ops_summary"] as const,
  sensitivity: "ops" as const,
  notes: [
    "Missing all task.* gates → omit tasks chapter (permission_omission); do not invent open counts.",
    "task.read.self alone → self / own tasks only; never leak teammates’ tasks.",
    "task.edit.team / task.admin → team or org per existing tasks_summary RBAC.",
    "Project-scoped asks must keep projectScoped=true counts — never report org-wide totals.",
    "Person-scoped asks (named assignee) require team/admin when viewing others; else deny with skill error.",
    "my_work_summary is session-self only — omit from Project Command spine; use only for light pack self brief.",
    "NOVA does not create or assign tasks — read-only catalog skills only.",
  ],
} as const;

/**
 * Ship shape choice (implementer / deployer):
 * - `project_chapter` — deepen Project Command Tasks chapter only (preferred default)
 * - `named_pack` — recipe id tasks_light, savable brief for my/team/overdue asks
 */
export const TASKS_LIGHT_SHIP_OPTIONS = ["project_chapter", "named_pack"] as const;
export type TasksLightShipOption = (typeof TASKS_LIGHT_SHIP_OPTIONS)[number];

export type TasksLightFindingShapeId =
  | "scope_resolve_gap"
  | "permission_gap"
  | "open_load"
  | "overdue_material"
  | "due_soon"
  | "completed_period"
  | "my_work_snapshot"
  | "no_material_attention";

export type TasksLightFindingShape = {
  id: TasksLightFindingShapeId;
  chapter: string;
  evidenceToolId: (typeof TASKS_LIGHT_CHAPTER_TOOLS)[number];
  contributorRole: string;
  confidence: Exclude<NovaFindingConfidence, "prediction">;
  materialWhenPresent: boolean;
  observationPattern: string;
  recommendation?: { label: string; href: string };
  /** When true, only for named_pack ship (not Project Command spine) */
  lightPackOnly?: boolean;
};

export const TASKS_LIGHT_FINDING_SHAPES: readonly TasksLightFindingShape[] = [
  {
    id: "scope_resolve_gap",
    chapter: "Resolve",
    evidenceToolId: "tasks_summary",
    contributorRole: "gap",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Tasks need a resolved project, person, or self scope — name it or confirm from clarify. I will not invent open counts.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
  {
    id: "permission_gap",
    chapter: "Resolve",
    evidenceToolId: "tasks_summary",
    contributorRole: "gap",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Tasks chapter needs task.read.self (or team/admin) — I will not invent assignee load.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
  {
    id: "open_load",
    chapter: "Open",
    evidenceToolId: "tasks_summary",
    contributorRole: "open",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "{open} open task(s) in scope{scopeLabel}.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
  {
    id: "overdue_material",
    chapter: "Overdue",
    evidenceToolId: "tasks_summary",
    contributorRole: "overdue",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "{overdue} overdue task(s) in scope — attention.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
  {
    id: "due_soon",
    chapter: "Due soon",
    evidenceToolId: "tasks_summary",
    contributorRole: "due soon",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "{dueSoon} task(s) due within 7 days.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
  {
    id: "completed_period",
    chapter: "Completed",
    evidenceToolId: "tasks_summary",
    contributorRole: "completed",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "{completed} completed in {completedPeriod}.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
  {
    id: "my_work_snapshot",
    chapter: "My work",
    evidenceToolId: "my_work_summary",
    contributorRole: "my work",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "My work: {open} open tasks; KPI / leave chapters as permitted.",
    recommendation: { label: "My work", href: "/tasks" },
    lightPackOnly: true,
  },
  {
    id: "no_material_attention",
    chapter: "Quiet",
    evidenceToolId: "tasks_summary",
    contributorRole: "quiet",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "No material task attentions for this scope.",
    recommendation: { label: "Tasks", href: "/tasks" },
  },
] as const;

/** Project Command Tasks chapter shapes (exclude lightPackOnly). */
export const PROJECT_COMMAND_TASKS_CHAPTER_SHAPES =
  TASKS_LIGHT_FINDING_SHAPES.filter((s) => !s.lightPackOnly);

export const TASKS_LIGHT_PRIMARY_MAX = NOVA_MONTH_ATTENTION_PRIMARY_MAX;

export function selectTasksLightAttentions(
  materialFindings: NovaFinding[],
  maxPrimary = TASKS_LIGHT_PRIMARY_MAX
) {
  return selectNovaPackAttentions(materialFindings, maxPrimary);
}

export type TasksLightGolden = {
  id: string;
  query: string;
  expectRecipeId:
    | typeof TASKS_LIGHT_PACK_ID
    | "project_command"
    | "clarify"
    | "skill:tasks_summary"
    | "skill:my_work_summary";
  notes: string;
};

/**
 * Goldens list — wire routing when implementer lands named pack / chapter deepen.
 * Until then: project-scoped → Project Command; bare my/overdue → thin skill.
 */
export const TASKS_LIGHT_GOLDENS: readonly TasksLightGolden[] = [
  {
    id: "tl-signature-overdue",
    query: "my overdue tasks",
    expectRecipeId: "tasks_light",
    notes: "Signature light-pack ask when shipAs=named_pack; else skill:tasks_summary.",
  },
  {
    id: "tl-overdue",
    query: "overdue tasks",
    expectRecipeId: "tasks_light",
    notes: "Portfolio overdue — named pack or thin skill until routing lands.",
  },
  {
    id: "tl-project-open",
    query: "open tasks on this project",
    expectRecipeId: "project_command",
    notes:
      "Project-scoped → Project Command Tasks chapter (recipeMatchesQuery).",
  },
  {
    id: "tl-project-pending",
    query: "tasks pending in Tata plant",
    expectRecipeId: "project_command",
    notes:
      "Named project tasks → Project Command (recipeMatchesQuery).",
  },
  {
    id: "tl-team-week",
    query: "team tasks this week",
    expectRecipeId: "tasks_light",
    notes: "Team scope light pack when shipAs=named_pack; RBAC team/admin.",
  },
  {
    id: "tl-person",
    query: "Zeeshan overdue tasks",
    expectRecipeId: "skill:tasks_summary",
    notes: "Named assignee stays thin skill unless light pack person routing ships.",
  },
  {
    id: "tl-due-soon",
    query: "due soon tasks",
    expectRecipeId: "tasks_light",
    notes: "Due-soon chapter metric tasks.due_soon.",
  },
  {
    id: "tl-open-what",
    query: "what tasks are open?",
    expectRecipeId: "tasks_light",
    notes: "Open load ask — named pack or thin skill.",
  },
  {
    id: "tl-project-command-spine",
    query: "tell me everything important about this project",
    expectRecipeId: "project_command",
    notes: "Full Project Command still owns Tasks chapter; light pack is not a substitute.",
  },
  {
    id: "tl-my-work-thin",
    query: "my work",
    expectRecipeId: "skill:my_work_summary",
    notes: "My work snapshot stays thin skill; optional light-pack chapter only when shipAs=named_pack.",
  },
  {
    id: "tl-ambiguous",
    query: "tasks",
    expectRecipeId: "clarify",
    notes: "Bare tasks → clarify scope (self / person / project) or thin skill; never invent org totals.",
  },
  {
    id: "tl-no-theatre",
    query: "how overloaded is the team?",
    expectRecipeId: "tasks_light",
    notes: "Refuse invented overload scores; facts + ≤3 attentions from overdue/due-soon only.",
  },
];

function draftMetricRefs(scopeLabel?: string): NovaPackMetricRef[] {
  return TASKS_LIGHT_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: null,
    display: undefined,
    periodLabel: scopeLabel ? `scope:${scopeLabel}` : "scope:unresolved",
  }));
}

export type BuildTasksLightPackStubInput = {
  scopeLabel?: string;
  dataAsOf?: string;
  packVersion?: string;
  materialFindings?: NovaFinding[];
  /** Document preferred ship shape in narrative hints */
  shipAs?: TasksLightShipOption;
};

/**
 * Stub builder — NovaPackResult-compatible Tasks light spine.
 * No skill fan-out, no invented counts. Prefer shipAs=project_chapter when
 * deepening Project Command only (stub still uses pack id for schema smoke).
 */
export function buildTasksLightPackStub(
  input: BuildTasksLightPackStubInput = {}
): NovaPackResult {
  const label = input.scopeLabel?.trim() || "unresolved scope";
  const dataAsOf = input.dataAsOf ?? new Date().toISOString();
  const shipAs = input.shipAs ?? "project_chapter";
  const attentions = input.materialFindings
    ? selectTasksLightAttentions(input.materialFindings)
    : emptyNovaPackAttentions();

  return buildNovaPackResult({
    packId: TASKS_LIGHT_PACK_ID,
    packVersion: input.packVersion ?? TASKS_LIGHT_PREP_VERSION,
    period: {
      label: `as-of ${label}`,
      grain: "latest",
      calendarKind: "point_in_time",
      source: input.scopeLabel ? "explicit" : "default",
    },
    dataAsOf,
    metrics: draftMetricRefs(input.scopeLabel),
    facts: [],
    findings: input.materialFindings ?? [],
    attentions,
    charts: [
      {
        bindingId: "kpi_strip",
        metricIds: ["tasks.open", "tasks.overdue", "tasks.due_soon"],
        title: "Task load",
        points: [],
      },
      {
        bindingId: "ageing_or_attention",
        metricIds: ["tasks.overdue", "tasks.due_soon"],
        title: "Task attention",
        points: [],
      },
    ],
    links: [],
    warnings: [
      {
        code: "completeness",
        message:
          "Tasks light PREP stub — chapters not executed; fill via tasks_summary (+ optional my_work) fan-out.",
      },
      {
        code: "freshness",
        message: "Stub dataAsOf is build time only until live task reads run.",
      },
    ],
    omittedNotes: [
      ...TASKS_LIGHT_CHAPTER_TOOLS.map((t) => `Stub omitted ${t} (not dispatched).`),
      ...TASKS_LIGHT_RBAC.notes,
    ],
    narrativeHints: [
      `Tasks light PREP stub for ${label}.`,
      "Signature light pack: my overdue tasks.",
      "Project chapter: open/overdue/due-soon on Project Command spine.",
      "Metrics: tasks.open · overdue · due_soon · completed_period · my_work.summary.",
      `Ship option: ${shipAs} (project_chapter | named_pack).`,
      `Attentions: ≤${TASKS_LIGHT_PRIMARY_MAX} primary; empty if nothing material.`,
      "Blocked from main until presentation polish is deployer health-matched.",
      "Savable via Save report when shipAs=named_pack; else deepen Project Command only.",
    ],
  });
}

/** Demo material findings for overflow-rule smoke (tests only). */
export function buildTasksLightDemoMaterialFindings(count: number): NovaFinding[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    buildNovaFinding({
      observation: `Demo overdue task attention ${i + 1}.`,
      evidence: [{ toolId: "tasks_summary", summary: `demo-${i + 1}` }],
      contributors: [{ toolId: "tasks_summary", role: "overdue" }],
      confidence: "fact",
    })
  );
}
