/**
 * Sprint 6 PREP — Collection Attention pack contract + NovaPackResult stub.
 * Live runner baseline: `collection-attention.ts` (recipe deepen). This module
 * freezes the deepened named-pack #3 shape for handoff, evals, and wiring
 * without inventing ledger facts.
 *
 * Plan: NOVA_3_0_PLAN.md §9 pack #3 · Phase 5 · Collection deepen.
 *
 * DEPENDENCY GATE: do not merge to main until Sprint 3 report plane + Sprint 4
 * certified metrics are live. Sprint 5 (Project Command) may run in parallel
 * after Sprint 3 — see COLLECTION_ATTENTION_HANDOFF.md.
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

/** Pack id — must match NovaPackId + recipe id `collection_attention`. */
export const COLLECTION_ATTENTION_PACK_ID = "collection_attention" as const;

export const COLLECTION_ATTENTION_PREP_VERSION = "0.1.0-prep";

/**
 * Signature + routing questions (rules-first / recipe examples).
 * Canonical: “collection attention for {party}”.
 */
export const COLLECTION_ATTENTION_QUESTIONS = [
  "collection attention for Avaada",
  "collections focus Miura",
  "outstanding and overdue for Tata",
  "collection attention for this project",
  "who needs collection attention?",
  "AR ageing and concentration",
  "unallocated advances and collection priorities",
] as const;

/**
 * Catalog chapters for Collection Attention v1 deepen.
 * Recipe v1 on tip is outstanding + overdue + receipts; PREP expands tools
 * for receivables / ageing / advances without free SQL.
 */
export const COLLECTION_ATTENTION_CHAPTER_TOOLS = [
  "customer_outstanding",
  "receivables_summary",
  "overdue_invoices",
  "receipts_summary",
  "reports_snapshot",
] as const;

/**
 * Metric ids for Collection Attention named pack #3.
 * Draft until Sprint 4 steward-certifies the collection set.
 * Stub values stay null; live pack fills from catalog skill facts only.
 *
 * Families (user contract):
 * - receivables · ageing · concentration · receipt trend · unallocated · priorities
 */
export const COLLECTION_ATTENTION_METRIC_IDS = [
  /** Receivables — open AR / party outstanding */
  "ar.receivables_open",
  "ar.customer_outstanding",
  /** Ageing — overdue count + bucketed AR (reports_snapshot / receivables) */
  "ar.overdue_invoice_count",
  "ar.ageing_buckets",
  /** Concentration — top-party share of open AR (fact-backed; no theatre) */
  "ar.concentration_top",
  /** Receipt trend — period collected + short trend series */
  "receipts.period_collected",
  "receipts.period_trend",
  /** Unallocated — customer advances on account */
  "ar.unallocated_advances",
  /** Priorities — ranked follow-up queue (Finding-backed, ≤3 attentions) */
  "ar.collection_priorities",
] as const;

export type CollectionAttentionMetricId = (typeof COLLECTION_ATTENTION_METRIC_IDS)[number];

/**
 * Finding shape catalog — observation templates + evidence/contributor roles.
 * Implementer maps skill facts → buildNovaFinding using these shapes only.
 * Never invent ₹ or a payment “risk score”; confidence is fact | supported_inference
 * (collection-delay estimate stays labeled prediction elsewhere).
 */
export type CollectionAttentionFindingShapeId =
  | "party_resolve_gap"
  | "receivables_open"
  | "ageing_buckets"
  | "overdue_material"
  | "concentration_top"
  | "receipt_trend"
  | "unallocated_advances"
  | "collection_priorities"
  | "no_material_attention";

export type CollectionAttentionFindingShape = {
  id: CollectionAttentionFindingShapeId;
  chapter: string;
  evidenceToolId: (typeof COLLECTION_ATTENTION_CHAPTER_TOOLS)[number];
  contributorRole: string;
  confidence: Exclude<NovaFindingConfidence, "prediction">;
  /** When true, only emit if material (feeds ≤3 attentions) */
  materialWhenPresent: boolean;
  observationPattern: string;
  recommendation?: { label: string; href: string };
  /** Prep note — metric/skill may need Sprint 4 dictionary + skill deepen */
  deferred?: boolean;
};

