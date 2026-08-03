/**
 * NOVA intent slots + relationship composer (keyword-map Phases 1–2).
 * Normalize stays typo/Hinglish-only; routing reads slots via composeNovaIntent.
 */
import {
  expandNovaLexicon,
  extractNovaEntityHint,
  extractNovaPersonHint,
  getNovaTopic,
  isNovaConfirmedOrdersAsk,
  matchNovaTopics,
  selectToolsFromLexicon,
  type NovaTopicId,
} from "@/lib/ai/nova-lexicon";
import { parseNovaDateRange, type DateRange } from "@/lib/ai/nova-dates";
import { DEFAULT_TIMEZONE } from "@/lib/datetime-pure";
import {
  buildLateSenseClarifyCard,
  buildMetricClarifyCard,
  buildPendingClarifyCard,
  buildPeriodClarifyCard,
  formatNovaClarifyCard,
  NOVA_METRIC_CONFIRM_CHIPS,
  NOVA_PENDING_CONFIRM_CHIPS,
  toNovaClarifyOptions,
} from "@/lib/ai/nova-clarify";
import { filterNovaClarifyChipsForUser } from "@/lib/ai/nova-suggest";
import type { SessionUser } from "@/auth";
import {
  novaSearchEngineIsDecisive,
  runNovaSearchEngine,
} from "@/lib/nova/nova-search-engine";
import { isNonAttendanceLateContext } from "@/lib/nova/analysis/domain";

export type NovaPeriodGrain = "day" | "week" | "month" | "fy";

export type NovaAttendanceFocus =
  | "late"
  | "absent"
  | "present"
  | "overview"
  | "punch_out";

export type NovaSlot =
  | { kind: "period"; grain: NovaPeriodGrain; raw: string }
  | { kind: "metric"; topicId: NovaTopicId; focus?: NovaAttendanceFocus }
  | { kind: "status"; value: "pending" | "open" | "overdue" | "awaiting" }
  | { kind: "person"; name: string }
  | { kind: "entity"; name: string };

export type NovaIntent = {
  slots: NovaSlot[];
  tools: string[];
  clarify?: string;
  confidence: "high" | "low";
  /** Human labels for interpretedAs */
  interpretedAs?: string[];
};

/** Money / ops “late” (payment, invoice, delivery) — not HR late-comers. */
const LATE_MONEY_CONFLICT = {
  test(q: string): boolean {
    // Require “late” + non-attendance context so bare “invoices/delivery” stay on their modules.
    return /\blate\b/i.test(q) && isNonAttendanceLateContext(q);
  },
};

/** Explicit late-comers cues — do NOT treat bare “punch” as late. */
const LATE_HR_CUE =
  /\b(late\s*comers?|latecomers|who\s+(is|was|were)\s+late|came\s+late|late\s+minutes|most\s+late|punched?\s+(?:in\s+)?late)\b/i;

/** Didn’t punch / missing punch / who hasn’t come in. */
const ABSENT_PUNCH_CUE =
  /\b(didn'?t\s+punch|did\s+not\s+punch|hasn'?t\s+punch(?:ed)?|haven'?t\s+punch(?:ed)?|have\s+not\s+punch(?:ed)?|not\s+punched|missing\s+punch(?:\s*in|\s*out)?|no\s+punch(?:\s*in)?|who\s+(?:didn'?t|did\s+not|hasn'?t|haven'?t|have\s+not)\s+(?:punch|come)|who\s+(?:is|are)\s+missing(?:\s+punch)?)\b/i;

/** Person punch-in / presence check (“did Madhu punch in”, “has Arun come”). */
const PRESENT_PUNCH_CUE =
  /\b(?:(?:did|has|have)\s+[A-Za-z][A-Za-z'.-]{1,40}(?:\s+[A-Za-z][A-Za-z'.-]{1,30}){0,2}\s+(?:punch(?:ed)?(?:\s+in)?|come|came|show(?:ed)?\s+up)|(?:punch(?:ed)?\s+in|came\s+(?:in|today)|show(?:ed)?\s+up)(?:\s+today)?)\b/i;

