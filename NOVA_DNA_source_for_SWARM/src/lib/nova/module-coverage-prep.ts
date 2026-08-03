/**
 * PREP only — cross-module entity + lexicon map for NOVA 3.
 * Branch: nova-3-module-coverage-prep
 *
 * Contract authority for MODULE_COVERAGE_HANDOFF.md until implementer lands
 * staff bind + topic-switch. Does not mutate lexicon / resolve / dialog-state.
 */

import type { NovaSkillDataClass, NovaSkillDomain } from "@/lib/nova/skills/skill-contract";
import type { NovaEntityTypeId } from "@/lib/nova/semantic/ontology";

/** Resolve path used today for named entities in that module. */
export type NovaModuleResolvePath =
  | "entity_hint" // resolveNovaEntityHint — customer|vendor|project
  | "person_hint" // resolveNovaPersonHint / ad-hoc staff fuzzy
  | "search_entities"
  | "none";

export type NovaModuleCoverageRow = {
  moduleId: string;
  label: string;
  domain: NovaSkillDomain | "meta";
  /** Ontology ids that matter for this module (may be aspirational). */
  entityTypes: NovaEntityTypeId[];
  resolvePath: NovaModuleResolvePath;
  /** Catalog toolIds from skills/registry.ts */
  toolIds: string[];
  /** Union of skill dataClasses for those tools */
  dataClasses: NovaSkillDataClass[];
  /** Lexicon topic ids (nova-lexicon) when present */
  lexiconTopicIds: string[];
  notes?: string;
};

/**
 * Module → entity types → tools → RBAC data class.
 * Keep toolIds aligned with registry; drift is intentional signal for CI later.
 */
