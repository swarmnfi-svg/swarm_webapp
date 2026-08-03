/**
 * Infer Trend domain + cue detection (rules-first; no LLM).
 * Analysis keeps “why …”; Trend wins on trend / over time / frequently / always.
 * Optionally prefers shared query-structure module hints (task vs attendance).
 */
import type { NovaTrendDomain } from "@/lib/nova/trend/contract";
import { isNonAttendanceLateContext } from "@/lib/nova/query-structure/late-context";
import { parseEntityModuleAsk } from "@/lib/nova/query-structure/parse-entity-module";

export type NovaTrendDomainHit = {
  domain: NovaTrendDomain;
  confidence: "high" | "medium";
  /** Stripped party/project span when present — soft scope for adapters. */
  entitySpan?: string | null;
};

/**
 * True when the query should route to nova_trend (not Analysis snapshot).
 */
export function isNovaTrendCue(query: string): boolean {
  const q = query.trim();
  if (!q) return false;

  // Never steal Analysis why/analyse cues
  if (
    /\bwhy\b/i.test(q) ||
    /\b(?:analyse|analyze|analysis)\b/i.test(q) ||
    /\bexplain\b/i.test(q)
  ) {
    return false;
  }

  const trendShape =
    /\btrends?\b/i.test(q) ||
    /\bover\s+time\b/i.test(q) ||
    /\bfrequently\b/i.test(q) ||
    /\bfrequent\b/i.test(q) ||
    /\balways\b/i.test(q) ||
    /\boften\b/i.test(q) ||
    /\bmost\s+often\b/i.test(q) ||
    /\brepeated(?:ly)?\b/i.test(q) ||
    /\blast\s+\d+\s+(?:days?|weeks?|months?)\b/i.test(q);

  // AR aging / outstanding worsen (may lack “trend” token)
  if (
    /\b(ar\s+aging|ageing)\b/i.test(q) ||
    (/\b(outstanding|receivables?|aging|ageing)\b/i.test(q) &&
      /\b(worsen\w*|rising|trend|over\s+time|trajectory)\b/i.test(q))
  ) {
    return true;
  }

  // KPI score trajectory / high streak / period changes (may lack “trend” token)
  if (
    (/\bkpi\b/i.test(q) &&
      /\b(trend|trajectory|over\s+time|score|streak|sustained|changes?)\b/i.test(
        q
      )) ||
    /\bwho\s+(?:has|had|stayed|kept)\s+high\s+kpi\b/i.test(q) ||
    /\bhigh\s+kpi\s+(?:streak|longest|long)\b/i.test(q)
  ) {
    return true;
  }

  // Staff spend / reimbursement trend (money guarded in adapter).
  if (
    /\b(staff|employee|employees?)\b/i.test(q) &&
    /\b(expenses?|spend(?:s|ing)?|spent|reimburs\w*|claim(?:ed|s)?)\b/i.test(q) &&
    /\b(trend|trajectory|over\s+time|last\s+\d+\s+(?:days?|weeks?|months?))\b/i.test(q)
  ) {
    return true;
  }

  if (!trendShape) return false;

  // Attendance late frequency (first-class non-money Trend).
  // Keep same-day "late comers today" / "who came late today" on the
  // attendance register skill; Trend needs frequency / over-time shape.
  if (
    !isNonAttendanceLateContext(q) &&
    (/\blate\b/i.test(q) ||
      /\blatecomers?\b/i.test(q) ||
      /\blate\s*comers?\b/i.test(q) ||
      /\bpunch(?:es|ed|ing)?\b/i.test(q) ||
      (/\battendance\b/i.test(q) && /\blate\b/i.test(q)))
  ) {
    return true;
  }

  // Task late-completion / always overdue completers
  if (
    (/\b(task|todo|overdue)\b/i.test(q) &&
      (/\b(complet|finish|done|overdue|late)\b/i.test(q) || trendShape)) ||
    /\bcomplet\w*\s+after\s+(?:due|overdue)\b/i.test(q) ||
    /\bafter\s+(?:the\s+)?due\b/i.test(q) ||
    /\blate\s+completion\b/i.test(q)
  ) {
    return true;
  }

  if (/\bnova\s+trend\b/i.test(q) || /\brun\s+trend\b/i.test(q)) return true;

  // Bare “trend over time” without domain → still trend (generic → clarify)
  if (/\btrends?\b/i.test(q) || /\bover\s+time\b/i.test(q)) return true;

  return false;
}

export function inferNovaTrendDomain(query: string): NovaTrendDomainHit {
  const q = query.trim();
  const structure = parseEntityModuleAsk(q);
  const entitySpan = structure?.entitySpan ?? null;

  if (
    structure?.moduleHint === "tasks" ||
    /\b(task|todo)\b/i.test(q) ||
    (/\boverdue\b/i.test(q) &&
      /\b(complet|finish|done|always|often|frequently)\b/i.test(q))
  ) {
    return { domain: "task_late_completion", confidence: "high", entitySpan };
  }

  if (/\b(complet\w+\s+after\s+overdue|after\s+due|late\s+completion)\b/i.test(q)) {
    return { domain: "task_late_completion", confidence: "high", entitySpan };
  }

  if (
    /\b(ar\s+aging|ageing\s+trend|aging\s+worsen|outstanding\s+trend|receivables?\s+trend)\b/i.test(
      q
    ) ||
    (/\b(outstanding|receivables?|aging|ageing)\b/i.test(q) &&
      /\b(worsen\w*|rising|trajectory|over\s+time)\b/i.test(q))
  ) {
    return { domain: "ar_aging", confidence: "high", entitySpan };
  }

  if (
    (/\bkpi\b/i.test(q) &&
      /\b(trend|trajectory|over\s+time|score|streak|sustained|high|changes?)\b/i.test(
        q
      )) ||
    /\bwho\s+(?:has|had|stayed|kept)\s+high\s+kpi\b/i.test(q)
  ) {
    return { domain: "kpi_score", confidence: "high", entitySpan };
  }

  if (
    /\b(staff|employee|employees?)\b/i.test(q) &&
    /\b(expenses?|spend(?:s|ing)?|spent|reimburs\w*|claim(?:ed|s)?)\b/i.test(q) &&
    /\b(trend|trajectory|over\s+time|last\s+\d+\s+(?:days?|weeks?|months?))\b/i.test(q)
  ) {
    return { domain: "staff_expense_spend", confidence: "high", entitySpan };
  }

  if (
    !isNonAttendanceLateContext(q) &&
    (/\b(punch|latecomer|late\s*comers?)\b/i.test(q) ||
      (/\blate\b/i.test(q) && !/\b(task|todo|invoice|payment)\b/i.test(q)))
  ) {
    return { domain: "attendance_late", confidence: "high", entitySpan };
  }

  if (
    /\bfrequently\s+late\b/i.test(q) ||
    /\balways\s+late\b/i.test(q) ||
    /\blate\s*comers?\s+trend\b/i.test(q)
  ) {
    return { domain: "attendance_late", confidence: "high", entitySpan };
  }

  return { domain: "generic", confidence: "medium", entitySpan };
}
