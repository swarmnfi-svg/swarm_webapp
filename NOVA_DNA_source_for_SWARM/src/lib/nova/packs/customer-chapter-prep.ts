/**
 * PREP — Customer chapter notes for Collection Attention deepen.
 * Adds customer-master context (`customers_summary`) beside existing AR / overdue /
 * receipts chapters — does **not** create a fourth named pack or duplicate Collection.
 *
 * Signature asks stay Collection Attention (“collection attention for {party}”);
 * thin master asks (“customers”, “customer list”) stay `customers_summary`.
 *
 * DEPENDENCY GATE: do not merge to main until sole deployer confirms presentation
 * polish is live (health-matched) and pulls this prep. No version bump from this
 * branch — see CUSTOMER_CHAPTER_HANDOFF.md.
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
import {
  COLLECTION_ATTENTION_METRIC_IDS,
  COLLECTION_ATTENTION_PACK_ID,
  COLLECTION_ATTENTION_PREP_VERSION,
} from "@/lib/nova/packs/collection-attention-prep";

/** Chapter id — deepen only; pack remains `collection_attention`. */
export const CUSTOMER_CHAPTER_ID = "customer_master" as const;

export const CUSTOMER_CHAPTER_PREP_VERSION = "0.1.0-prep";

/**
 * Routing / example questions for the Customer chapter deepen.
 * Money / outstanding / overdue continue to route Collection Attention.
 * Master / headcount stay thin skill.
 */
export const CUSTOMER_CHAPTER_QUESTIONS = [
  "customer context for Avaada",
  "who is this customer — collection context",
  "customer master for Miura",
  "active customers summary",
  "customers",
  "collection attention for Avaada",
] as const;

/**
 * Catalog tools for the Customer chapter deepen.
 * Core Collection tools stay authoritative for money; `customers_summary` adds
 * master headcount / recent parties without inventing AR.
 */
export const CUSTOMER_CHAPTER_TOOLS = [
  "customers_summary",
  "customer_outstanding",
] as const;

/**
 * Full Collection fan-out after deepen (chapter notes — implementer merges).
 * Do not drop existing Collection tools when adding customer master.
 */
export const COLLECTION_WITH_CUSTOMER_CHAPTER_TOOLS = [
  "customers_summary",
  "customer_outstanding",
  "receivables_summary",
  "overdue_invoices",
  "receipts_summary",
  "reports_snapshot",
] as const;

/**
 * Metric ids owned / introduced by the Customer chapter.
 * Shared Collection metrics stay in COLLECTION_ATTENTION_METRIC_IDS.
 */
export const CUSTOMER_CHAPTER_METRIC_IDS = [
  /** Active customer headcount from customers_summary */
  "customers.active_count",
  /** Total customers in filter (incl inactive when skill returns) */
  "customers.total_count",
  /** Reuse Collection party outstanding — chapter witness only */
  "ar.customer_outstanding",
] as const;

export type CustomerChapterMetricId = (typeof CUSTOMER_CHAPTER_METRIC_IDS)[number];

/**
 * Combined metric list for Collection deepen smoke (Collection + customer master).
 * Implementer extends live Collection metrics; do not fork a new pack metric set.
 */
export const COLLECTION_WITH_CUSTOMER_METRIC_IDS = [
  ...COLLECTION_ATTENTION_METRIC_IDS,
  "customers.active_count",
  "customers.total_count",
] as const;

/**
 * RBAC — customer master is customer.read; money chapters keep Collection gates.
 */
export const CUSTOMER_CHAPTER_RBAC = {
  permissionsAnyOf: ["customer.read"] as const,
  chapterPermissions: {
    customers_summary: ["customer.read"] as const,
    customer_outstanding: ["invoice.read", "receipt.read"] as const,
  },
  dataClasses: ["ops_summary", "finance_money"] as const,
  sensitivity: "money" as const,
  notes: [
    "Missing customer.read → omit Customer master chapter (permission_omission); do not invent headcount.",
    "Customer master never invents outstanding ₹ — money facts stay on customer_outstanding / receivables / overdue.",
    "Do not ship a separate customer_attention pack — Collection Attention remains pack #3.",
    "Thin “customers” / “customer list” stays customers_summary skill; Collection owns money asks.",
    "Project-aware Collection still uses DialogState project slot — not a customer-master substitute.",
    "Save report permissionsUsed must include customers_summary when the chapter contributed facts.",
  ],
} as const;

