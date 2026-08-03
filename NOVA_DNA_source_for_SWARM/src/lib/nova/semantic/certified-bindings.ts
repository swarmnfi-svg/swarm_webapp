/**
 * Sprint 4 — certified metric bindings (full Trust-layer contract).
 *
 * Plan: NOVA_3_0_PLAN.md §6 contract fields · Phase 4 · Ship #8.
 * PREP branch: nova-3-sprint4-prep — merge only after Sprint 3 report plane is live.
 *
 * Every pack-critical metric carries the full audit contract:
 * definition · calculation · source · unit · aggregation · periodRule ·
 * gstTreatment · emptyMeaning · access · certification · owner · version · lastValidated
 */

import {
  NOVA_METRICS,
  getNovaMetric,
  type NovaMetricDefinition,
  type NovaMetricPeriodRule,
  type NovaMetricUnit,
} from "@/lib/nova/semantic/metrics";

export type NovaMetricCertification = "certified" | "draft" | "deprecated";

export type NovaMetricAggregation = "sum" | "count" | "avg" | "latest";

export type NovaMetricGstTreatment = "inclusive" | "exclusive" | "n/a";

/**
 * Full steward contract — extends the lean dictionary row with Phase 4 fields.
 * `label` remains the short UI name; `definition` is the audit meaning.
 * `source` is the skill/ledger source string (mirrors / deepens sourceOfTruth).
 */
export type NovaCertifiedMetricBinding = {
  id: string;
  version: string;
  certification: NovaMetricCertification;
  /** Short label (dictionary / UI) */
  label: string;
  /** Human-readable meaning for audit / badges */
  definition: string;
  /** Deterministic formula / skill mapping */
  calculation: string;
  /** Skill id(s) / ledger objects — never "LLM" */
  source: string;
  unit: NovaMetricUnit;
  aggregation: NovaMetricAggregation;
  periodRule: NovaMetricPeriodRule;
  gstTreatment: NovaMetricGstTreatment;
  emptyMeaning: string;
  /** can(...) / role prerequisites */
  access: string;
  owner: string;
  /** ISO date when binding was last checked against skill output */
  lastValidated: string;
  /** Dictionary / pack wiring */
  deterministicRequired: boolean;
  rbacClass: NovaMetricDefinition["rbacClass"];
  sourceToolIds: string[];
  currencyMode?: NovaMetricDefinition["currencyMode"];
};

export type NovaPackMetricSet =
  | "month_performance"
  | "project_command"
  | "collection_attention";

const MONTH_PACK_METRIC_IDS = [
  "sales.period_total",
  "receipts.period_collected",
  "ar.overdue_invoice_count",
  "ar.receivables_open",
  "ar.customer_outstanding",
  "projects.active_count",
  "cbg.quotation_count",
  "order_book.position",
] as const;

/** Aligns with Sprint 5 PROJECT_COMMAND_METRIC_IDS (draft until steward pass). */
const PROJECT_PACK_METRIC_IDS = [
  "projects.active_count",
  "tasks.open",
  "sales_orders.count",
  "purchase_orders.count",
  "delivery.summary",
  "sales.period_total",
  "receipts.period_collected",
  "ar.overdue_invoice_count",
] as const;

/** Collection named pack + Month chapter core AR set. */
const COLLECTION_PACK_METRIC_IDS = [
  "ar.customer_outstanding",
  "ar.overdue_invoice_count",
  "ar.receivables_open",
  "receipts.period_collected",
] as const;

export const SPRINT4_MONTH_METRIC_IDS = MONTH_PACK_METRIC_IDS;
export const SPRINT4_PROJECT_METRIC_IDS = PROJECT_PACK_METRIC_IDS;
export const SPRINT4_COLLECTION_METRIC_IDS = COLLECTION_PACK_METRIC_IDS;

type BindingExtras = {
  definition: string;
  calculation: string;
  aggregation: NovaMetricAggregation;
  gstTreatment: NovaMetricGstTreatment;
  access: string;
  owner: string;
  lastValidated: string;
  version?: string;
  certification?: NovaMetricCertification;
  /** Override source when deeper than dictionary sourceOfTruth */
  source?: string;
};