export const COLLECTION_ATTENTION_FINDING_SHAPES: readonly CollectionAttentionFindingShape[] = [
  {
    id: "party_resolve_gap",
    chapter: "Resolve",
    evidenceToolId: "customer_outstanding",
    contributorRole: "gap",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Collection Attention needs a resolved customer or project scope — name it or confirm from clarify. I will not invent a payment risk score.",
    recommendation: { label: "Receivables", href: "/accounts/receivables" },
  },
  {
    id: "receivables_open",
    chapter: "Receivables",
    evidenceToolId: "receivables_summary",
    contributorRole: "receivables",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Open receivables: {openInr} ({partyCount} party(ies)).",
    recommendation: { label: "Receivables", href: "/accounts/receivables" },
  },
  {
    id: "ageing_buckets",
    chapter: "Ageing",
    evidenceToolId: "reports_snapshot",
    contributorRole: "ageing",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "AR ageing: current {currentInr}, 1–30 {d30}, 31–60 {d60}, 61–90 {d90}, 90+ {d90plus}.",
    recommendation: { label: "Receivables", href: "/accounts/receivables" },
  },
  {
    id: "overdue_material",
    chapter: "Overdue",
    evidenceToolId: "overdue_invoices",
    contributorRole: "overdue",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "{count} overdue invoice(s) — {outstandingInr} outstanding.",
    recommendation: { label: "Billing", href: "/billing" },
  },
  {
    id: "concentration_top",
    chapter: "Concentration",
    evidenceToolId: "receivables_summary",
    contributorRole: "concentration",
    confidence: "supported_inference",
    materialWhenPresent: true,
    observationPattern:
      "Top {n} parties hold {sharePct}% of open receivables ({topInr}) — concentration attention.",
    recommendation: { label: "Receivables", href: "/accounts/receivables" },
  },
  {
    id: "receipt_trend",
    chapter: "Receipts",
    evidenceToolId: "receipts_summary",
    contributorRole: "receipt trend",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Receipts {periodLabel}: {collectedInr} (trend vs prior: {deltaLabel}).",
    recommendation: { label: "Receipts", href: "/receipts" },
  },
  {
    id: "unallocated_advances",
    chapter: "Unallocated",
    evidenceToolId: "receivables_summary",
    contributorRole: "unallocated",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Unallocated customer advances on account: {advanceInr} across {partyCount} party(ies).",
    recommendation: { label: "Receivables", href: "/accounts/receivables" },
  },
  {
    id: "collection_priorities",
    chapter: "Priorities",
    evidenceToolId: "overdue_invoices",
    contributorRole: "priorities",
    confidence: "supported_inference",
    materialWhenPresent: true,
    observationPattern:
      "Collection priorities (≤3): {p1}; {p2}; {p3}. Overflow: {overflowCount} more.",
    recommendation: { label: "Billing", href: "/billing" },
  },
  {
    id: "no_material_attention",
    chapter: "Quiet",
    evidenceToolId: "overdue_invoices",
    contributorRole: "quiet",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "No material collection attentions for this scope.",
    recommendation: { label: "Receivables", href: "/accounts/receivables" },
  },
] as const;

/** Up-to-3 primary attentions; overflowCount = material beyond cap (no theatre). */
export const COLLECTION_ATTENTION_PRIMARY_MAX = NOVA_MONTH_ATTENTION_PRIMARY_MAX;

/**
 * Apply the Month / pack attention rule for Collection.
 * Nothing material → empty primary + overflow 0.
 */
export function selectCollectionAttentions(
  materialFindings: NovaFinding[],
  maxPrimary = COLLECTION_ATTENTION_PRIMARY_MAX
) {
  return selectNovaPackAttentions(materialFindings, maxPrimary);
}

/** Collection-scoped golden queries for Sprint 6 eval / SearchEngine routing. */
export type CollectionAttentionGolden = {
  id: string;
  query: string;
  expectRecipeId: typeof COLLECTION_ATTENTION_PACK_ID | "month_performance" | "clarify";
  notes: string;
};

