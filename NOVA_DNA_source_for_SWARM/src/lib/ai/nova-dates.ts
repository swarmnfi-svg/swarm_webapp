/**
 * Parse natural-language date ranges for NOVA tools.
 * All calendar periods use the app timezone (default Asia/Kolkata) so
 * “today” matches what users see on receipt/invoice screens — not server UTC.
 */
import {
  DEFAULT_TIMEZONE,
  getCalendarDateInTimezone,
  getDayBoundsInTimezone,
  getDayOfWeekInTimezone,
  zonedDateTimeToUtc,
} from "@/lib/datetime-pure";
import { novaBareMoneyWordPattern, novaMoneyWordPattern, extractNovaBareEntityCandidate } from "@/lib/ai/nova-lexicon";
import {
  buildEntityMetricClarifyCard,
  buildFinanceReportClarifyCard,
  buildMetricClarifyCard,
  buildPendingClarifyCard,
  buildPeriodClarifyCard,
  formatNovaClarifyCard,
  NOVA_ENTITY_METRIC_CONFIRM_CHIPS,
  NOVA_FINANCE_REPORT_CONFIRM_CHIPS,
  NOVA_METRIC_CONFIRM_CHIPS,
  NOVA_PENDING_CONFIRM_CHIPS,
} from "@/lib/ai/nova-clarify";
import { filterNovaClarifyChipsForUser } from "@/lib/ai/nova-suggest";
import type { SessionUser } from "@/auth";

export type DateRange = { from: Date; to: Date; label: string };