/** Only ship shape: deepen Collection — never a new named pack. */
export const CUSTOMER_CHAPTER_SHIP_OPTIONS = ["collection_chapter"] as const;
export type CustomerChapterShipOption = (typeof CUSTOMER_CHAPTER_SHIP_OPTIONS)[number];

export type CustomerChapterFindingShapeId =
  | "party_resolve_gap"
  | "customer_master"
  | "customer_inactive"
  | "party_outstanding_bridge"
  | "no_material_attention";

export type CustomerChapterFindingShape = {
  id: CustomerChapterFindingShapeId;
  chapter: string;
  evidenceToolId: (typeof CUSTOMER_CHAPTER_TOOLS)[number];
  contributorRole: string;
  confidence: Exclude<NovaFindingConfidence, "prediction">;
  materialWhenPresent: boolean;
  observationPattern: string;
  recommendation?: { label: string; href: string };
};

/**
 * Finding shapes for the Customer chapter only.
 * Receivables / ageing / overdue / concentration / priorities stay in
 * COLLECTION_ATTENTION_FINDING_SHAPES — do not duplicate here.
 */
export const CUSTOMER_CHAPTER_FINDING_SHAPES: readonly CustomerChapterFindingShape[] = [
  {
    id: "party_resolve_gap",
    chapter: "Resolve",
    evidenceToolId: "customers_summary",
    contributorRole: "gap",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Customer chapter needs a resolved customer (or Collection party scope) — name it or confirm from clarify. I will not invent master or AR facts.",
    recommendation: { label: "Customers", href: "/customers" },
  },
  {
    id: "customer_master",
    chapter: "Customer",
    evidenceToolId: "customers_summary",
    contributorRole: "customer master",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "{name}: code {customerId}; active={active}; company {company}; billing state {state}.",
    recommendation: { label: "Customers", href: "/customers" },
  },
  {
    id: "customer_inactive",
    chapter: "Customer",
    evidenceToolId: "customers_summary",
    contributorRole: "inactive",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "{name} is inactive on customer master — confirm before collection chase.",
    recommendation: { label: "Customers", href: "/customers" },
  },
  {
    id: "party_outstanding_bridge",
    chapter: "Receivables",
    evidenceToolId: "customer_outstanding",
    contributorRole: "AR bridge",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "Party outstanding for {name}: {outstandingInr} — see Collection receivables / overdue chapters.",
    recommendation: { label: "Receivables", href: "/accounts/receivables" },
  },
  {
    id: "no_material_attention",
    chapter: "Quiet",
    evidenceToolId: "customers_summary",
    contributorRole: "quiet",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "No material customer-master attentions for this scope.",
    recommendation: { label: "Customers", href: "/customers" },
  },
] as const;

export const CUSTOMER_CHAPTER_PRIMARY_MAX = NOVA_MONTH_ATTENTION_PRIMARY_MAX;

export function selectCustomerChapterAttentions(
  materialFindings: NovaFinding[],
  maxPrimary = CUSTOMER_CHAPTER_PRIMARY_MAX
) {
  return selectNovaPackAttentions(materialFindings, maxPrimary);
}

export type CustomerChapterGolden = {
  id: string;
  query: string;
  expectRecipeId:
    | typeof COLLECTION_ATTENTION_PACK_ID
    | "month_performance"
    | "clarify"
    | "skill:customers_summary"
    | "skill:customer_outstanding";
  notes: string;
};

/**
 * Goldens list — Customer chapter deepen must not fork Collection.
 * Money asks → collection_attention; master list → thin skill.
 */