export const NOVA_MODULE_COVERAGE_MATRIX: readonly NovaModuleCoverageRow[] = [
  {
    moduleId: "hr.attendance",
    label: "Attendance",
    domain: "hr",
    entityTypes: ["employee", "attendance_day"],
    resolvePath: "person_hint",
    toolIds: ["attendance_late_summary"],
    dataClasses: ["hr_attendance", "hr_pii"],
    lexiconTopicIds: ["attendance"],
    notes: "Named person via personHint; no DialogState employee bind.",
  },
  {
    moduleId: "hr.leave_queue",
    label: "Leave / OT / regularisation",
    domain: "hr",
    entityTypes: ["employee"],
    resolvePath: "person_hint",
    toolIds: ["leave_summary", "overtime_summary", "regularisation_summary"],
    dataClasses: ["hr_pii", "hr_attendance", "ops_summary"],
    lexiconTopicIds: ["leave", "overtime", "regularisation"],
  },
  {
    moduleId: "hr.payroll_money",
    label: "Salary / staff advances",
    domain: "hr",
    entityTypes: ["employee"],
    resolvePath: "person_hint",
    toolIds: ["salary_summary", "staff_advances_summary"],
    dataClasses: ["hr_pii", "finance_money"],
    lexiconTopicIds: ["salary", "staff_advances"],
    notes: "finance_money + hr_pii — sensitiveMoney entity resolve on party path.",
  },
  {
    moduleId: "hr.staff_master",
    label: "Staff directory / headcount",
    domain: "hr",
    entityTypes: ["employee"],
    resolvePath: "none",
    toolIds: ["staff_summary"],
    dataClasses: ["hr_pii", "ops_summary"],
    lexiconTopicIds: ["staff"],
    notes: "GAP G1: ignores personHint / no staff resolve bind.",
  },
  {
    moduleId: "finance.ar_sales",
    label: "Sales / receipts / AR",
    domain: "finance",
    entityTypes: ["customer", "project", "invoice"],
    resolvePath: "entity_hint",
    toolIds: [
      "sales_summary",
      "sales_orders_summary",
      "receipts_summary",
      "receivables_summary",
      "overdue_invoices",
      "customer_outstanding",
      "credit_notes_summary",
      "customers_summary",
      "collection_delay_estimate",
    ],
    dataClasses: ["finance_money", "ops_summary"],
    lexiconTopicIds: [
      "sales_invoices",
      "sales_orders",
      "receipts",
      "receivables",
      "credit_notes",
      "customers",
      "customer_outstanding",
      "collection_delay_estimate",
    ],
  },
  {
    moduleId: "finance.ap_purchase",
    label: "Purchase / AP / payments",
    domain: "finance",
    entityTypes: ["vendor", "project", "purchase_order", "purchase_request"],
    resolvePath: "entity_hint",
    toolIds: [
      "purchase_orders_summary",
      "purchase_requests_summary",
      "purchase_bills_summary",
      "payment_requests_summary",
      "vendors_summary",
    ],
    dataClasses: ["finance_money", "ops_summary"],
    lexiconTopicIds: [
      "purchase_orders",
      "purchase_requests",
      "payables",
      "payment_requests",
      "vendors",
    ],
    notes: "PO/PR ontology types exist; no first-class SearchEngine entityType yet.",
  },
  {
    moduleId: "finance.bank_ledger",
    label: "Bank / ledger / GST / Tally",
    domain: "finance",
    entityTypes: ["tally_connection"],
    resolvePath: "none",
    toolIds: [
      "bank_accounts_summary",
      "bank_recon_summary",
      "accounts_snapshot",
      "gstr_snapshot",
      "gst_docs_summary",
      "tally_status",
      "order_book_summary",
      "profitability_summary",
      "reports_snapshot",
      "director_dashboard_summary",
    ],
    dataClasses: ["finance_money", "ops_summary", "system_admin"],
    lexiconTopicIds: [
      "bank_accounts",
      "bank_recon",
      "accounts_ledger",
      "gst_docs",
      "tally",
      "order_book",
      "profitability",
      "reports",
      "finance_dashboard",
    ],
  },
  {
    moduleId: "ops.projects_tasks",
    label: "Projects / tasks / delivery",
    domain: "ops",
    entityTypes: ["project", "customer", "employee"],
    resolvePath: "entity_hint",
    toolIds: ["projects_summary", "tasks_summary", "my_work_summary", "delivery_summary"],
    dataClasses: ["ops_summary", "hr_pii"],
    lexiconTopicIds: ["projects", "tasks", "my_work", "delivery"],
    notes: "Assignee filtering uses personHint inside tasks_summary.",
  },
  {
    moduleId: "ops.stock_grn",
    label: "Stock / GRN",
    domain: "ops",
    entityTypes: ["purchase_order", "vendor"],
    resolvePath: "none",
    toolIds: ["stock_summary", "grn_summary"],
    dataClasses: ["ops_summary"],
    lexiconTopicIds: ["stock", "grn"],
  },
  {
    moduleId: "ops.kpi_incentives",
    label: "KPI / incentives",
    domain: "ops",
    entityTypes: ["employee"],
    resolvePath: "person_hint",
    toolIds: ["kpi_summary", "kpi_report", "incentives_summary"],
    dataClasses: ["ops_summary", "hr_pii", "finance_money"],
    lexiconTopicIds: ["kpi", "kpi_report", "incentives"],
  },
  {
    moduleId: "ops.approvals",
    label: "Approvals / pending workflow",
    domain: "ops",
    entityTypes: [],
    resolvePath: "none",
    toolIds: ["approvals_summary", "pending_workflow_counts"],
    dataClasses: ["ops_summary", "finance_money"],
    lexiconTopicIds: ["approvals", "pending_workflow"],
  },
  {
    moduleId: "ops.packs",
    label: "Briefs / packs / recipes",
    domain: "ops",
    entityTypes: ["project", "customer"],
    resolvePath: "entity_hint",
    toolIds: [
      "daily_brief",
      "proactive_insights",
      "month_performance",
      "project_command",
      "collection_attention",
      "project_health",
      "cbg_pipeline",
    ],
    dataClasses: ["ops_summary", "finance_money", "hr_attendance", "hr_pii"],
    lexiconTopicIds: [
      "daily_brief",
      "proactive_insights",
      "month_performance",
      "project_command",
      "collection_attention",
      "cbg_quotations",
    ],
  },
  {
    moduleId: "system.docs_admin",
    label: "Documents / system open tools",
    domain: "system",
    entityTypes: [],
    resolvePath: "search_entities",
    toolIds: [
      "documents_open",
      "documents_search",
      "search_entities",
      "settings_open",
      "appearance_open",
      "notifications_open",
      "whatsapp_open",
      "portal_open",
      "automation_open",
      "links_open",
      "bank_sms_open",
      "backup_open",
      "system_tools_open",
      "audit_log_open",
      "vendor_bank_open",
    ],
    dataClasses: ["documents", "public_meta", "system_admin", "finance_money", "ops_summary"],
    lexiconTopicIds: [
      "documents",
      "documents_search",
      "settings",
      "appearance",
      "notifications",
      "whatsapp",
      "portal",
      "automation",
      "links",
      "bank_sms",
      "system_backup",
      "system_tools",
      "audit_log",
      "vendor_bank",
    ],
  },
];

export type NovaCoverageGapId = "G1_staff_resolve_missing" | "G2_sticky_money_on_staff_x" | "G3_doc_entity_secondary";

