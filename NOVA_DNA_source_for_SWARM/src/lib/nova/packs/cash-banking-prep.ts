/**
 * PREP — Cash / Banking pack (or Month cash chapter deepen) + NovaPackResult stub.
 * Freezes savable cash position shape: bank balances, receipts, recon, payment
 * requests — catalog skills only, no free SQL / balance theatre.
 *
 * Signature ask: “how is cash this week?” / “cash and banking this month”
 *
 * Treatment: may ship as named pack `cash_banking` **or** deepen Month’s existing
 * bank_accounts_summary chapter — same metrics + RBAC either way.
 *
 * DEPENDENCY GATE: do not merge to main until sole deployer confirms save-report
 * follow-up is live (health-matched) and pulls this prep. No version bump from
 * this branch — see CASH_BANKING_HANDOFF.md.
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

/** Pack id — must match NovaPackId + future recipe id `cash_banking`. */
export const CASH_BANKING_PACK_ID = "cash_banking" as const;

export const CASH_BANKING_PREP_VERSION = "0.1.0-prep";

/**
 * Signature + routing questions.
 * Canonical: “how is cash this week?”
 */
export const CASH_BANKING_QUESTIONS = [
  "how is cash this week?",
  "cash and banking this month",
  "bank balances",
  "total bank balance",
  "cash position",
  "unreconciled bank transactions",
  "receipts and bank this month",
  "how is banking going?",
] as const;

/**
 * Catalog chapters — finance skills already on tip.
 * Month Performance already fans out `bank_accounts_summary` + `receipts_summary`;
 * this pack/chapter deepens recon + payment-request attentions.
 */
export const CASH_BANKING_CHAPTER_TOOLS = [
  "bank_accounts_summary",
  "bank_recon_summary",
  "receipts_summary",
  "payment_requests_summary",
] as const;

/**
 * Metric ids for Cash / Banking.
 * Draft until steward-certifies. Shared with Month where noted.
 *
 * Families:
 * - bank position · book/statement · receipts · recon · payment requests
 */
export const CASH_BANKING_METRIC_IDS = [
  /** Bank position — active account count */
  "bank.accounts_count",
  /** Book balance — manualCurrentBalance sum when balancesVisible */
  "bank.book_balance",
  /** Statement balance — statementCurrentBalance sum when visible */
  "bank.statement_balance",
  /** Operational total — totalOperationalBankBalance when visible */
  "bank.operational_balance",
  /** Receipts — shared with Month / Collection */
  "receipts.period_collected",
  /** Recon — unreconciled / aging from bank_recon_summary */
  "bank_recon.summary",
  /** Payment requests awaiting action (dictionary: pr.awaiting_action) */
  "pr.awaiting_action",
  /** Draft synthesis label for narrative (never invent ₹ beyond skill facts) */
  "cash.period_position",
] as const;

export type CashBankingMetricId = (typeof CASH_BANKING_METRIC_IDS)[number];

/**
 * RBAC witness notes — critical: balances are permission-gated inside the skill.
 * Save report must record permissionsUsed; download ACL re-check must deny if
 * bank.read revoked; never freeze “hidden” balances as invented ₹0.
 */
export const CASH_BANKING_RBAC = {
  /** Gate to open pack / Month cash chapter */
  permissionsAnyOf: ["bank.read"] as const,
  /** Balance visibility (skill already hides last4 + totals without these) */
  balanceVisibilityAnyOf: ["bank.viewfullaccount"] as const,
  /** Also visible when canViewOrgFinanceAggregates(user) — role helper, not a permission id */
  balanceVisibilityViaOrgFinanceAggregates: true,
  /** Optional chapters */
  chapterPermissions: {
    bank_recon_summary: ["bank.read", "bank.reconcile"] as const,
    receipts_summary: ["receipt.read", "invoice.read"] as const,
    payment_requests_summary: ["paymentrequest.read", "paymentrequest.create"] as const,
  },
  dataClasses: ["finance_money"] as const,
  sensitivity: "money" as const,
  notes: [
    "Missing bank.read → omit entire cash chapter (permission_omission); do not invent balances.",
    "Without bank.viewfullaccount / canViewOrgFinanceAggregates → balancesVisible=false; narrate 'hidden', never ₹0 theatre.",
    "bank.reconcile required for recon chapter; omit with omittedNotes when missing.",
    "Vendor bank full account numbers stay on vendorbank / bank.viewfullaccount skills — out of scope here.",
    "bank.sms.read is a separate open-link skill — not part of this cash pack v1.",
    "Month Performance already includes bank_accounts_summary — named pack deepens or Month chapter reuses these metric ids.",
  ],
} as const;