function binding(metricId: string, extras: BindingExtras): NovaCertifiedMetricBinding {
  const base = getNovaMetric(metricId);
  if (!base) {
    throw new Error(`Unknown metric for certification: ${metricId}`);
  }
  if (/llm/i.test(extras.source ?? base.sourceOfTruth)) {
    throw new Error(`Metric ${metricId} source must never be LLM`);
  }
  return {
    id: base.id,
    label: base.label,
    unit: base.unit,
    periodRule: base.periodRule,
    emptyMeaning: base.emptyMeaning,
    deterministicRequired: base.deterministicRequired,
    rbacClass: base.rbacClass,
    sourceToolIds: [...base.sourceToolIds],
    currencyMode: base.currencyMode,
    version: extras.version ?? "1",
    certification: extras.certification ?? "draft",
    definition: extras.definition,
    calculation: extras.calculation,
    source: extras.source ?? base.sourceOfTruth,
    aggregation: extras.aggregation,
    gstTreatment: extras.gstTreatment,
    access: extras.access,
    owner: extras.owner,
    lastValidated: extras.lastValidated,
  };
}

const VALIDATED = "2026-07-13";

/** Steward-approved bindings for Month Performance (+ shared Collection chapter). */
export const NOVA_CERTIFIED_MONTH_BINDINGS: readonly NovaCertifiedMetricBinding[] = [
  binding("sales.period_total", {
    certification: "certified",
    definition:
      "Posted sales invoice grand totals for the resolved calendar period (month or FY grain from DialogState).",
    calculation: "SUM(SalesInvoice.grandTotal) for posted invoices in period",
    aggregation: "sum",
    gstTreatment: "inclusive",
    access: "invoice.read + org finance aggregates",
    owner: "finance",
    lastValidated: VALIDATED,
  }),
  binding("receipts.period_collected", {
    certification: "certified",
    definition: "Cash collected via posted sales receipts in the resolved period.",
    calculation: "SUM(SalesReceipt.amount) in period",
    aggregation: "sum",
    gstTreatment: "n/a",
    access: "receipt.read + org finance aggregates",
    owner: "finance",
    lastValidated: VALIDATED,
  }),
  binding("ar.overdue_invoice_count", {
    certification: "certified",
    definition: "Count of open sales invoices past due date (point-in-time).",
    calculation: "COUNT(SalesInvoice) where dueDate < today and balance > 0",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
  }),
  binding("ar.receivables_open", {
    certification: "certified",
    definition: "Open receivable balance across customers (point-in-time).",
    calculation: "SUM open receivable balances",
    aggregation: "sum",
    gstTreatment: "inclusive",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
  }),
  binding("ar.customer_outstanding", {
    certification: "certified",
    definition: "Open receivable for a resolved customer (or filtered set).",
    calculation: "getReceivables for resolved customer",
    aggregation: "sum",
    gstTreatment: "inclusive",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
  }),
  binding("projects.active_count", {
    certification: "certified",
    definition: "Count of projects considered active in FY / filter scope.",
    calculation: "COUNT active projects in scope",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "project.read",
    owner: "ops",
    lastValidated: VALIDATED,
  }),
  binding("cbg.quotation_count", {
    certification: "certified",
    definition: "CBG quotations created or active in the resolved period (Month pack section).",
    calculation: "COUNT CBG quotations in period",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "cbgquotation.read",
    owner: "ops",
    lastValidated: VALIDATED,
  }),
  binding("order_book.position", {
    certification: "certified",
    definition: "Order-book / backlog position for the financial year (latest snapshot from skill).",
    calculation: "Order book FY position from order_book_summary",
    aggregation: "latest",
    gstTreatment: "n/a",
    access: "project.read | salesorder.read | director.dashboard",
    owner: "finance",
    lastValidated: VALIDATED,
  }),
];

/**
 * Draft registry — Project Command core metrics.
 * Certification stays `draft` until steward validates against project-scoped skill output.
 */
