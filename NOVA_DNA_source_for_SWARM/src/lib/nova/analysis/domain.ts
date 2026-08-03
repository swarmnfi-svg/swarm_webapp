/**
 * Infer Analysis domain from user phrasing (rules-first; no LLM).
 * Prefers shared query-structure module/kind hints when provided.
 */
import type { NovaAnalysisDomain } from "@/lib/nova/analysis/factor-schema";
import {
  parseEntityModuleAsk,
  type NovaEntityModuleParse,
} from "@/lib/nova/query-structure/parse-entity-module";
import { isNonAttendanceLateContext } from "@/lib/nova/query-structure/late-context";

export type NovaAnalysisDomainHit = {
  domain: NovaAnalysisDomain;
  confidence: "high" | "medium";
};

export { isNonAttendanceLateContext } from "@/lib/nova/query-structure/late-context";

/**
 * True when the query should route to nova_analysis.
 * Leaves bare “kpi list / my kpi” alone; “kpi report card / breakdown” stay on kpi_report.
 */
export function isNovaAnalysisCue(query: string): boolean {
  const q = query.trim();
  if (!q) return false;

  // Structured report-card dump — sibling skill, not Analysis
  if (/\b(kpi\s+report(?:\s+card)?|report\s*card\s+kpi|kpi\s+breakdown)\b/i.test(q)) {
    return false;
  }

  // KPI why / explain / analyse / named summary (not bare “kpi list”)
  if (
    /\bwhy\s+(?:is\s+)?(?:(?:my|the)\s+)?(?:\S+\s+)?kpi\b/i.test(q) ||
    /\bwhy\s+kpi\b/i.test(q) ||
    /\bkpi\s+(?:low|high|down|up|drop|poor|bad)\b/i.test(q) ||
    /\bexplain\s+kpi\b/i.test(q) ||
    /\b(?:analyse|analyze)\s+(?:my\s+)?kpi\b/i.test(q) ||
    /\bkpi\s+(?:analys[ei]s|analyze|analyse)\b/i.test(q) ||
    /\bkpi\s+summary\s+(?:of|for)\b/i.test(q) ||
    /\bsummary\s+(?:of|for)\s+.+\bkpi\b/i.test(q) ||
    /\bwhy\s+(?:is\s+)?(?:the\s+)?score\b/i.test(q) ||
    /\bmera\s+kpi\s+kyun\b/i.test(q) ||
    /\bkpi\s+kyun(?:\s+kam)?\b/i.test(q)
  ) {
    return true;
  }

  // “why overdue” / “why are tasks overdue” / “why are Avaada tasks overdue”
  // (entity may sit between why|are and tasks overdue — not depth-only)
  if (
    /\bwhy\s+(?:are\s+)?(?:tasks?\s+)?overdue\b/i.test(q) ||
    /\bwhy\s+(?:(?:is|are|were|was)\s+)?(?:(?:the|these|those|my)\s+)?(?:[\w'&.\-]+(?:\s+[\w'&.\-]+){0,6}\s+)?tasks?\s+overdue\b/i.test(
      q
    ) ||
    /\bwhy\s+(?:(?:is|are|were|was)\s+)?(?:[\w'&.\-]+(?:\s+[\w'&.\-]+){0,6}\s+)?overdue\s+(?:on\s+)?tasks?\b/i.test(
      q
    ) ||
    /\bwhy\s+overdue\b/i.test(q) ||
    /\boverdue\s+analys[ei]s\b/i.test(q) ||
    /\b(?:analyse|analyze)\s+overdue\b/i.test(q)
  ) {
    return true;
  }

  if (
    /\b(?:analyse|analyze)\s+this\s+project\b/i.test(q) ||
    /\bwhy\s+(?:is\s+)?this\s+project\b/i.test(q) ||
    /\bproject\s+analys[ei]s\b/i.test(q)
  ) {
    return true;
  }

  // “why is outstanding high” / normalize may rewrite outstanding → receivables
  if (
    /\bwhy\s+(?:is\s+)?(?:(?:the|my)\s+)?(?:outstanding|receivable|receivables|aging|\bar\b)\b/i.test(
      q
    ) ||
    /\boutstanding\s+analys[ei]s\b/i.test(q) ||
    /\breceivables?\s+analys[ei]s\b/i.test(q) ||
    /\bwhy\s+(?:no\s+)?receipts?\b/i.test(q) ||
    /\b(?:analyse|analyze)\s+(?:outstanding|receivables?|collections?)\b/i.test(q)
  ) {
    return true;
  }

  // Attendance late only — never steal “why late payment/invoices/delivery”
  if (
    !isNonAttendanceLateContext(q) &&
    (/\bwhy\s+(?:late|absent|attendance)\b/i.test(q) ||
      /\battendance\s+analys[ei]s\b/i.test(q) ||
      /\b(?:analyse|analyze)\s+attendance\b/i.test(q) ||
      /\bwhy\s+(?:so\s+)?many\s+late\b/i.test(q))
  ) {
    return true;
  }

  if (/\b(nova\s+analys[ei]s|run\s+analys[ei]s)\b/i.test(q)) return true;
  return false;
}