/**
 * Ship shape choice (implementer / deployer):
 * - `named_pack` — recipe id cash_banking, savable like Month
 * - `month_chapter` — deepen Month Performance cash section only (no new Save surface)
 */
export const CASH_BANKING_SHIP_OPTIONS = ["named_pack", "month_chapter"] as const;
export type CashBankingShipOption = (typeof CASH_BANKING_SHIP_OPTIONS)[number];

export type CashBankingFindingShapeId =
  | "permission_gap"
  | "bank_position"
  | "balances_hidden"
  | "receipts_period"
  | "recon_material"
  | "payment_requests_material"
  | "no_material_attention";

export type CashBankingFindingShape = {
  id: CashBankingFindingShapeId;
  chapter: string;
  evidenceToolId: (typeof CASH_BANKING_CHAPTER_TOOLS)[number];
  contributorRole: string;
  confidence: Exclude<NovaFindingConfidence, "prediction">;
  materialWhenPresent: boolean;
  observationPattern: string;
  recommendation?: { label: string; href: string };
};

export const CASH_BANKING_FINDING_SHAPES: readonly CashBankingFindingShape[] = [
  {
    id: "permission_gap",
    chapter: "Resolve",
    evidenceToolId: "bank_accounts_summary",
    contributorRole: "gap",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern:
      "Cash / banking needs bank.read — I will not invent balances or recon counts.",
    recommendation: { label: "Bank accounts", href: "/bank-accounts" },
  },
  {
    id: "bank_position",
    chapter: "Position",
    evidenceToolId: "bank_accounts_summary",
    contributorRole: "bank position",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "{accountCount} active bank account(s). Book {bookInr}; statement {statementInr}; operational {operationalInr}.",
    recommendation: { label: "Bank accounts", href: "/bank-accounts" },
  },
  {
    id: "balances_hidden",
    chapter: "Visibility",
    evidenceToolId: "bank_accounts_summary",
    contributorRole: "visibility",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern:
      "{accountCount} active bank account(s); balances hidden (need bank.viewfullaccount / org finance).",
    recommendation: { label: "Bank accounts", href: "/bank-accounts" },
  },
  {
    id: "receipts_period",
    chapter: "Receipts",
    evidenceToolId: "receipts_summary",
    contributorRole: "receipts",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "Receipts {periodLabel}: {collectedInr}.",
    recommendation: { label: "Receipts", href: "/receipts" },
  },
  {
    id: "recon_material",
    chapter: "Recon",
    evidenceToolId: "bank_recon_summary",
    contributorRole: "recon",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "Unreconciled / recon attention: {reconLabel}.",
    recommendation: { label: "Bank recon", href: "/reconciliation" },
  },
  {
    id: "payment_requests_material",
    chapter: "Payments",
    evidenceToolId: "payment_requests_summary",
    contributorRole: "payment requests",
    confidence: "fact",
    materialWhenPresent: true,
    observationPattern: "Payment requests awaiting action: {pendingCount}.",
    recommendation: { label: "Payment requests", href: "/payment-requests" },
  },
  {
    id: "no_material_attention",
    chapter: "Quiet",
    evidenceToolId: "bank_accounts_summary",
    contributorRole: "quiet",
    confidence: "fact",
    materialWhenPresent: false,
    observationPattern: "No material cash / banking attentions for this period.",
    recommendation: { label: "Bank accounts", href: "/bank-accounts" },
  },
] as const;

export const CASH_BANKING_PRIMARY_MAX = NOVA_MONTH_ATTENTION_PRIMARY_MAX;

export function selectCashBankingAttentions(
  materialFindings: NovaFinding[],
  maxPrimary = CASH_BANKING_PRIMARY_MAX
) {
  return selectNovaPackAttentions(materialFindings, maxPrimary);
}

export type CashBankingGolden = {
  id: string;
  query: string;
  expectRecipeId:
    | typeof CASH_BANKING_PACK_ID
    | "month_performance"
    | "clarify"
    | "skill:bank_accounts_summary"
    | "skill:bank_recon_summary";
  notes: string;
};