export const NOVA_DRAFT_PROJECT_BINDINGS: readonly NovaCertifiedMetricBinding[] = [
  binding("projects.active_count", {
    definition: "Resolved project presence / active count in Project Command scope.",
    calculation: "projects_summary scoped to resolved project (count or spine fact)",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "project.read",
    owner: "ops",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("tasks.open", {
    definition: "Open tasks on the resolved project.",
    calculation: "COUNT open tasks where projectId = resolved",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "task.read",
    owner: "ops",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("sales_orders.count", {
    definition: "Sales orders linked to the resolved project in period / open scope.",
    calculation: "COUNT sales orders for project filter",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "salesorder.read",
    owner: "ops",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("purchase_orders.count", {
    definition: "Purchase orders linked to the resolved project.",
    calculation: "COUNT purchase orders for project filter",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "purchaseorder.read",
    owner: "ops",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("delivery.summary", {
    definition: "Deliveries against the resolved project (count / status from skill).",
    calculation: "delivery_summary for project filter",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "delivery.read",
    owner: "ops",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("sales.period_total", {
    definition: "Invoiced sales for the project (period or project lifetime per skill filter).",
    calculation: "SUM posted SalesInvoice.grandTotal for project",
    aggregation: "sum",
    gstTreatment: "inclusive",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("receipts.period_collected", {
    definition: "Receipts collected against the project / related invoices.",
    calculation: "SUM SalesReceipt.amount for project filter",
    aggregation: "sum",
    gstTreatment: "n/a",
    access: "receipt.read",
    owner: "finance",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("ar.overdue_invoice_count", {
    definition: "Overdue open invoices for the resolved project.",
    calculation: "COUNT overdue invoices where project matches",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
];

/**
 * Draft registry — Collection Attention core metrics.
 * Shared with Month chapter; named pack deepens project-aware filters later.
 */
export const NOVA_DRAFT_COLLECTION_BINDINGS: readonly NovaCertifiedMetricBinding[] = [
  binding("ar.customer_outstanding", {
    definition: "Customer outstanding balance (point-in-time) for Collection Attention.",
    calculation: "getReceivables for resolved customer / filter",
    aggregation: "sum",
    gstTreatment: "inclusive",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("ar.overdue_invoice_count", {
    definition: "Overdue invoice count driving collection attention.",
    calculation: "COUNT overdue open SalesInvoice",
    aggregation: "count",
    gstTreatment: "n/a",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("ar.receivables_open", {
    definition: "Open AR book for collection prioritization.",
    calculation: "SUM open receivable balances",
    aggregation: "sum",
    gstTreatment: "inclusive",
    access: "invoice.read",
    owner: "finance",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
  binding("receipts.period_collected", {
    definition: "Recent collections in period (context for attention).",
    calculation: "SUM(SalesReceipt.amount) in period",
    aggregation: "sum",
    gstTreatment: "n/a",
    access: "receipt.read",
    owner: "finance",
    lastValidated: VALIDATED,
    certification: "draft",
  }),
];

/** Union registry for CI + handoff (Month certified + Project/Collection draft). */
export const NOVA_SPRINT4_METRIC_REGISTRY: readonly NovaCertifiedMetricBinding[] = [
  ...NOVA_CERTIFIED_MONTH_BINDINGS,
  ...NOVA_DRAFT_PROJECT_BINDINGS,
  ...NOVA_DRAFT_COLLECTION_BINDINGS,
];

const FULL_CONTRACT_KEYS = [
  "id",
  "version",
  "certification",
  "label",
  "definition",
  "calculation",
  "source",
  "unit",
  "aggregation",
  "periodRule",
  "gstTreatment",
  "emptyMeaning",
  "access",
  "owner",
  "lastValidated",
] as const;

export function assertFullMetricContract(b: NovaCertifiedMetricBinding): string[] {
  const errors: string[] = [];
  for (const key of FULL_CONTRACT_KEYS) {
    const v = b[key];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
      errors.push(`${b.id}: missing ${key}`);
    }
  }
  if (/llm/i.test(b.source)) errors.push(`${b.id}: source must never be LLM`);
  if (!b.sourceToolIds?.length) errors.push(`${b.id}: sourceToolIds required`);
  if (typeof b.deterministicRequired !== "boolean") {
    errors.push(`${b.id}: deterministicRequired required`);
  }
  return errors;
}

export function listCertifiedMonthBindings(): readonly NovaCertifiedMetricBinding[] {
  return NOVA_CERTIFIED_MONTH_BINDINGS;
}

export function listDraftProjectBindings(): readonly NovaCertifiedMetricBinding[] {
  return NOVA_DRAFT_PROJECT_BINDINGS;
}

export function listDraftCollectionBindings(): readonly NovaCertifiedMetricBinding[] {
  return NOVA_DRAFT_COLLECTION_BINDINGS;
}

export function listSprint4MetricRegistry(): readonly NovaCertifiedMetricBinding[] {
  return NOVA_SPRINT4_METRIC_REGISTRY;
}

export function packMetricIds(pack: NovaPackMetricSet): readonly string[] {
  switch (pack) {
    case "month_performance":
      return MONTH_PACK_METRIC_IDS;
    case "project_command":
      return PROJECT_PACK_METRIC_IDS;
    case "collection_attention":
      return COLLECTION_PACK_METRIC_IDS;
  }
}

/** CI: dictionary presence + full contract fields + pack id coverage. */
export function assertCertifiedBindingsAgainstDictionary(): string[] {
  const errors: string[] = [];
  const dictIds = new Set(NOVA_METRICS.map((m) => m.id));

  for (const id of MONTH_PACK_METRIC_IDS) {
    if (!dictIds.has(id)) errors.push(`Missing dictionary metric (month): ${id}`);
  }
  for (const id of PROJECT_PACK_METRIC_IDS) {
    if (!dictIds.has(id)) errors.push(`Missing dictionary metric (project): ${id}`);
  }
  for (const id of COLLECTION_PACK_METRIC_IDS) {
    if (!dictIds.has(id)) errors.push(`Missing dictionary metric (collection): ${id}`);
  }

  const monthIds = new Set(NOVA_CERTIFIED_MONTH_BINDINGS.map((b) => b.id));
  for (const id of MONTH_PACK_METRIC_IDS) {
    if (!monthIds.has(id)) errors.push(`Month registry missing binding: ${id}`);
  }

  const projectIds = new Set(NOVA_DRAFT_PROJECT_BINDINGS.map((b) => b.id));
  for (const id of PROJECT_PACK_METRIC_IDS) {
    if (!projectIds.has(id)) errors.push(`Project draft registry missing binding: ${id}`);
  }

  const collectionIds = new Set(NOVA_DRAFT_COLLECTION_BINDINGS.map((b) => b.id));
  for (const id of COLLECTION_PACK_METRIC_IDS) {
    if (!collectionIds.has(id)) errors.push(`Collection draft registry missing binding: ${id}`);
  }

  for (const b of NOVA_SPRINT4_METRIC_REGISTRY) {
    errors.push(...assertFullMetricContract(b));
    if (b.certification === "certified" && !b.version) {
      errors.push(`Certified binding ${b.id} missing version`);
    }
  }

  for (const b of NOVA_CERTIFIED_MONTH_BINDINGS) {
    if (b.certification !== "certified") {
      errors.push(`Month binding ${b.id} expected certification=certified`);
    }
  }
  for (const b of [...NOVA_DRAFT_PROJECT_BINDINGS, ...NOVA_DRAFT_COLLECTION_BINDINGS]) {
    if (b.certification !== "draft") {
      errors.push(`Draft pack binding ${b.id} expected certification=draft`);
    }
  }

  return errors;
}

/**
 * Runtime cutover helper — skills already use novaReadonlyPrisma.
 * Returns true when dedicated NOVA_READONLY_DATABASE_URL is configured.
 */
export function novaReadonlyCutoverReady(): boolean {
  return Boolean(process.env.NOVA_READONLY_DATABASE_URL?.trim());
}