export type NovaCoverageGap = {
  id: NovaCoverageGapId;
  priority: "P0" | "P1";
  title: string;
  summary: string;
  surfaces: string[];
  /** Suggested implementer touchpoints (paths relative to repo root). */
  touchpoints: string[];
};

export const NOVA_MODULE_COVERAGE_GAPS: readonly NovaCoverageGap[] = [
  {
    id: "G1_staff_resolve_missing",
    priority: "P0",
    title: "Staff resolve missing",
    summary:
      "resolveNovaEntityHint / DialogState bind exclude employee; staff_summary ignores personHint; person path is parallel and non-bindable.",
    surfaces: [
      "resolveNovaEntityHint preferTypes",
      "NovaDialogBound.entityType",
      "isNovaBindableEntityType",
      "staff_summary handler",
      "employee alias filter in entity resolve",
    ],
    touchpoints: [
      "src/lib/ai/nova-tools.ts",
      "src/lib/nova/dialog-state.ts",
      "src/lib/nova/skills/skill-contract.ts",
      "src/lib/nova/skills/hr/staff.ts",
      "src/lib/nova/semantic/aliases.ts",
    ],
  },
  {
    id: "G2_sticky_money_on_staff_x",
    priority: "P0",
    title: "Sticky money on “staff X”",
    summary:
      "detectNovaSlotFamily has no staff family; short staff pivots after money turns do not clear receipts/sales slots.",
    surfaces: [
      "detectNovaSlotFamily",
      "applyNovaTopicSwitchToDialogState",
      "follow-up / bare entity after money",
      "staff lexicon synonyms",
    ],
    touchpoints: [
      "src/lib/nova/dialog-state.ts",
      "src/lib/ai/nova-lexicon.ts",
      "src/lib/ai/nova-inference.ts",
      "src/lib/nova/nova-search-engine.ts",
    ],
  },
  {
    id: "G3_doc_entity_secondary",
    priority: "P1",
    title: "Secondary entity holes (PO/GRN/invoice)",
    summary:
      "Ontology lists invoice/PO/PR; SearchEngine + DialogState cannot bind them as first-class entities.",
    surfaces: ["NovaSearchEntityType", "ontology Gate A", "skill-internal code lookup"],
    touchpoints: [
      "src/lib/nova/nova-search-engine.ts",
      "src/lib/nova/semantic/ontology.ts",
    ],
  },
];

/** Proposed slot families beyond tip `NovaSlotFamily` (★ = new). */
export type NovaProposedSlotFamily =
  | "money"
  | "attendance"
  | "leave"
  | "staff"
  | "tasks"
  | "approvals"
  | "projects"
  | "procurement"
  | "stock"
  | "other";

export type NovaTopicSwitchKeywordRow = {
  family: NovaProposedSlotFamily;
  /** Tip status: live = already in detectNovaSlotFamily; proposed = add for G2 */
  status: "live" | "proposed";
  keywords: string[];
  clearsMoneySlots: boolean;
};

export const NOVA_TOPIC_SWITCH_KEYWORDS: readonly NovaTopicSwitchKeywordRow[] = [
  {
    family: "money",
    status: "live",
    keywords: [
      "sales",
      "revenue",
      "receipts",
      "collections",
      "invoices",
      "billing",
      "turnover",
      "outstanding",
      "receivables",
      "payables",
    ],
    clearsMoneySlots: false,
  },
  {
    family: "attendance",
    status: "live",
    keywords: [
      "attendance",
      "late comers",
      "punched",
      "absent",
      "present",
      "who was late",
      "who came late",
    ],
    clearsMoneySlots: true,
  },
  {
    family: "leave",
    status: "live",
    keywords: ["leave", "leave balance", "payroll", "salary", "advances", "incentives"],
    clearsMoneySlots: true,
  },
  {
    family: "staff",
    status: "proposed",
    keywords: [
      "staff",
      "employee",
      "employees",
      "headcount",
      "workforce",
      "staff directory",
      "who is",
      "staff code",
      "EMP-",
    ],
    clearsMoneySlots: true,
  },
  {
    family: "tasks",
    status: "live",
    keywords: ["tasks", "todos", "my work"],
    clearsMoneySlots: true,
  },
  {
    family: "approvals",
    status: "live",
    keywords: ["approvals", "pending approval"],
    clearsMoneySlots: true,
  },
  {
    family: "projects",
    status: "live",
    keywords: ["project", "projects"],
    clearsMoneySlots: true,
  },
  {
    family: "procurement",
    status: "proposed",
    keywords: [
      "purchase order",
      "open po",
      "po ",
      "purchase request",
      "indent",
      "grn",
      "mrn",
      "goods receipt",
      "material inward",
    ],
    clearsMoneySlots: true,
  },
  {
    family: "stock",
    status: "proposed",
    keywords: ["stock", "inventory", "sku", "warehouse", "reorder", "low stock"],
    clearsMoneySlots: true,
  },
];