export const CASH_BANKING_GOLDENS: readonly CashBankingGolden[] = [
  {
    id: "cb-signature",
    query: "how is cash this week?",
    expectRecipeId: "cash_banking",
    notes: "Signature cash ask — named pack (or Month cash chapter if ship=month_chapter).",
  },
  {
    id: "cb-cash-banking-month",
    query: "cash and banking this month",
    expectRecipeId: "cash_banking",
    notes: "Month-scoped cash + banking.",
  },
  {
    id: "cb-balances",
    query: "bank balances",
    expectRecipeId: "cash_banking",
    notes: "Balance ask — respect balancesVisible RBAC.",
  },
  {
    id: "cb-total-bank",
    query: "total bank balance",
    expectRecipeId: "cash_banking",
    notes: "Alias for operational/book total when visible.",
  },
  {
    id: "cb-position",
    query: "cash position",
    expectRecipeId: "cash_banking",
    notes: "Position narrative from bank + receipts facts only.",
  },
  {
    id: "cb-recon",
    query: "unreconciled bank transactions",
    expectRecipeId: "cash_banking",
    notes: "Recon chapter; may thin-route to bank_recon_summary until pack lands.",
  },
  {
    id: "cb-receipts-bank",
    query: "receipts and bank this month",
    expectRecipeId: "cash_banking",
    notes: "Receipts + bank combo → cash pack, not Collection.",
  },
  {
    id: "cb-director-month",
    query: "How is this month going?",
    expectRecipeId: "month_performance",
    notes: "Director Month stays #1; cash remains a chapter inside Month either way.",
  },
  {
    id: "cb-thin-accounts",
    query: "bank accounts",
    expectRecipeId: "skill:bank_accounts_summary",
    notes: "Thin skill remains for quick Q&A until pack routing preferred.",
  },
  {
    id: "cb-no-invent",
    query: "what is our exact cash on hand?",
    expectRecipeId: "cash_banking",
    notes: "Refuse invented ₹; use skill facts + hidden when no balance visibility.",
  },
];

function draftMetricRefs(periodLabel?: string): NovaPackMetricRef[] {
  return CASH_BANKING_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: null,
    display: undefined,
    periodLabel: periodLabel ?? "period:unresolved",
  }));
}

export type BuildCashBankingPackStubInput = {
  periodLabel?: string;
  dataAsOf?: string;
  packVersion?: string;
  materialFindings?: NovaFinding[];
  /** Document preferred ship shape in narrative hints */
  shipAs?: CashBankingShipOption;
};

/**
 * Stub builder — NovaPackResult-compatible Cash / Banking spine.
 * No skill fan-out, no invented balances.
 */
export function buildCashBankingPackStub(
  input: BuildCashBankingPackStubInput = {}
): NovaPackResult {
  const label = input.periodLabel?.trim() || "this period";
  const dataAsOf = input.dataAsOf ?? new Date().toISOString();
  const shipAs = input.shipAs ?? "named_pack";
  const attentions = input.materialFindings
    ? selectCashBankingAttentions(input.materialFindings)
    : emptyNovaPackAttentions();

  return buildNovaPackResult({
    packId: CASH_BANKING_PACK_ID,
    packVersion: input.packVersion ?? CASH_BANKING_PREP_VERSION,
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
          "bank.book_balance",
          "bank.operational_balance",
          "receipts.period_collected",
        ],
        title: "Cash position",
        points: [],
      },
      {
        bindingId: "ageing_or_attention",
        metricIds: ["bank_recon.summary", "pr.awaiting_action"],
        title: "Cash attention",
        points: [],
      },
    ],
    links: [],
    warnings: [
      {
        code: "completeness",
        message:
          "Cash / Banking PREP stub — chapters not executed; fill via bank/receipts/recon fan-out.",
      },
      {
        code: "freshness",
        message: "Stub dataAsOf is build time only until live bank reads run.",
      },
    ],
    omittedNotes: [
      ...CASH_BANKING_CHAPTER_TOOLS.map((t) => `Stub omitted ${t} (not dispatched).`),
      ...CASH_BANKING_RBAC.notes,
    ],
    narrativeHints: [
      `Cash / Banking PREP stub for ${label}.`,
      "Signature: how is cash this week?",
      "Metrics: bank position · book/statement/operational · receipts · recon · payment requests.",
      `Ship option: ${shipAs} (named_pack | month_chapter).`,
      `Attentions: ≤${CASH_BANKING_PRIMARY_MAX} primary; empty if nothing material.`,
      "RBAC: bank.read required; balances need bank.viewfullaccount / org finance aggregates.",
      "Savable via Save report / chat save-report follow-up when shipAs=named_pack.",
    ],
  });
}

/** Demo material findings for overflow-rule smoke (tests only). */
export function buildCashBankingDemoMaterialFindings(count: number): NovaFinding[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) =>
    buildNovaFinding({
      observation: `Demo cash attention ${i + 1} — recon / payment follow-up.`,
      evidence: [{ toolId: "bank_recon_summary", summary: `demo-${i + 1}` }],
      contributors: [{ toolId: "bank_recon_summary", role: "recon" }],
      confidence: "fact",
    })
  );
}