const MONTHS: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function dayLabel(year: number, month: number, day: number): string {
  const anchor = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return anchor.toLocaleString("en-IN", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dayRangeInTz(ref: Date, timeZone: string): DateRange {
  const { year, month, day } = getCalendarDateInTimezone(ref, timeZone);
  const { start, end } = getDayBoundsInTimezone(timeZone, ref);
  return { from: start, to: end, label: dayLabel(year, month, day) };
}

function monthRangeInTz(year: number, monthIndex: number, timeZone: string): DateRange {
  const month = monthIndex + 1;
  const from = zonedDateTimeToUtc(year, month, 1, 0, 0, 0, 0, timeZone);
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const to = zonedDateTimeToUtc(year, month, lastDay, 23, 59, 59, 999, timeZone);
  const label = new Date(Date.UTC(year, monthIndex, 15)).toLocaleString("en-IN", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
  return { from, to, label };
}

/** Indian FY start calendar year (Apr–Mar). Jul 2026 → 2026 (FY 26-27). */
export function indianFyStartYear(now = new Date(), timeZone: string = DEFAULT_TIMEZONE): number {
  const { year, month } = getCalendarDateInTimezone(now, timeZone);
  return month >= 4 ? year : year - 1;
}

/** Indian FY: 1 Apr (year) → 31 Mar (year+1) in app timezone. */
export function fyRange(startYear: number, timeZone: string = DEFAULT_TIMEZONE): DateRange {
  const from = zonedDateTimeToUtc(startYear, 4, 1, 0, 0, 0, 0, timeZone);
  const to = zonedDateTimeToUtc(startYear + 1, 3, 31, 23, 59, 59, 999, timeZone);
  const yy = String(startYear).slice(-2);
  const yy2 = String(startYear + 1).slice(-2);
  return { from, to, label: `FY ${yy}-${yy2}` };
}

/** Current Indian FY containing `now`. */
export function currentIndianFyRange(
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): DateRange {
  return fyRange(indianFyStartYear(now, timeZone), timeZone);
}

/** True when range is a single calendar day (today/yesterday) in app timezone. */
export function isNovaSingleDayRange(
  range: DateRange | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE
): boolean {
  if (!range) return false;
  const a = getCalendarDateInTimezone(range.from, timeZone);
  const b = getCalendarDateInTimezone(range.to, timeZone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export type NovaPeriodGrain = "day" | "week" | "month" | "fy" | "other";
export type NovaPeriodSource =
  | "explicit"
  | "default_month"
  | "default_today"
  | "default_fy";

export type ToolPeriodResolution = {
  period: DateRange;
  periodGrain: NovaPeriodGrain;
  periodSource: NovaPeriodSource;
};

/** Infer grain from an already-resolved range label / span. */
export function novaPeriodGrainFromRange(
  range: DateRange,
  timeZone: string = DEFAULT_TIMEZONE
): NovaPeriodGrain {
  if (isNovaSingleDayRange(range, timeZone)) return "day";
  if (/^FY\s/i.test(range.label)) return "fy";
  if (
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(
      range.label
    )
  ) {
    return "month";
  }
  if (/\bweek\b/i.test(range.label) || /[–—]/.test(range.label) || /\s+-\s+/.test(range.label)) {
    return "week";
  }
  return "other";
}

/**
 * Central period resolution for tools: explicit range wins; otherwise a documented fallback.
 * Replaces ad-hoc `new Date(y, m, 1)` server-local month windows.
 */
export function resolveToolPeriod(
  range: DateRange | null | undefined,
  fallback: "month" | "today" | "fy",
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): ToolPeriodResolution {
  if (range) {
    return {
      period: range,
      periodGrain: novaPeriodGrainFromRange(range, timeZone),
      periodSource: "explicit",
    };
  }
  if (fallback === "today") {
    const period = dayRangeInTz(now, timeZone);
    return { period, periodGrain: "day", periodSource: "default_today" };
  }
  if (fallback === "fy") {
    const period = currentIndianFyRange(now, timeZone);
    return { period, periodGrain: "fy", periodSource: "default_fy" };
  }
  const period = novaCurrentMonthRange(now, timeZone);
  return { period, periodGrain: "month", periodSource: "default_month" };
}

/**
 * Parse Indian FY from patterns like:
 * FY 26-27, fy26-27, 26-27, 2026-27, F.Y. 25/26
 */
export function parseIndianFyToken(
  query: string,
  timeZone: string = DEFAULT_TIMEZONE
): DateRange | null {
  const q = query.trim().toLowerCase();
  const m =
    q.match(/\bf\.?\s*y\.?\s*['’]?(\d{2}|\d{4})\s*[-–/]\s*(\d{2})\b/) ||
    q.match(/\b(\d{2})\s*[-–/]\s*(\d{2})\b/);
  if (!m) return null;
  let startYy = parseInt(m[1], 10);
  const endYy = parseInt(m[2], 10);
  if (m[1].length === 4) startYy = startYy % 100;
  const expectedEnd = (startYy + 1) % 100;
  if (endYy !== expectedEnd) return null;
  const startYear = 2000 + startYy;
  if (startYear < 2000 || startYear > 2098) return null;
  return fyRange(startYear, timeZone);
}

/** Monday-start week containing `d` in `timeZone`. */
function weekRangeContaining(d: Date, timeZone: string): DateRange {
  const { year, month, day } = getCalendarDateInTimezone(d, timeZone);
  const dow = getDayOfWeekInTimezone(d, timeZone); // 0 Sun … 6 Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const mondayUtc = Date.UTC(year, month - 1, day + mondayOffset);
  const mon = new Date(mondayUtc);
  const sun = new Date(Date.UTC(year, month - 1, day + mondayOffset + 6));
  const mY = mon.getUTCFullYear();
  const mM = mon.getUTCMonth() + 1;
  const mD = mon.getUTCDate();
  const sY = sun.getUTCFullYear();
  const sM = sun.getUTCMonth() + 1;
  const sD = sun.getUTCDate();
  return {
    from: zonedDateTimeToUtc(mY, mM, mD, 0, 0, 0, 0, timeZone),
    to: zonedDateTimeToUtc(sY, sM, sD, 23, 59, 59, 999, timeZone),
    label: `${dayLabel(mY, mM, mD)} – ${dayLabel(sY, sM, sD)}`,
  };
}

function calendarQuarterRange(
  year: number,
  quarter: 1 | 2 | 3 | 4,
  timeZone: string
): DateRange {
  const startMonthIndex = (quarter - 1) * 3; // 0-indexed
  const endMonthIndex = startMonthIndex + 2;
  const from = zonedDateTimeToUtc(year, startMonthIndex + 1, 1, 0, 0, 0, 0, timeZone);
  const lastDay = new Date(Date.UTC(year, endMonthIndex + 1, 0)).getUTCDate();
  const to = zonedDateTimeToUtc(
    year,
    endMonthIndex + 1,
    lastDay,
    23,
    59,
    59,
    999,
    timeZone
  );
  const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return {
    from,
    to,
    label: `Q${quarter} ${year} (${monthShort[startMonthIndex]}–${monthShort[endMonthIndex]})`,
  };
}

/**
 * Infer a date range from the user query in the company timezone.
 * Priority: today/yesterday/week → FY tokens → named month → this/last month/quarter →
 * only then default “sales/receipts” to current month.
 */
export function parseNovaDateRange(
  query: string,
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): DateRange | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const cal = getCalendarDateInTimezone(now, timeZone);

  if (/\b(today|todays|today'?s)\b/.test(q)) {
    return dayRangeInTz(now, timeZone);
  }
  // Longer phrases before bare yesterday/tomorrow
  if (/\b(day\s+before\s+yesterday|parso)\b/.test(q)) {
    const todayNoon = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, timeZone);
    const parsoNoon = new Date(todayNoon.getTime() - 2 * 24 * 60 * 60 * 1000);
    return dayRangeInTz(parsoNoon, timeZone);
  }
  if (/\b(day\s+after\s+tomorrow)\b/.test(q)) {
    const todayNoon = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, timeZone);
    const datNoon = new Date(todayNoon.getTime() + 2 * 24 * 60 * 60 * 1000);
    return dayRangeInTz(datNoon, timeZone);
  }
  if (/\b(yesterday|yesterdays|yesterday'?s)\b/.test(q)) {
    const todayNoon = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, timeZone);
    const yestNoon = new Date(todayNoon.getTime() - 24 * 60 * 60 * 1000);
    return dayRangeInTz(yestNoon, timeZone);
  }
  if (/\b(tomorrow)\b/.test(q)) {
    const todayNoon = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, timeZone);
    const tomNoon = new Date(todayNoon.getTime() + 24 * 60 * 60 * 1000);
    return dayRangeInTz(tomNoon, timeZone);
  }

  if (/\b(this\s+week|current\s+week)\b/.test(q)) {
    return weekRangeContaining(now, timeZone);
  }
  if (/\blast\s+week\b/.test(q)) {
    const todayNoon = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, timeZone);
    const lastWeek = new Date(todayNoon.getTime() - 7 * 24 * 60 * 60 * 1000);
    return weekRangeContaining(lastWeek, timeZone);
  }
  if (/\b(next\s+week|coming\s+week)\b/.test(q)) {
    const todayNoon = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, timeZone);
    const nextWeek = new Date(todayNoon.getTime() + 7 * 24 * 60 * 60 * 1000);
    return weekRangeContaining(nextWeek, timeZone);
  }

  if (
    /\b(this\s+fy|current\s+fy|this\s+financial\s+year|current\s+financial\s+year|this\s+fin\s*year)\b/.test(
      q
    )
  ) {
    return currentIndianFyRange(now, timeZone);
  }
  const fyToken = parseIndianFyToken(q, timeZone);
  if (fyToken) return fyToken;

  if (/\b(this\s+quarter|current\s+quarter|tis\s+quarter)\b/.test(q)) {
    const qtr = (Math.floor((cal.month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
    return calendarQuarterRange(cal.year, qtr, timeZone);
  }
  if (/\b(last\s+quarter|previous\s+quarter)\b/.test(q)) {
    const thisQ = Math.floor((cal.month - 1) / 3) + 1;
    if (thisQ === 1) return calendarQuarterRange(cal.year - 1, 4, timeZone);
    return calendarQuarterRange(cal.year, (thisQ - 1) as 1 | 2 | 3 | 4, timeZone);
  }
  if (/\b(next\s+quarter|coming\s+quarter)\b/.test(q)) {
    const thisQ = Math.floor((cal.month - 1) / 3) + 1;
    if (thisQ === 4) return calendarQuarterRange(cal.year + 1, 1, timeZone);
    return calendarQuarterRange(cal.year, (thisQ + 1) as 1 | 2 | 3 | 4, timeZone);
  }

  if (/\b(this\s+month|current\s+month|tis\s+month|dis\s+month|thismonth)\b/.test(q)) {
    return monthRangeInTz(cal.year, cal.month - 1, timeZone);
  }
  if (/\b(last\s+month|previous\s+month|lastmonth)\b/.test(q)) {
    const lm = cal.month === 1 ? 12 : cal.month - 1;
    const ly = cal.month === 1 ? cal.year - 1 : cal.year;
    return monthRangeInTz(ly, lm - 1, timeZone);
  }
  if (/\b(next\s+month|coming\s+month)\b/.test(q)) {
    const nm = cal.month === 12 ? 1 : cal.month + 1;
    const ny = cal.month === 12 ? cal.year + 1 : cal.year;
    return monthRangeInTz(ny, nm - 1, timeZone);
  }
  // In emPOWER, “this year” means Indian FY unless the user says calendar year.
  if (/\bcalendar\s+year\b/.test(q)) {
    return {
      from: zonedDateTimeToUtc(cal.year, 1, 1, 0, 0, 0, 0, timeZone),
      to: zonedDateTimeToUtc(cal.year, 12, 31, 23, 59, 59, 999, timeZone),
      label: `Calendar ${cal.year}`,
    };
  }
  if (/\b(this\s+year|current\s+year)\b/.test(q)) {
    return currentIndianFyRange(now, timeZone);
  }

  for (const [name, idx] of Object.entries(MONTHS)) {
    const re = new RegExp(`\\b${name}\\b(?:\\s+(\\d{4}))?`, "i");
    const m = q.match(re);
    if (!m) continue;
    let useYear = cal.year;
    if (m[1]) {
      useYear = parseInt(m[1], 10);
    } else if (idx > cal.month - 1) {
      useYear = cal.year - 1;
    }
    return monthRangeInTz(useYear, idx, timeZone);
  }

  if (/\b(sales|revenue|billed|invoiced|collections?|receipts?|turnover|total)\b/.test(q)) {
    return monthRangeInTz(cal.year, cal.month - 1, timeZone);
  }

  if (/\bmonth\b/.test(q) && /\b(this|current|last)\b/.test(q)) {
    if (/\blast\b/.test(q)) {
      const lm = cal.month === 1 ? 12 : cal.month - 1;
      const ly = cal.month === 1 ? cal.year - 1 : cal.year;
      return monthRangeInTz(ly, lm - 1, timeZone);
    }
    return monthRangeInTz(cal.year, cal.month - 1, timeZone);
  }

  return null;
}

/**
 * Strip ask/summary filler so “summarize sales” / “sales summary” / “show me billing”
 * collapse to the same bare money word as “sales” / “billing”.
 */
export function novaCoreMoneyAsk(query: string): string {
  let t = query.trim().toLowerCase();
  t = t.replace(/^(please|pls|just|kindly)\s+/i, "");
  t = t.replace(
    /^(summaris[ee]|summarize|show|list|give|tell|get|check|report|display|find|fetch|pull)(\s+me)?\s+(the\s+)?/i,
    ""
  );
  t = t.replace(/\s+(please|pls|total|numbers?|summary|summaries|overview|report)$/i, "");
  return t.trim();
}

/** True when the ask is a money topic with no explicit period (needs FY / month / today). */
export function isNovaPeriodAmbiguousMoneyAsk(query: string): boolean {
  const t = query.trim();
  if (!t) return false;
  if (novaBareMoneyWordPattern().test(t)) return true;
  if (/^(sales|revenue|receipts?|collections?|turnover|billing|invoices?)\s+(please|pls|total|numbers?)?$/i.test(t)) {
    return true;
  }
  const core = novaCoreMoneyAsk(t);
  return novaBareMoneyWordPattern().test(core);
}

const ATTENDANCE_ASK_RE =
  /\b(late\s*comers?|latecomers|attendance|who\s+(is|was|were)\s+late|came\s+late|late\s+minutes|absentees?|who\s+(is|was|were)\s+absent|who\s+(is|was|were)\s+present|present\s+today)\b/i;

/** Bare `late` counts as attendance ask unless payment/fee conflict (R1/R4). */
function isAttendanceLateAsk(query: string): boolean {
  const t = query.trim();
  if (!t) return false;
  if (ATTENDANCE_ASK_RE.test(t)) return true;
  if (/\blate\b/i.test(t) && !/\b(late\s+payment|late\s+fee|late\s+charge|payment\s+late)\b/i.test(t)) {
    return true;
  }
  return false;
}

const LEAVE_ASK_RE =
  /\b(leave|leaves|leave\s+balance|cl\b|el\b|sl\b|casual\s+leave|earned\s+leave|sick\s+leave)\b/i;

const KPI_ASK_RE = /\b(kpi|performance\s+score|performance\s+rating)\b/i;

const GRN_ASK_RE = /\b(grn|goods\s+receipt|material\s+receipts?)\b/i;

const EXPENSE_ASK_RE =
  /\b(expenses?|staff\s+expenses?|manual\s+expenses?|expense\s+summary)\b/i;

const EXPLICIT_PERIOD_TOKEN_RE =
  /\b(today|yesterday|tomorrow|week|month|quarter|year|fy|\d{2}\s*[-–/]\s*\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|parso|day\s+before\s+yesterday)\b/i;

/** True when attendance/late ask has no explicit period (needs today / week / month). */
export function isNovaPeriodAmbiguousAttendanceAsk(query: string): boolean {
  const t = query.trim();
  if (!t || !isAttendanceLateAsk(t)) return false;
  if (EXPLICIT_PERIOD_TOKEN_RE.test(t)) return false;
  return true;
}

/**
 * Bare leave usage asks without a period — silent FY is dangerous.
 * Queue-only “pending leave” / “upcoming leave” do not need a calendar period.
 */
export function isNovaPeriodAmbiguousLeaveAsk(query: string): boolean {
  const t = query.trim();
  if (!t || !LEAVE_ASK_RE.test(t)) return false;
  if (EXPLICIT_PERIOD_TOKEN_RE.test(t)) return false;
  if (/^\s*(pending|upcoming)\s+leave\b/i.test(t) || /\b(pending|upcoming)\s+leave\s*(please|pls)?\s*$/i.test(t)) {
    return false;
  }
  // Point-in-time balance snapshot — no calendar period required (suggest chip)
  if (/\bleave\s+balance\b/i.test(t)) return false;
  return true;
}

/**
 * Bare KPI asks default to the latest KPI period (matches kpi_summary tool).
 * Only return true if we later need an explicit period gate — currently never.
 */
export function isNovaPeriodAmbiguousKpiAsk(query: string): boolean {
  const t = query.trim();
  if (!t || !KPI_ASK_RE.test(t)) return false;
  // Tool executor already picks default_latest_kpi_period — do not period-clarify loop.
  return false;
}

/** Bare GRN asks defaulting to silent month. */
export function isNovaPeriodAmbiguousGrnAsk(query: string): boolean {
  const t = query.trim();
  if (!t || !GRN_ASK_RE.test(t)) return false;
  if (EXPLICIT_PERIOD_TOKEN_RE.test(t)) return false;
  return true;
}

/** Bare expense asks defaulting to silent month. */
export function isNovaPeriodAmbiguousExpenseAsk(query: string): boolean {
  const t = query.trim();
  if (!t || !EXPENSE_ASK_RE.test(t)) return false;
  if (EXPLICIT_PERIOD_TOKEN_RE.test(t)) return false;
  return true;
}

/** Query (after normalize) clearly asks for a single calendar day. */
export function queryHasDayPeriodIntent(query: string): boolean {
  return /\b(today|yesterday|tomorrow|day\s+before\s+yesterday|parso)\b/i.test(query.trim());
}

/** Fact period label that is clearly a single calendar day (short or long month). */
const SINGLE_DAY_PERIOD_RE =
  /^\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}$/i;

/** Day token inside prose — accepts "20 Jul" and "20 July". */
const DAY_LABEL_IN_PROSE_RE =
  /\b\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;

/** Full day date inside prose — strip before month-claim checks ("20 July 2026" ≠ July 2026). */
const FULL_DAY_DATE_IN_PROSE_RE =
  /\b\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{4}\b/gi;

export function factPeriodLooksLikeSingleDay(period: unknown): boolean {
  if (typeof period !== "string" || !period.trim()) return false;
  return SINGLE_DAY_PERIOD_RE.test(period.trim());
}

/** Fact period label that is clearly wider than a single day (month / FY / week span). */
export function factPeriodLooksWiderThanDay(period: unknown): boolean {
  if (typeof period !== "string" || !period.trim()) return false;
  const p = period.trim();
  if (factPeriodLooksLikeSingleDay(p)) return false;
  if (/^FY\s/i.test(p)) return true;
  if (/^Calendar\s+\d{4}$/i.test(p)) return true;
  if (
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i.test(
      p
    )
  ) {
    return true;
  }
  // Week / multi-day labels use an en-dash or " - "
  if (/[–—]/.test(p) || /\s+-\s+/.test(p)) return true;
  return false;
}

function factHasDayGrain(
  facts: { ok: boolean; denied?: boolean; data?: Record<string, unknown> | null }[]
): boolean {
  return facts.some((f) => {
    if (!f.ok || f.denied || !f.data) return false;
    if (f.data.periodGrain === "day") return true;
    const period = f.data.period ?? f.data.completedPeriod;
    return factPeriodLooksLikeSingleDay(period);
  });
}

/**
 * Period fidelity guard (money-guard twin): day intent must not ship month/FY narratives.
 * Returns false when any successful fact period is wider than a day while the query asked for a day,
 * or when the LLM answer prose claims a month/FY while the ask was a single day.
 *
 * Day-shaped labels like "20 July 2026" must not be treated as month claims — LLMs often expand
 * short ERP labels ("20 Jul 2026") to the long month form.
 */
export function llmPreservesPeriodIntent(
  query: string,
  facts: { ok: boolean; denied?: boolean; data?: Record<string, unknown> | null }[],
  answerText?: string
): boolean {
  if (!queryHasDayPeriodIntent(query)) return true;
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    const grain = f.data.periodGrain;
    if (grain === "day") continue;
    const period = f.data.period ?? f.data.completedPeriod;
    if (factPeriodLooksLikeSingleDay(period)) continue;
    if (factPeriodLooksWiderThanDay(period)) return false;
  }
  // LLM prose claiming month/FY on a day ask (even when facts are day-grain)
  if (answerText && answerText.trim()) {
    // Strip single-day dates first so "20 July 2026" does not look like "July 2026".
    const a = answerText.trim().replace(FULL_DAY_DATE_IN_PROSE_RE, " ");
    if (
      /\b(for\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/i.test(
        a
      ) ||
      /\bFY\s*\d{2}\s*[-–/]\s*\d{2}\b/i.test(a) ||
      /\b(this|last|entire)\s+month\b/i.test(a) ||
      /\bmonthly\s+(total|sales|receipts|summary)\b/i.test(a)
    ) {
      // Allow if the day label also appears in the original answer (e.g. "10 Jul 2026 in July")
      const dayFactsOk = factHasDayGrain(facts);
      if (!dayFactsOk || !DAY_LABEL_IN_PROSE_RE.test(answerText)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * When the query is too vague to answer safely, return a short clarifying question.
 */
export function isNovaBarePeriodOnlyAsk(query: string): boolean {
  const t = query.trim().toLowerCase();
  if (!t) return false;
  // Has a clear metric / domain word → not bare period
  // Keep aligned with nova-intent isBarePeriodOnly + lexicon domains
  if (
    /\b(sales|revenue|receipts?|collections?|turnover|billing|invoices?|late|absent|attendance|tasks?|kpi|leave|grn|expenses?|kharcha|stock|deliver(?:y|ies)|delay(?:s|ed)?|dispatch(?:es)?|challans?|bank|approvals?|pending|overdue|projects?|vendors?|customers?|payments?|payment\s+requests?|target|order\s*book|activit(?:y|ies)|overview|dashboard|summary|comers?|salary|payroll|payslips?|incentives?|advances?|bonus|quotations?|quotes?|tally|profitability|reconcil)\b/i.test(
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
  // Short period phrases only
  if (parseNovaDateRange(t) && t.split(/\s+/).length <= 3 && !/\b(for|of|about|from|and)\b/.test(t)) {
    return true;
  }
  return false;
}

export function novaAmbiguityClarification(
  query: string,
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE,
  user?: SessionUser | null
): string | null {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) {
    return "What would you like to know? Try “today receipts”, “FY 26-27 sales”, “late comers this week”, or “help”.";
  }

  const metricChips = () => {
    const chips = filterNovaClarifyChipsForUser(user, NOVA_METRIC_CONFIRM_CHIPS);
    return chips.length > 0 ? chips : null;
  };
  const pendingChips = () => {
    const chips = filterNovaClarifyChipsForUser(user, NOVA_PENDING_CONFIRM_CHIPS);
    return chips.length > 0 ? chips : null;
  };
  const entityMetricChips = () => {
    const chips = filterNovaClarifyChipsForUser(user, NOVA_ENTITY_METRIC_CONFIRM_CHIPS);
    return chips.length > 0 ? chips : null;
  };
  const noAccessClarify =
    "I couldn’t find a metric you’re allowed to ask about here. Try **help** or **what can I access**.";

  // Vague “finance report” → real skill menu (not entity resolve / catalog wall)
  if (/^finance\s+reports?$/i.test(q.trim()) || /^financial\s+reports?$/i.test(q.trim())) {
    const chips = filterNovaClarifyChipsForUser(user, NOVA_FINANCE_REPORT_CONFIRM_CHIPS);
    if (!chips.length) return noAccessClarify;
    return formatNovaClarifyCard(buildFinanceReportClarifyCard(chips));
  }

  if (/^pending$/i.test(q.trim()) || /^pending\s+(please|pls)$/i.test(q.trim())) {
    const chips = pendingChips();
    if (!chips) return noAccessClarify;
    return formatNovaClarifyCard(buildPendingClarifyCard(chips));
  }

  // Bare company / party name with no metric — ask instead of inventing month sales
  {
    const bare = extractNovaBareEntityCandidate(q);
    if (bare) {
      const chips = entityMetricChips();
      if (!chips) return noAccessClarify;
      return formatNovaClarifyCard(buildEntityMetricClarifyCard(bare, chips));
    }
  }

  if (isNovaBarePeriodOnlyAsk(q)) {
    const r = parseNovaDateRange(q, now, timeZone);
    const chips = metricChips();
    if (!chips) return noAccessClarify;
    return formatNovaClarifyCard(buildMetricClarifyCard(r?.label ?? q, chips));
  }

  if (parseNovaDateRange(q, now, timeZone) && !isOnlyMoneyWordWithDefaultMonth(q, now, timeZone)) {
    return null;
  }

  if (isNovaPeriodAmbiguousMoneyAsk(q)) {
    const fy = currentIndianFyRange(now, timeZone).label;
    const cal = getCalendarDateInTimezone(now, timeZone);
    const month = monthRangeInTz(cal.year, cal.month - 1, timeZone).label;
    const metric = /\breceipts?\b|\bcollections?\b/.test(q) ? "receipts" : "sales";
    return formatNovaClarifyCard(
      buildPeriodClarifyCard(`${metric}`, [
        { id: fy, label: fy, type: "period" },
        { id: month, label: month, type: "period" },
        { id: "today", label: "today", type: "period" },
      ])
    );
  }

  if (isNovaPeriodAmbiguousAttendanceAsk(q)) {
    return formatNovaClarifyCard(buildPeriodClarifyCard("attendance"));
  }

  if (isNovaPeriodAmbiguousLeaveAsk(q)) {
    const fy = currentIndianFyRange(now, timeZone).label;
    const cal = getCalendarDateInTimezone(now, timeZone);
    const month = monthRangeInTz(cal.year, cal.month - 1, timeZone).label;
    return formatNovaClarifyCard(
      buildPeriodClarifyCard("leave", [
        { id: month, label: month, type: "period" },
        { id: fy, label: fy, type: "period" },
        { id: "pending only", label: "pending only", type: "period" },
      ])
    );
  }

  if (isNovaPeriodAmbiguousKpiAsk(q)) {
    // KPI may silently use latest once chosen — still confirm period chip first when ambiguous
    return formatNovaClarifyCard(
      buildPeriodClarifyCard("KPI", [
        { id: "latest period", label: "latest period", type: "period" },
        { id: "this month", label: "this month", type: "period" },
        { id: "named KPI cycle", label: "named KPI cycle", type: "period" },
      ])
    );
  }

  if (isNovaPeriodAmbiguousGrnAsk(q)) {
    const cal = getCalendarDateInTimezone(now, timeZone);
    const month = monthRangeInTz(cal.year, cal.month - 1, timeZone).label;
    return formatNovaClarifyCard(
      buildPeriodClarifyCard("GRN / material receipts", [
        { id: month, label: month, type: "period" },
        { id: "this week", label: "this week", type: "period" },
        { id: "today", label: "today", type: "period" },
      ])
    );
  }

  if (isNovaPeriodAmbiguousExpenseAsk(q)) {
    const cal = getCalendarDateInTimezone(now, timeZone);
    const month = monthRangeInTz(cal.year, cal.month - 1, timeZone).label;
    const fy = currentIndianFyRange(now, timeZone).label;
    return formatNovaClarifyCard(
      buildPeriodClarifyCard("expenses", [
        { id: month, label: month, type: "period" },
        { id: fy, label: fy, type: "period" },
        { id: "today", label: "today", type: "period" },
      ])
    );
  }

  if (/^(\d{2}\s*[-–/]\s*\d{2}|fy\s*\d{2}\s*[-–/]\s*\d{2}|this\s+fy)$/i.test(q.trim())) {
    const chips = filterNovaClarifyChipsForUser(user, [
      { id: "sales", label: "sales", type: "metric" as const },
      { id: "receipts", label: "receipts", type: "metric" as const },
      { id: "something else", label: "something else", type: "other" as const },
    ]);
    if (!chips.length) return noAccessClarify;
    return formatNovaClarifyCard(
      buildMetricClarifyCard(parseIndianFyToken(q, timeZone)?.label ?? q, chips)
    );
  }

  return null;
}

function isOnlyMoneyWordWithDefaultMonth(q: string, now: Date, timeZone: string): boolean {
  if (!novaMoneyWordPattern().test(q)) {
    return false;
  }
  if (
    /\b(today|yesterday|week|month|year|fy|\d{2}\s*[-–/]\s*\d{2}|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/.test(
      q
    )
  ) {
    return false;
  }
  const r = parseNovaDateRange(q, now, timeZone);
  if (!r) return false;
  const cal = getCalendarDateInTimezone(now, timeZone);
  const cur = monthRangeInTz(cal.year, cal.month - 1, timeZone);
  return r.label === cur.label;
}

/** Default current-month range in app timezone (tool fallbacks). */
export function novaCurrentMonthRange(
  now = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): DateRange {
  const cal = getCalendarDateInTimezone(now, timeZone);
  return monthRangeInTz(cal.year, cal.month - 1, timeZone);
}

/** Start of “today” in app timezone (for overdue / due-date cutoffs). */
export function novaTodayStart(now = new Date(), timeZone: string = DEFAULT_TIMEZONE): Date {
  return getDayBoundsInTimezone(timeZone, now).start;
}

/** Calendar day bounds for an arbitrary instant in app timezone. */
export function novaDayBoundsFor(ref: Date, timeZone: string = DEFAULT_TIMEZONE): {
  start: Date;
  end: Date;
} {
  const { start, end } = getDayBoundsInTimezone(timeZone, ref);
  return { start, end };
}