export type NovaLexiconProposal = {
  topicId: string;
  addSynonyms: string[];
  /** Example utterances that should route / topic-switch */
  exampleUtterances: string[];
  dependsOnGap?: NovaCoverageGapId;
};

/** Proposed lexicon expansions — do not auto-merge into nova-lexicon.ts. */
export const NOVA_MODULE_LEXICON_PROPOSALS: readonly NovaLexiconProposal[] = [
  {
    topicId: "staff",
    addSynonyms: [
      "staff directory",
      "who is",
      "staff code",
      "employee profile",
      "workforce",
    ],
    exampleUtterances: ["staff Zeeshan", "who is Zeeshan", "employee EMP-012", "staff list"],
    dependsOnGap: "G1_staff_resolve_missing",
  },
  {
    topicId: "attendance",
    addSynonyms: ["did punch", "punch status", "present today"],
    exampleUtterances: ["did Zeeshan punch today", "Zeeshan present?"],
  },
  {
    topicId: "leave",
    addSynonyms: ["CL balance", "SL balance", "EL balance"],
    exampleUtterances: ["Zeeshan leave balance", "my leave balance"],
  },
  {
    topicId: "purchase_orders",
    addSynonyms: ["PO number", "pending PO", "open purchase order"],
    exampleUtterances: ["open POs", "PO for Acme", "pending purchase orders"],
  },
  {
    topicId: "grn",
    addSynonyms: ["goods inward", "material receipt note", "MRN today"],
    exampleUtterances: ["GRN today", "goods inward this week"],
  },
  {
    topicId: "stock",
    addSynonyms: ["SKU", "reorder level", "out of stock"],
    exampleUtterances: ["low stock", "SKU shortage"],
  },
  {
    topicId: "tasks",
    addSynonyms: ["assignee tasks", "todos for"],
    exampleUtterances: ["tasks for Zeeshan", "Zeeshan's todos"],
  },
  {
    topicId: "salary",
    addSynonyms: ["net pay", "payslip for"],
    exampleUtterances: ["my payslip", "salary this month"],
    dependsOnGap: "G1_staff_resolve_missing",
  },
];

export type NovaModuleCoverageGolden = {
  id: string;
  gapId: NovaCoverageGapId;
  turns: string[];
  /** Tools that must NOT appear on the final turn */
  forbidTools: string[];
  /** Soft expect — implementer wires into CI */
  preferTools?: string[];
  expectTopicSwitch?: boolean;
};

export const NOVA_MODULE_COVERAGE_GOLDENS: readonly NovaModuleCoverageGolden[] = [
  {
    id: "money_then_staff_name",
    gapId: "G2_sticky_money_on_staff_x",
    turns: ["today receipts", "staff Zeeshan"],
    forbidTools: ["receipts_summary", "sales_summary"],
    preferTools: ["staff_summary", "search_entities"],
    expectTopicSwitch: true,
  },
  {
    id: "money_then_who_is",
    gapId: "G2_sticky_money_on_staff_x",
    turns: ["today receipts", "who is Zeeshan"],
    forbidTools: ["receipts_summary"],
    expectTopicSwitch: true,
  },
  {
    id: "money_then_leave_named",
    gapId: "G2_sticky_money_on_staff_x",
    turns: ["today receipts", "Zeeshan leave balance"],
    forbidTools: ["receipts_summary"],
    preferTools: ["leave_summary"],
    expectTopicSwitch: true,
  },
  {
    id: "staff_named_not_org_only",
    gapId: "G1_staff_resolve_missing",
    turns: ["staff Zeeshan"],
    forbidTools: [],
    preferTools: ["staff_summary"],
    expectTopicSwitch: false,
  },
];

/** Stub snapshot for docs / future pack wiring — no skill dispatch. */
export function buildModuleCoveragePrepStub(): {
  kind: "module_coverage_prep";
  matrixRows: number;
  gaps: NovaCoverageGapId[];
  proposedFamilies: NovaProposedSlotFamily[];
  goldens: number;
} {
  return {
    kind: "module_coverage_prep",
    matrixRows: NOVA_MODULE_COVERAGE_MATRIX.length,
    gaps: NOVA_MODULE_COVERAGE_GAPS.map((g) => g.id),
    proposedFamilies: NOVA_TOPIC_SWITCH_KEYWORDS.filter((r) => r.status === "proposed").map(
      (r) => r.family
    ),
    goldens: NOVA_MODULE_COVERAGE_GOLDENS.length,
  };
}