export const CUSTOMER_CHAPTER_GOLDENS: readonly CustomerChapterGolden[] = [
  {
    id: "cc-collection-signature",
    query: "collection attention for Avaada",
    expectRecipeId: "collection_attention",
    notes: "Collection remains pack #3; Customer chapter is an inner deepen only.",
  },
  {
    id: "cc-customer-context",
    query: "customer context for Avaada",
    expectRecipeId: "collection_attention",
    notes:
      "Party + master → Collection with Customer chapter (recipeMatchesQuery).",
  },
  {
    id: "cc-who-is-customer",
    query: "who is this customer — collection context",
    expectRecipeId: "collection_attention",
    notes:
      "Master + collection context → Collection Attention (not bare who-is).",
  },
  {
    id: "cc-customer-master",
    query: "customer master for Miura",
    expectRecipeId: "collection_attention",
    notes:
      "Named master inside collection deepen (recipeMatchesQuery).",
  },
  {
    id: "cc-active-summary",
    query: "active customers summary",
    expectRecipeId: "skill:customers_summary",
    notes: "Headcount / recent list stays thin skill — not Collection.",
  },
  {
    id: "cc-thin-customers",
    query: "customers",
    expectRecipeId: "skill:customers_summary",
    notes: "Bare customers → thin skill; never invent a customer_attention pack.",
  },
  {
    id: "cc-outstanding-thin",
    query: "Avaada outstanding",
    expectRecipeId: "skill:customer_outstanding",
    notes: "Single-tool outstanding may stay thin; Collection preferred for outstanding+overdue combo.",
  },
  {
    id: "cc-inside-month",
    query: "How is this month going?",
    expectRecipeId: "month_performance",
    notes: "Month stays #1; Collection (+ customer chapter) remains Month money chapter.",
  },
  {
    id: "cc-ambiguous",
    query: "customer context",
    expectRecipeId: "clarify",
    notes: "No party resolved — clarify; never invent master or AR.",
  },
  {
    id: "cc-no-risk-score",
    query: "collection risk score for Avaada",
    expectRecipeId: "collection_attention",
    notes:
      "Refuse payment risk scores; Customer chapter + Collection facts only (same gate as Collection goldens).",
  },
];

function draftCustomerMetricRefs(scopeLabel?: string): NovaPackMetricRef[] {
  return CUSTOMER_CHAPTER_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: null,
    display: undefined,
    periodLabel: scopeLabel ? `scope:${scopeLabel}` : "scope:unresolved",
  }));
}

export type BuildCustomerChapterNotesStubInput = {
  scopeLabel?: string;
  dataAsOf?: string;
  packVersion?: string;
  materialFindings?: NovaFinding[];
};

/**
 * Stub builder — returns a Collection Attention pack id with Customer chapter
 * narrative / metrics notes only. No skill fan-out, no invented AR or headcount.
 * Pack id stays `collection_attention` (never a new NovaPackId).
 */
export function buildCustomerChapterNotesStub(
  input: BuildCustomerChapterNotesStubInput = {}
): NovaPackResult {
  const label = input.scopeLabel?.trim() || "unresolved party";
  const dataAsOf = input.dataAsOf ?? new Date().toISOString();
  const attentions = input.materialFindings
    ? selectCustomerChapterAttentions(input.materialFindings)
    : emptyNovaPackAttentions();

  return buildNovaPackResult({
    packId: COLLECTION_ATTENTION_PACK_ID,
    packVersion: input.packVersion ?? `${COLLECTION_ATTENTION_PREP_VERSION}+${CUSTOMER_CHAPTER_PREP_VERSION}`,
    period: {
      label: input.scopeLabel ? `open balances · ${label}` : "open balances",
      grain: "open",
      calendarKind: "point_in_time",
      source: input.scopeLabel ? "explicit" : "default",
    },
    dataAsOf,
    metrics: draftCustomerMetricRefs(input.scopeLabel),
    facts: [],
    findings: input.materialFindings ?? [],
    attentions,
    charts: [],
    links: [],
    warnings: [
      {
        code: "completeness",
        message:
          "Customer chapter PREP stub — customers_summary not dispatched; merge into Collection Attention fan-out.",
      },
      {
        code: "freshness",
        message: "Stub dataAsOf is build time only until live customer master reads run.",
      },
    ],
    omittedNotes: [
      ...CUSTOMER_CHAPTER_TOOLS.map((t) => `Stub omitted ${t} (not dispatched).`),
      ...CUSTOMER_CHAPTER_RBAC.notes,
    ],
    narrativeHints: [
      `Customer chapter PREP notes for ${label}.`,
      "Ship option: collection_chapter only — do not create customer_attention pack.",
      "Chapter tools: customers_summary + bridge to customer_outstanding.",
      "Metrics: customers.active_count · customers.total_count · ar.customer_outstanding.",
      "Money chapters remain Collection Attention finding shapes (receivables / ageing / overdue / …).",
      `Attentions: ≤${CUSTOMER_CHAPTER_PRIMARY_MAX} primary across Collection + customer inactive; empty if nothing material.`,
      "Blocked from main until presentation polish is deployer health-matched.",
    ],
  });
}

/** Demo material findings for overflow-rule smoke (tests only). */
export function buildCustomerChapterDemoMaterialFindings(count: number): NovaFinding[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    buildNovaFinding({
      observation: `Demo inactive / master attention ${i + 1}.`,
      evidence: [{ toolId: "customers_summary", summary: `demo-${i + 1}` }],
      contributors: [{ toolId: "customers_summary", role: "inactive" }],
      confidence: "fact",
    })
  );
}
