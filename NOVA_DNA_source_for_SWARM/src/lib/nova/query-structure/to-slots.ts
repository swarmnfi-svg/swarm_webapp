/**
 * Map shared structure → SearchEngine / Plan-shaped fields.
 */

import type { NovaEntityModuleParse } from "@/lib/nova/query-structure/parse-entity-module";
import type { NovaQueryDepth } from "@/lib/nova/query-structure/depth";
import { pickNovaQueryDepth } from "@/lib/nova/query-structure/depth";

export type NovaStructureSlotPatch = {
  entityHint: string;
  entityType: "project" | "customer" | "vendor" | null;
  metric: string | null;
  tools: string[];
  queryFamily: "status" | "money" | "docs" | "approvals" | "unknown";
  intent: string;
  suppressPersonHint: boolean;
  depth: NovaQueryDepth;
  entityKindHint: NovaEntityModuleParse["entityKindHint"];
  moduleHint: NovaEntityModuleParse["moduleHint"];
};

const MODULE_TO_TOOLS: Record<
  string,
  { tools: string[]; queryFamily: NovaStructureSlotPatch["queryFamily"]; intent: string }
> = {
  tasks: { tools: ["tasks_summary"], queryFamily: "status", intent: "tasks_for_entity" },
  invoices: { tools: ["sales_summary"], queryFamily: "money", intent: "invoices_for_entity" },
  receipts: { tools: ["receipts_summary"], queryFamily: "money", intent: "receipts_for_entity" },
  sales_orders: {
    tools: ["sales_orders_summary"],
    queryFamily: "money",
    intent: "sos_for_entity",
  },
  documents: {
    tools: ["documents_search"],
    queryFamily: "docs",
    intent: "documents_for_entity",
  },
  approvals: {
    tools: ["approvals_summary"],
    queryFamily: "approvals",
    intent: "approvals_for_entity",
  },
  delivery: {
    tools: ["delivery_summary"],
    queryFamily: "status",
    intent: "delivery_for_entity",
  },
  grn: { tools: ["grn_summary"], queryFamily: "status", intent: "grn_for_entity" },
  expenses: {
    tools: ["staff_expense_summary"],
    queryFamily: "money",
    intent: "expenses_for_entity",
  },
  projects: {
    tools: ["project_command"],
    queryFamily: "status",
    intent: "named_project_detail",
  },
};

/**
 * Convert a parsed structure into SearchEngine-compatible slot fields.
 * Returns null when there is no actionable module/tool mapping.
 */
export function structureToSlotPatch(
  parsed: NovaEntityModuleParse,
  query: string
): NovaStructureSlotPatch | null {
  const moduleHint = parsed.moduleHint;
  const mapping =
    (moduleHint && MODULE_TO_TOOLS[moduleHint]) ||
    (parsed.entityKindHint === "project" && !moduleHint
      ? MODULE_TO_TOOLS.projects
      : null);
  if (!mapping) return null;

  const entityType: NovaStructureSlotPatch["entityType"] =
    parsed.entityKindHint === "project" ||
    parsed.entityKindHint === "customer" ||
    parsed.entityKindHint === "vendor"
      ? parsed.entityKindHint
      : moduleHint === "tasks" || moduleHint === "projects"
        ? "project"
        : moduleHint === "invoices" || moduleHint === "receipts" || moduleHint === "sales_orders"
          ? "customer"
          : null;

  return {
    entityHint: parsed.entitySpan,
    entityType,
    metric: moduleHint,
    tools: mapping.tools,
    queryFamily: mapping.queryFamily,
    intent: mapping.intent,
    suppressPersonHint: true,
    depth: pickNovaQueryDepth(query),
    entityKindHint: parsed.entityKindHint,
    moduleHint: parsed.moduleHint,
  };
}
