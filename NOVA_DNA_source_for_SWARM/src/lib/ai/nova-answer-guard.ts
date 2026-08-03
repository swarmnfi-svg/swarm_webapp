/**
 * Post-narration answer guards — money / count / identity / period (+ attendance).
 * On failure: fall back to deterministic ERP copy (never re-ask the LLM to “fix” itself).
 */

import type { NovaToolFact } from "@/lib/ai/nova-tools";
import { formatFactsPolished, llmPreservesLatePunchTimes, llmPreservesLateStaffNames, llmPreservesAttendancePresence, llmPreservesPunchOutFocus } from "@/lib/ai/nova-format";
import { llmPreservesPeriodIntent } from "@/lib/ai/nova-dates";
import {
  factsHaveHeadlineMoney,
  llmPreservesEntityFilter,
  llmPreservesPrimaryMoney,
} from "@/lib/ai/nova-money";
import { llmPreservesSubjectIdentity } from "@/lib/ai/nova-identity";

export type NovaAnswerGuardInput = {
  query: string;
  facts: NovaToolFact[];
  text: string;
  userFirstName?: string;
  /** LLM narration vs deterministic template (skips voice-only checks when true). */
  deterministic?: boolean;
};

export type NovaAnswerGuardResult = {
  text: string;
  toolsUsed: string[];
  failed: boolean;
  failedGuard?: string;
};

const PRIMARY_COUNT_KEYS = [
  "awaitingActionCount",
  "pendingCount",
  "activeCount",
  "invoiceCount",
  "receiptCount",
  "latePeopleCount",
  "peopleWithLate",
  "presentCount",
  "absentCount",
  "openCount",
  "taskCount",
  "totalCount",
] as const;

function extractPrimaryCounts(facts: NovaToolFact[]): number[] {
  const out: number[] = [];
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    for (const key of PRIMARY_COUNT_KEYS) {
      const v = f.data[key];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) out.push(v);
    }
  }
  return out;
}

/**
 * Count fidelity: reject 10× / 100× misreads of primary fact counts when the answer
 * states a bare integer that is a known count inflated by trailing zeros.
 */
export function llmPreservesPrimaryCounts(
  content: string,
  facts: NovaToolFact[]
): boolean {
  const counts = extractPrimaryCounts(facts);
  if (counts.length === 0) return true;
  // Strip clock times so "10:06 am" does not yield digit 10 as a 10× of count 1.
  const withoutClocks = content.replace(/\b\d{1,2}:\d{2}(?:\s*[ap]\.?m\.?)?\b/gi, " ");
  const nums = withoutClocks.match(/\b\d{1,7}\b/g)?.map((n) => Number(n)) ?? [];
  if (nums.length === 0) return true;
  for (const truth of counts) {
    if (truth === 0) continue;
    const t = String(Math.trunc(truth));
    for (const n of nums) {
      if (n === truth) continue;
      const s = String(Math.trunc(n));
      if (s === t + "0" || s === t + "00") return false;
    }
  }
  return true;
}

function fallbackText(
  query: string,
  facts: NovaToolFact[],
  silent: boolean,
  note: string
): string | null {
  // Always polished — never raw mechanical dumps on guard failure.
  const text = formatFactsPolished(query, facts);
  if (!text) return null;
  return silent ? text : `${text}\n\n_${note}_`;
}

/**
 * Run money → period → entity → identity → count → attendance guards in order.
 * First failure wins; returns deterministic fallback when available.
 */
export function guardNovaAnswer(input: NovaAnswerGuardInput): NovaAnswerGuardResult {
  const { query, facts, text, userFirstName, deterministic } = input;
  const toolsUsed: string[] = [];

  type Check = {
    id: string;
    ok: boolean;
    note: string;
    silent?: boolean;
  };

  const checks: Check[] = [
    {
      id: "answer_money_guard",
      ok: llmPreservesPrimaryMoney(text, facts),
      note: "Shown from ERP totals — AI restated amounts inconsistently.",
      silent: !factsHaveHeadlineMoney(facts),
    },
    {
      id: "answer_period_guard",
      ok: llmPreservesPeriodIntent(query, facts, text),
      note: "Shown from ERP period data — AI period did not match your day ask.",
    },
    {
      id: "answer_entity_guard",
      ok: llmPreservesEntityFilter(text, facts, query),
      note: "Shown from ERP data — AI mixed up which customer the figures belong to.",
    },
  ];

  if (!deterministic && userFirstName) {
    checks.push({
      id: "answer_identity_guard",
      ok: llmPreservesSubjectIdentity(text, facts, userFirstName),
      note: "Shown from ERP task data — AI mixed up who the tasks belong to.",
    });
  }

  checks.push({
    id: "answer_count_guard",
    ok: llmPreservesPrimaryCounts(text, facts),
    note: "Shown from ERP counts — AI restated a quantity inconsistently.",
    silent: true,
  });

  if (!deterministic) {
    checks.push(
      {
        id: "answer_late_punch_guard",
        ok: llmPreservesLatePunchTimes(text, facts),
        // Polished fallback already lists punchInLabel — keep UX quiet.
        note: "Shown from ERP attendance — AI omitted today’s punch-in times.",
        silent: true,
      },
      {
        id: "answer_late_name_guard",
        ok: llmPreservesLateStaffNames(text, facts),
        note: "Shown from ERP attendance — AI named someone not in today’s late list.",
      },
      {
        id: "answer_attendance_presence_guard",
        ok: llmPreservesAttendancePresence(text, facts),
        note: "Shown from ERP attendance register — AI contradicted today’s status.",
      },
      {
        id: "answer_punch_out_guard",
        ok: llmPreservesPunchOutFocus(text, facts),
        note: "Shown from ERP attendance — AI omitted punch-out times or rewrote as late.",
      }
    );
  }

  for (const check of checks) {
    if (check.ok) continue;
    const fb = fallbackText(query, facts, check.silent ?? false, check.note);
    if (!fb) {
      return {
        text,
        toolsUsed: [check.id, "answer_guard_fail"],
        failed: true,
        failedGuard: check.id,
      };
    }
    toolsUsed.push(check.id, "deterministic");
    if (check.silent) toolsUsed.push("count_fallback_silent");
    return {
      text: fb,
      toolsUsed,
      failed: true,
      failedGuard: check.id,
    };
  }

  return { text, toolsUsed: ["answer_guard_ok"], failed: false };
}