export const COLLECTION_ATTENTION_GOLDENS: readonly CollectionAttentionGolden[] = [
  {
    id: "ca-signature",
    query: "collection attention for Avaada",
    expectRecipeId: "collection_attention",
    notes: "Signature ask — party-scoped outstanding + overdue + receipts.",
  },
  {
    id: "ca-collections-focus",
    query: "collections focus Miura",
    expectRecipeId: "collection_attention",
    notes: "Alias phrasing for Collection Attention.",
  },
  {
    id: "ca-outstanding-overdue",
    query: "outstanding and overdue for Tata",
    expectRecipeId: "collection_attention",
    notes: "Money chapter keywords → named pack, not free tool pick.",
  },
  {
    id: "ca-project-aware",
    query: "collection attention for this project",
    expectRecipeId: "collection_attention",
    notes: "Project-aware Collection — DialogState project slot; not Project Command.",
  },
  {
    id: "ca-who-needs",
    query: "who needs collection attention?",
    expectRecipeId: "collection_attention",
    notes: "Portfolio priorities ask — ≤3 attentions + overflow rule.",
  },
  {
    id: "ca-ageing-concentration",
    query: "AR ageing and concentration",
    expectRecipeId: "collection_attention",
    notes: "Ageing + concentration metrics; chart binding ageing_or_attention only.",
  },
  {
    id: "ca-unallocated-priorities",
    query: "unallocated advances and collection priorities",
    expectRecipeId: "collection_attention",
    notes: "Unallocated advances + priority queue Findings.",
  },
  {
    id: "ca-inside-month",
    query: "How is this month going?",
    expectRecipeId: "month_performance",
    notes: "Collection remains a chapter inside Month; Month stays pack #1.",
  },
  {
    id: "ca-ambiguous-party",
    query: "collection attention",
    expectRecipeId: "clarify",
    notes: "No party/project resolved — clarify; never invent outstanding ₹.",
  },
  {
    id: "ca-no-risk-score",
    query: "collection risk score for Avaada",
    expectRecipeId: "collection_attention",
    notes: "Refuse payment risk scores; facts + ≤3 attentions only (delay estimate stays labeled).",
  },
];

function draftMetricRefs(scopeLabel?: string): NovaPackMetricRef[] {
  return COLLECTION_ATTENTION_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: null,
    display: undefined,
    periodLabel: scopeLabel ? `scope:${scopeLabel}` : "scope:unresolved",
  }));
}

export type BuildCollectionAttentionPackStubInput = {
  /** Customer / project display label for narrative hints */
  scopeLabel?: string;
  /** ISO as-of; defaults to now */
  dataAsOf?: string;
  packVersion?: string;
  /** Optional material findings to exercise ≤3 + overflow (tests / demos) */
  materialFindings?: NovaFinding[];
};

/**
 * Stub builder — NovaPackResult-compatible Collection Attention spine.
 * No skill fan-out, no invented facts. Implementer fills metrics/findings
 * from catalog skills after Sprint 3+4 gate.
 */
export function buildCollectionAttentionPackStub(
  input: BuildCollectionAttentionPackStubInput = {}
): NovaPackResult {
  const label = input.scopeLabel?.trim() || "unresolved scope";
  const dataAsOf = input.dataAsOf ?? new Date().toISOString();
  const attentions = input.materialFindings
    ? selectCollectionAttentions(input.materialFindings)
    : emptyNovaPackAttentions();

  return buildNovaPackResult({
    packId: COLLECTION_ATTENTION_PACK_ID,
    packVersion: input.packVersion ?? COLLECTION_ATTENTION_PREP_VERSION,
    period: {
      label: input.scopeLabel ? `open balances · ${label}` : "open balances",
      grain: "open",
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
        bindingId: "ageing_or_attention",
        metricIds: ["ar.ageing_buckets", "ar.collection_priorities"],
        title: "Collection attention",
        points: [],
      },
      {
        bindingId: "period_trend",
        metricIds: ["receipts.period_collected", "receipts.period_trend"],
        title: "Receipt trend",
        points: [],
      },
    ],
    links: [],
    warnings: [
      {
        code: "completeness",
        message:
          "Sprint 6 PREP stub — chapters not executed; fill via runCollectionAttentionPackRecipe fan-out.",
      },
      {
        code: "freshness",
        message: "Stub dataAsOf is build time only until live AR reads run.",
      },
    ],
    omittedNotes: [
      ...COLLECTION_ATTENTION_CHAPTER_TOOLS.map((t) => `Stub omitted ${t} (not dispatched).`),
      "Not a payment risk score — collection-delay estimate stays labeled elsewhere.",
    ],
    narrativeHints: [
      `Collection Attention PREP stub for ${label}.`,
      "Signature: collection attention for {party}.",
      "Metrics: receivables · ageing · concentration · receipt trend · unallocated · priorities.",
      `Attentions: ≤${COLLECTION_ATTENTION_PRIMARY_MAX} primary; overflowCount for the rest; empty if nothing material.`,
      "Blocked from main until Sprint 3 report plane + Sprint 4 certified metrics are live.",
      "Sprint 5 Project Command may proceed in parallel after Sprint 3 (optional).",
    ],
  });
}

/** Demo material findings for overflow-rule smoke (tests only — not live facts). */
export function buildCollectionAttentionDemoMaterialFindings(count: number): NovaFinding[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    buildNovaFinding({
      observation: `Demo collection priority ${i + 1} — overdue follow-up.`,
      evidence: [{ toolId: "overdue_invoices", summary: `demo-${i + 1}` }],
      contributors: [{ toolId: "overdue_invoices", role: "priorities" }],
      confidence: "fact",
    })
  );
}