/** Punch-out times / open visits — never late list or bare present overview. */
export const PUNCH_OUT_CUE =
  /\b(punch(?:ed|ing|es)?[\s-]*out(?:\s+times?)?|punch[\s-]*out[\s-]*times?|out[\s-]*times?(?:\s+of\s+(?:all\s+)?staffs?)?|who\s+(?:has|have|hasn'?t|haven'?t|did|didn'?t)\s+punched?\s+out|missing\s+punch[\s-]*out|no\s+punch[\s-]*out)\b/i;

const MONEY_TOPIC_IDS = new Set<NovaTopicId>([
  "receipts",
  "sales_invoices",
  "receivables",
  "payables",
  "customer_outstanding",
]);

const HR_TOPIC_IDS = new Set<NovaTopicId>([
  "attendance",
  "leave",
  "overtime",
  "regularisation",
  "kpi",
  "staff_advances",
  "salary",
  "incentives",
]);

function periodGrainFromRange(range: DateRange | null, q: string): NovaPeriodGrain | null {
  if (!range) return null;
  if (/\b(today|yesterday|tomorrow|parso|day\s+before\s+yesterday)\b/i.test(q)) return "day";
  if (/\b(this\s+week|last\s+week|current\s+week)\b/i.test(q)) return "week";
  if (/\b(fy|financial\s+year|\d{2}\s*[-–/]\s*\d{2}|this\s+year|this\s+fy)\b/i.test(q)) return "fy";
  if (/\b(this\s+month|last\s+month|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(q)) {
    return "month";
  }
  // Heuristic from span
  const ms = range.to.getTime() - range.from.getTime();
  if (ms <= 36 * 3600 * 1000) return "day";
  if (ms <= 10 * 24 * 3600 * 1000) return "week";
  if (ms <= 40 * 24 * 3600 * 1000) return "month";
  return "fy";
}

function hasPeriodToken(q: string): boolean {
  return /\b(today|yesterday|tomorrow|week|month|year|fy|\d{2}\s*[-–/]\s*\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|parso|day\s+before\s+yesterday)\b/i.test(
    q
  );
}

function isDayOrWeek(q: string): boolean {
  return /\b(today|todays|today'?s|yesterday|yesterdays|this\s+week|last\s+week|current\s+week|tomorrow|parso|day\s+before\s+yesterday)\b/i.test(
    q
  );
}

function isBarePeriodOnly(q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return false;
  // Any domain / metric / status token → not period-only
  if (
    /\b(sales|revenue|receipts?|collections?|turnover|billing|invoices?|late|absent|attendance|tasks?|kpi|leave|grn|expenses?|kharcha|stock|deliver(?:y|ies)|delay(?:s|ed)?|dispatch(?:es)?|challans?|bank|approvals?|pending|overdue|projects?|vendors?|customers?|advances?|present|punch|target|order\s*book|activit(?:y|ies)|overview|dashboard|summary|summaris[ee]|summarize|comers?|who|most|came|stock|vendors?|payments?|payment\s+requests?|incentives?|salary|payroll|payslips?|bonus|quotations?|quotes?|tally|profitability|reconcil)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (
    /^(today|yesterday|tomorrow|this\s+week|last\s+week|this\s+month|last\s+month|this\s+year|this\s+fy|\d{2}\s*[-–/]\s*\d{2}|fy\s*\d{2}\s*[-–/]\s*\d{2})$/i.test(
      t
    )
  ) {
    return true;
  }
  const range = parseNovaDateRange(t);
  return Boolean(range && t.split(/\s+/).length <= 3 && !/\b(for|of|about|from|and)\b/.test(t));
}

function detectAttendanceFocus(q: string): NovaAttendanceFocus | null {
  if (LATE_MONEY_CONFLICT.test(q)) return null;
  // Punch-out before absent/present — “missing punch out” is open visit, not absentee
  if (PUNCH_OUT_CUE.test(q) && !LATE_HR_CUE.test(q)) return "punch_out";
  if (ABSENT_PUNCH_CUE.test(q) || /\b(absent|absentees?)\b/i.test(q)) return "absent";
  if (/\b(present)\b/i.test(q) && !/\b(presentation|presently)\b/i.test(q)) return "present";
  // Punch / come asks are presence checks — never route to late-comers by default
  if (PRESENT_PUNCH_CUE.test(q) && !LATE_HR_CUE.test(q)) return "present";
  if (LATE_HR_CUE.test(q) || (/\blate\b/i.test(q) && !LATE_MONEY_CONFLICT.test(q))) return "late";
  // Bare “attendance” (+ optional period) → overview (present / absent / late), not late list
  if (/\battendance\b/i.test(q)) return "overview";
  // Bare punch without late → presence focus (person extract + subjectAttendance)
  if (/\bpunch(?:ed|ing|es)?\b/i.test(q)) return "present";
  return null;
}

/** Parse compositional slots from a (preferably normalized) query. */
export function parseNovaSlots(
  query: string,
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): NovaSlot[] {
  const q = expandNovaLexicon(query.trim().toLowerCase());
  const slots: NovaSlot[] = [];
  if (!q) return slots;

  const range = parseNovaDateRange(q, now, timeZone);
  const grain = periodGrainFromRange(range, q);
  if (range && grain && hasPeriodToken(q)) {
    slots.push({ kind: "period", grain, raw: range.label });
  }

  const focus = detectAttendanceFocus(q);
  if (focus) {
    slots.push({ kind: "metric", topicId: "attendance", focus });
  }

  const topics = matchNovaTopics(q);
  for (const t of topics) {
    if (t.id === "attendance" && focus) continue;
    // Skip attendance synonym hit when late-payment conflict
    if (t.id === "attendance" && LATE_MONEY_CONFLICT.test(q)) continue;
    slots.push({ kind: "metric", topicId: t.id });
  }

  if (/\bpending\b/i.test(q)) slots.push({ kind: "status", value: "pending" });
  else if (/\bawaiting\b/i.test(q)) slots.push({ kind: "status", value: "awaiting" });
  else if (/\boverdue\b/i.test(q)) slots.push({ kind: "status", value: "overdue" });
  else if (/\bopen\b/i.test(q)) slots.push({ kind: "status", value: "open" });

  const person = extractNovaPersonHint(query);
  if (person) slots.push({ kind: "person", name: person });

  const entity = extractNovaEntityHint(query);
  if (entity) slots.push({ kind: "entity", name: entity });

  return slots;
}

function toolsForTopic(id: NovaTopicId): string[] {
  return getNovaTopic(id)?.tools ?? [];
}

function labelForTopic(id: NovaTopicId): string {
  return getNovaTopic(id)?.label ?? id;
}

/** Focus-aware provenance — shared skill must not always say "late comers". */
function attendanceInterpretedAs(focus: NovaAttendanceFocus): string {
  if (focus === "absent") return "attendance / absentees";
  if (focus === "present") return "attendance / present";
  if (focus === "punch_out") return "attendance / punch out";
  if (focus === "overview") return "attendance overview";
  return "attendance / late comers";
}

/**
 * Apply relationship rules R1–R15 → tools or clarify.
 * R15 (follow-up period merge) lives in resolveNovaFollowUp — not here.
 */
export function composeNovaIntent(
  query: string,
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
  user?: SessionUser | null
): NovaIntent {
  const raw = query.trim();
  const q = expandNovaLexicon(raw.toLowerCase());
  if (!q) {
    return { slots: [], tools: [], confidence: "low", clarify: "What would you like to know?" };
  }

  const noAccessClarify =
    "I couldn’t find a metric you’re allowed to ask about here. Try **help** or **what can I access**.";
  const rbacPending = () => {
    const chips = filterNovaClarifyChipsForUser(user, NOVA_PENDING_CONFIRM_CHIPS);
    return chips.length > 0 ? chips : null;
  };
  const rbacMetrics = () => {
    const chips = filterNovaClarifyChipsForUser(user, NOVA_METRIC_CONFIRM_CHIPS);
    return chips.length > 0 ? chips : null;
  };
  const rbacLateSense = () => {
    const chips = filterNovaClarifyChipsForUser(user, [
      { id: "late payment / fee", label: "late payment / fee", type: "other" as const },
      { id: "late comers (attendance)", label: "late comers (attendance)", type: "metric" as const },
    ]);
    return chips.length > 0 ? chips : null;
  };

  const slots = parseNovaSlots(raw, now, timeZone);
  const period = slots.find((s): s is Extract<NovaSlot, { kind: "period" }> => s.kind === "period");
  const status = slots.find((s): s is Extract<NovaSlot, { kind: "status" }> => s.kind === "status");
  const person = slots.find((s): s is Extract<NovaSlot, { kind: "person" }> => s.kind === "person");
  const metrics = slots.filter((s): s is Extract<NovaSlot, { kind: "metric" }> => s.kind === "metric");
  const attendance = metrics.find((m) => m.topicId === "attendance");
  const moneyMetrics = metrics.filter((m) => MONEY_TOPIC_IDS.has(m.topicId));
  const hrMetrics = metrics.filter((m) => HR_TOPIC_IDS.has(m.topicId));
  const domainMetrics = metrics.filter((m) => m.topicId !== "attendance" || Boolean(m.focus));

  // Explicit Sales Orders documents before “sales” money steal
  if (
    /\bsales\s+orders?\b/i.test(q) ||
    /\bso\s+pending\b/i.test(q) ||
    /\bopen\s+sales\s+orders?\b/i.test(q)
  ) {
    return {
      slots,
      tools: ["sales_orders_summary"],
      confidence: "high",
      interpretedAs: ["sales orders"],
    };
  }

  // Bare / confirmed orders → projects confirmed (emPOWER product preference)
  if (isNovaConfirmedOrdersAsk(q)) {
    return {
      slots,
      tools: ["projects_summary"],
      confidence: "high",
      interpretedAs: ["projects confirmed / new orders"],
    };
  }

  // NovaSearchEngine — name lookup / entity-scoped status before wrong skill defaults
  {
    const search = runNovaSearchEngine(raw);
    if (novaSearchEngineIsDecisive(search)) {
      if (search.queryFamily === "deny_write") {
        return {
          slots,
          tools: [],
          confidence: "high",
          clarify:
            "NOVA AI is **read-only**. I can summarise and look up data, but I cannot create, edit, approve, pay, or delete records.",
          interpretedAs: search.interpretedAs,
        };
      }
      // Resolve must not steal lexicon module/open tools (purchase bills, backup, theme, …)
      const lexiconOwnsResolve =
        search.queryFamily === "resolve" &&
        selectToolsFromLexicon(raw).tools.some((t) => t !== "search_entities");
      if (search.tools.length > 0 && !lexiconOwnsResolve) {
        let withEntity = slots.filter((s) => {
          // Project/party scope must not be treated as a person
          if (search.suppressPersonHint && s.kind === "person") return false;
          return true;
        });
        if (search.entityHint) {
          const withoutOldEntity = withEntity.filter((s) => s.kind !== "entity");
          withEntity = [...withoutOldEntity, { kind: "entity" as const, name: search.entityHint }];
        }
        return {
          slots: withEntity,
          tools: [...search.tools],
          confidence: "high",
          interpretedAs: search.interpretedAs,
        };
      }
      // resolve / people — keep identity tools when SearchEngine supplied them
      if (
        (search.queryFamily === "resolve" || search.queryFamily === "people") &&
        !lexiconOwnsResolve
      ) {
        if (search.tools.length > 0) {
          let withEntity = slots.filter((s) => {
            if (search.suppressPersonHint && s.kind === "person") return false;
            return true;
          });
          if (search.entityHint) {
            const withoutOldEntity = withEntity.filter((s) => s.kind !== "entity");
            withEntity = [
              ...withoutOldEntity,
              { kind: "entity" as const, name: search.entityHint },
            ];
            if (
              search.entityType === "employee" &&
              !search.suppressPersonHint &&
              !withEntity.some((s) => s.kind === "person")
            ) {
              withEntity = [
                ...withEntity,
                { kind: "person" as const, name: search.entityHint },
              ];
            }
          }
          return {
            slots: withEntity,
            tools: [...search.tools],
            confidence: "high",
            interpretedAs: search.interpretedAs,
          };
        }
        return { slots, tools: [], confidence: "low", interpretedAs: search.interpretedAs };
      }
    }
  }

  // R4 — late + payment/fee/charge → not attendance
  if (LATE_MONEY_CONFLICT.test(q)) {
    const nonAtt = metrics.filter((m) => m.topicId !== "attendance");
    if (nonAtt.length > 0) {
      const tools = [...new Set(nonAtt.flatMap((m) => toolsForTopic(m.topicId)))];
      return {
        slots,
        tools: tools.length ? tools : [],
        confidence: "high",
        interpretedAs: nonAtt.map((m) => labelForTopic(m.topicId)),
        clarify: tools.length
          ? undefined
          : (() => {
              const chips = rbacLateSense();
              return chips
                ? formatNovaClarifyCard(buildLateSenseClarifyCard(chips))
                : noAccessClarify;
            })(),
      };
    }
    const chips = rbacLateSense();
    return {
      slots,
      tools: [],
      confidence: "high",
      clarify: chips
        ? formatNovaClarifyCard(buildLateSenseClarifyCard(chips))
        : noAccessClarify,
    };
  }

  // R1 / R2 / R9 — late/absent/present (+ optional period) → attendance
  if (attendance?.focus) {
    // R2 — late + HR cue (comers/who/most/came/punch) → attendance even without period
    const hasHrCue =
      LATE_HR_CUE.test(q) ||
      ABSENT_PUNCH_CUE.test(q) ||
      PRESENT_PUNCH_CUE.test(q) ||
      /\b(late\s*comers?|latecomers|attendance|punch|who|most|came)\b/i.test(q);

    // R3 / R6 — truly bare late|absent|present only → clarify period
    if (
      !period &&
      !hasHrCue &&
      /^(late|absent|absentees?|present)(\s+(please|pls))?$/i.test(q.trim())
    ) {
      const focusLabel =
        attendance.focus === "absent"
          ? "absentees"
          : attendance.focus === "present"
            ? "present staff"
            : attendance.focus === "punch_out"
              ? "punch-out times"
              : attendance.focus === "overview"
                ? "attendance"
                : "late comers";
      return {
        slots,
        tools: [],
        confidence: "high",
        clarify: formatNovaClarifyCard(buildPeriodClarifyCard(focusLabel)),
      };
    }
    return {
      slots,
      tools: ["attendance_late_summary"],
      confidence: "high",
      interpretedAs: [attendanceInterpretedAs(attendance.focus)],
    };
  }

  // Day activity / summary pack (keep lexicon behaviour)
  if (
    /\b(activit(y|ies)|day\s+summary|daily\s+summary)\b/i.test(q) &&
    /\b(today|yesterday|this\s+week|last\s+week)\b/i.test(q)
  ) {
    return {
      slots,
      tools: ["sales_summary", "receipts_summary", "pending_workflow_counts"],
      confidence: "high",
      interpretedAs: ["day activity"],
    };
  }

  // FY / order-book target
  if (
    /\b(order\s+book\s+target|fy\s+target|target\s+order\s+book|orderbook\s+target)\b/i.test(q) ||
    (/\btargets?\b/i.test(q) &&
      /\b(fy|financial\s+year|order\s+book|pipeline|\d{2}\s*[-–/]\s*\d{2}|this\s+year|this\s+fy)\b/i.test(q))
  ) {
    return {
      slots,
      tools: ["order_book_summary"],
      confidence: "high",
      interpretedAs: ["order book / FY target"],
    };
  }

  // R8 — day/week + clear money metric → single tool
  const wantsReceipts = /\b(receipts?|collections?|money\s+in)\b/i.test(q);
  const wantsSales =
    /\b(sales|revenue|turnover|billed|invoiced)\b/i.test(q) ||
    (/\b(invoices?|billing|gst\s+bill)\b/i.test(q) && !wantsReceipts);
  if (isDayOrWeek(q) && wantsReceipts && !/\b(and|also|plus)\b/i.test(q)) {
    return {
      slots,
      tools: ["receipts_summary"],
      confidence: "high",
      interpretedAs: ["receipts"],
    };
  }
  if (isDayOrWeek(q) && wantsSales && !wantsReceipts && !/\b(and|also|plus)\b/i.test(q)) {
    return {
      slots,
      tools: ["sales_summary"],
      confidence: "high",
      interpretedAs: ["billing / invoices"],
    };
  }

  // Bare stock / delivery (no period) → tool; executor defaults current month (like stock)
  if (
    !period &&
    metrics.length === 1 &&
    moneyMetrics.length === 0 &&
    hrMetrics.length === 0 &&
    !status &&
    !person &&
    (metrics[0].topicId === "stock" || metrics[0].topicId === "delivery")
  ) {
    const id = metrics[0].topicId;
    const tools = toolsForTopic(id);
    if (tools.length > 0) {
      return {
        slots,
        tools,
        confidence: "high",
        interpretedAs: [labelForTopic(id)],
      };
    }
  }

  // Period + single non-money/non-HR metric (delivery, stock, …) → that tool
  if (period && metrics.length === 1 && moneyMetrics.length === 0 && hrMetrics.length === 0 && !status) {
    const id = metrics[0].topicId;
    const tools = toolsForTopic(id);
    if (tools.length > 0) {
      return {
        slots,
        tools,
        confidence: "high",
        interpretedAs: [labelForTopic(id)],
      };
    }
  }

  // R8 / R9 — period + single money or HR metric
  if (period && moneyMetrics.length === 1 && hrMetrics.length === 0 && !status) {
    const id = moneyMetrics[0].topicId;
    const tools = toolsForTopic(id);
    if (tools.length === 1 || (isDayOrWeek(q) && (id === "receipts" || id === "sales_invoices"))) {
      return {
        slots,
        tools: id === "receipts" ? ["receipts_summary"] : id === "sales_invoices" ? ["sales_summary"] : tools,
        confidence: "high",
        interpretedAs: [labelForTopic(id)],
      };
    }
  }
  if (period && hrMetrics.length === 1 && moneyMetrics.length === 0) {
    const id = hrMetrics[0].topicId;
    return {
      slots,
      tools: toolsForTopic(id),
      confidence: "high",
      interpretedAs: [labelForTopic(id)],
    };
  }

  // R10 — bare pending
  if (/^pending(\s+(please|pls))?$/i.test(q.trim())) {
    const chips = rbacPending();
    return {
      slots,
      tools: [],
      confidence: "high",
      clarify: chips
        ? formatNovaClarifyCard(buildPendingClarifyCard(chips))
        : noAccessClarify,
    };
  }

  // Pending + period only (no domain) — pending is a queue status, not a day metric
  if (
    (status?.value === "pending" || status?.value === "awaiting") &&
    period &&
    !/\b(approvals?|tasks?|todo|leave|payment\s+requests?|purchase\s+bills?|advances?|bills?|workflow)\b/i.test(
      q
    )
  ) {
    const chips = filterNovaClarifyChipsForUser(user, [
      { id: "approvals", label: "approvals", type: "other" as const },
      { id: "leave", label: "leave", type: "other" as const },
      { id: "tasks", label: "tasks", type: "metric" as const },
      { id: "payment requests", label: "payment requests", type: "metric" as const },
      { id: "purchase bills", label: "purchase bills", type: "other" as const },
    ]);
    return {
      slots,
      tools: [],
      confidence: "high",
      clarify: chips.length
        ? formatNovaClarifyCard(buildPendingClarifyCard(chips))
        : noAccessClarify,
    };
  }

  // R11 — pending + domain (high-confidence single tools)
  if (status?.value === "pending" || status?.value === "awaiting") {
    if (/\b(approvals?)\b/i.test(q) && !/\b(and|also|plus)\b/i.test(q)) {
      return {
        slots,
        tools: ["approvals_summary"],
        confidence: "high",
        interpretedAs: ["approvals"],
      };
    }
    if (/\b(tasks?|todo)\b/i.test(q) && !/\b(and|also|plus|completed|finished)\b/i.test(q)) {
      return {
        slots,
        tools: ["tasks_summary"],
        confidence: "high",
        interpretedAs: ["tasks"],
      };
    }
    if (/\bleave\b/i.test(q)) {
      return {
        slots,
        tools: ["leave_summary"],
        confidence: "high",
        interpretedAs: ["leave"],
      };
    }
    if (/\badvances?\b/i.test(q)) {
      return {
        slots,
        tools: ["staff_advances_summary"],
        confidence: "high",
        interpretedAs: ["staff advances"],
      };
    }
    if (/\b(payment\s+requests?|payments?)\b/i.test(q) && !/\b(late\s+payment|payment\s+late|expense\s+payment|advance\s+payment)\b/i.test(q)) {
      return {
        slots,
        tools: ["payment_requests_summary"],
        confidence: "high",
        interpretedAs: ["payment requests"],
      };
    }
  }

  // R12 — bare advance(s)
  if (/^advances?(\s+(please|pls))?$/i.test(q.trim())) {
    return {
      slots,
      tools: ["staff_advances_summary"],
      confidence: "high",
      interpretedAs: ["staff advances"],
    };
  }
  if (/\badvance\s+payment\b/i.test(q) && !/\bstaff\b/i.test(q)) {
    return {
      slots,
      tools: [],
      confidence: "high",
      clarify: formatNovaClarifyCard({
        kind: "generic",
        prompt: "Did you mean one of these?",
        options: toNovaClarifyOptions([
          { id: "staff advances", label: "staff advances", type: "other" },
          {
            id: "advance payment on a bill / order",
            label: "advance payment on a bill / order",
            type: "other",
          },
        ]),
        footer: "Reply with the number or the full label.",
      }),
    };
  }

  // R13 — person + domain already reflected in slots; ensure tools when person+metric
  if (person && domainMetrics.length > 0) {
    const tools = [
      ...new Set(
        domainMetrics.flatMap((m) => {
          if (m.topicId === "attendance") return ["attendance_late_summary"];
          return toolsForTopic(m.topicId);
        })
      ),
    ].filter((t) => t !== "my_work_summary");
    if (tools.length > 0) {
      return {
        slots,
        tools,
        confidence: "high",
        interpretedAs: domainMetrics.map((m) => labelForTopic(m.topicId)),
      };
    }
  }

  // R7 / R14 — period only → clarify metric (never silent money pack)
  if (isBarePeriodOnly(q) || (period && metrics.length === 0 && !status && !person)) {
    const label = period?.raw ?? q;
    const chips = rbacMetrics();
    return {
      slots,
      tools: [],
      confidence: "high",
      clarify: chips
        ? formatNovaClarifyCard(buildMetricClarifyCard(label, chips))
        : noAccessClarify,
    };
  }

  // Low confidence — let legacy lexicon heuristics finish
  return {
    slots,
    tools: [],
    confidence: "low",
  };
}

/** True when composer already decided tools or clarify (skip money-pack fallbacks). */
export function novaIntentIsDecisive(intent: NovaIntent): boolean {
  return intent.confidence === "high" && (intent.tools.length > 0 || Boolean(intent.clarify));
}
