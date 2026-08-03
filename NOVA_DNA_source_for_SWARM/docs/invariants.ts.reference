/**
 * NOVA 3.0 permanent invariants — enforced in code + architectural CI.
 * Product strategy: `NOVA_3_0_PLAN.md`. Runtime flow: `NOVA_FINAL_ARCHITECTURE.md`.
 */

/** Frozen forever — do not weaken in product code. */
export const NOVA_INVARIANTS = {
  /** Skills / catalog path never INSERT/UPDATE/DELETE operational ERP rows. */
  neverWriteOperationalErp: true,
  /** Registered catalog skills only — no free SQL, no LLM tool pick. */
  catalogSkillsOnly: true,
  /** SearchEngine rules-first; Think only when confidence is low. */
  rulesFirstGatedThink: true,
  /** Dual write preflight + post-plan guard, RBAC, clarify, answer guards. */
  dualGuardsRbacClarifyAnswer: true,
  /** NOVA may write only chat / dialog / findings / reports / chart datasets. */
  novaPlaneWritesOnly: true,
  /** Saved reports are immutable snapshots; regenerate = new report id. */
  reportsImmutableSnapshots: true,
  /** No dashboard builder, process mining, forecast product, CBG 4th pack, ERP writeback, sticky ₹ memory. */
  foreverForbidden: [
    "dashboard_builder",
    "process_mining",
    "forecast_product",
    "cbg_named_pack",
    "erp_writeback",
    "sticky_money_memory",
    "free_sql",
    "llm_tool_pick",
    "unrestricted_ledger_export",
  ] as const,
} as const;

/** Month Performance — up to 3 primary attentions; none if nothing material. */
export const NOVA_MONTH_ATTENTION_PRIMARY_MAX = 3;

/** Pack / report common schema version (NovaPackResult.schemaVersion). */
export const NOVA_PACK_RESULT_SCHEMA_VERSION = 1 as const;

/** Report security envelope schema version. */
export const NOVA_REPORT_ENVELOPE_SCHEMA_VERSION = 1 as const;

/** Env var for skill SELECT-only DB connection (Sprint 0 scaffold; cutover Sprint 4). */
export const NOVA_READONLY_DATABASE_URL_ENV = "NOVA_READONLY_DATABASE_URL";