export function inferNovaAnalysisDomain(
  query: string,
  structure?: NovaEntityModuleParse | null
): NovaAnalysisDomainHit {
  const q = query.trim();
  const parsed = structure === undefined ? parseEntityModuleAsk(q) : structure;
  // Shared structure: “why are avaada tasks overdue” → tasks (+ project kind)
  if (parsed?.moduleHint === "tasks" && (/\bwhy\b/i.test(q) || /\banalys/i.test(q))) {
    return { domain: "tasks", confidence: "high" };
  }
  if (
    parsed?.entityKindHint === "project" &&
    !parsed.moduleHint &&
    (/\bwhy\b/i.test(q) || /\banalys/i.test(q) || /\bthis\s+project\b/i.test(q))
  ) {
    return { domain: "project", confidence: "high" };
  }
  if (
    (parsed?.moduleHint === "invoices" || parsed?.moduleHint === "receipts") &&
    (/\bwhy\b/i.test(q) || /\banalys/i.test(q))
  ) {
    return { domain: "outstanding", confidence: "high" };
  }

  if (
    /\b(kpi|score\s*card|report\s*card|performance\s+score|mera\s+kpi)\b/i.test(q) ||
    /\bwhy\s+(?:is\s+)?(?:my\s+)?(?:the\s+)?score\b/i.test(q)
  ) {
    return { domain: "kpi", confidence: "high" };
  }
  if (
    /\b((?:analyse|analyze)\s+this\s+project|this\s+project|project\s+analys[ei]s)\b/i.test(q)
  ) {
    return { domain: "project", confidence: "high" };
  }
  if (/\b(tasks?|todos?|overdue\s+tasks?)\b/i.test(q) && /\b(overdue|why|analys)/i.test(q)) {
    return { domain: "tasks", confidence: "high" };
  }
  if (
    /\bwhy\s+overdue\b/i.test(q) &&
    !/\b(invoices?|billing|\bar\b|receivables?|outstanding)\b/i.test(q)
  ) {
    return { domain: "tasks", confidence: "medium" };
  }
  if (
    /\b(outstanding|receivables?|aging|\bar\b|receipts?|collections?|overdue\s+invoices?|invoices?|billing|late\s+payment|payment\s+late)\b/i.test(
      q
    )
  ) {
    return { domain: "outstanding", confidence: "high" };
  }
  // Money/ops “late …” before bare late → attendance
  if (/\blate\b/i.test(q) && isNonAttendanceLateContext(q)) {
    if (/\b(deliver(?:y|ies)|dispatch(?:es)?|challans?)\b/i.test(q)) {
      return { domain: "generic", confidence: "medium" };
    }
    return { domain: "outstanding", confidence: "high" };
  }
  if (
    /\b(attendance|absent|punch)\b/i.test(q) ||
    (/\blate\b/i.test(q) && !isNonAttendanceLateContext(q))
  ) {
    return { domain: "attendance", confidence: "high" };
  }
  if (/\b(why|analys|analyze|analyse)\b/i.test(q) && /\b(tasks?|todos?)\b/i.test(q)) {
    return { domain: "tasks", confidence: "medium" };
  }
  if (/\b(why|analys|analyze|analyse)\b/i.test(q)) {
    return { domain: "kpi", confidence: "medium" };
  }
  return { domain: "generic", confidence: "medium" };
}
