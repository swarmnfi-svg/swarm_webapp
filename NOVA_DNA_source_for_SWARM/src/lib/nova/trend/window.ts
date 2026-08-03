/**
 * Trend window bind — prefer explicit range → parsed rolling/calendar → default 30d.
 */
import {
  getCalendarDateInTimezone,
  prismaDateFromCalendar,
  zonedDateTimeToUtc,
} from "@/lib/datetime-pure";
import { parseNovaDateRange, type DateRange } from "@/lib/ai/nova-dates";
import type { NovaTrendGrain, NovaTrendWindow } from "@/lib/nova/trend/contract";

const DEFAULT_TZ = "Asia/Kolkata";

function daySpan(from: Date, to: Date): number {
  const ms = Math.max(0, to.getTime() - from.getTime());
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
}

/** Grain heuristic: ≤45d day, ≤120d week, else month. */
export function inferNovaTrendGrain(from: Date, to: Date): NovaTrendGrain {
  const days = daySpan(from, to);
  if (days <= 45) return "day";
  if (days <= 120) return "week";
  return "month";
}

function rollingDays(
  days: number,
  now: Date,
  tz: string,
  label: string,
  source: NovaTrendWindow["source"] = "parsed"
): NovaTrendWindow {
  const cal = getCalendarDateInTimezone(now, tz);
  const end = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 23, 59, 59, 999, tz);
  const startCal = getCalendarDateInTimezone(
    new Date(
      zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, tz).getTime() -
        (days - 1) * 24 * 60 * 60 * 1000
    ),
    tz
  );
  const start = zonedDateTimeToUtc(startCal.year, startCal.month, startCal.day, 0, 0, 0, 0, tz);
  return { from: start, to: end, label, source };
}

function fromDateRange(r: DateRange, source: NovaTrendWindow["source"]): NovaTrendWindow {
  return { from: r.from, to: r.to, label: r.label, source };
}

/**
 * Bind trend window for a query.
 * Supports: last/past N days|weeks|months, explicit parseNovaDateRange, else last 30 days.
 */
export function bindNovaTrendWindow(
  query: string,
  opts?: {
    range?: DateRange | null;
    now?: Date;
    tz?: string;
  }
): NovaTrendWindow {
  const tz = opts?.tz ?? DEFAULT_TZ;
  const now = opts?.now ?? new Date();

  if (opts?.range) {
    return fromDateRange(opts.range, "explicit");
  }

  const q = query.trim().toLowerCase();

  const daysM = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/);
  if (daysM) {
    const n = Math.min(366, Math.max(1, parseInt(daysM[1]!, 10)));
    return rollingDays(n, now, tz, `last ${n} day${n === 1 ? "" : "s"}`);
  }
  const weeksM = q.match(/\b(?:last|past|previous)\s+(\d{1,2})\s+weeks?\b/);
  if (weeksM) {
    const n = Math.min(52, Math.max(1, parseInt(weeksM[1]!, 10)));
    return rollingDays(n * 7, now, tz, `last ${n} week${n === 1 ? "" : "s"}`);
  }
  const monthsM = q.match(/\b(?:last|past|previous)\s+(\d{1,2})\s+months?\b/);
  if (monthsM) {
    const n = Math.min(24, Math.max(1, parseInt(monthsM[1]!, 10)));
    return rollingDays(n * 30, now, tz, `last ${n} month${n === 1 ? "" : "s"}`);
  }

  const parsed = parseNovaDateRange(query, now, tz);
  if (parsed) {
    const span = daySpan(parsed.from, parsed.to);
    if (
      span <= 1 &&
      /\b(trend|over\s+time|frequently|always|often)\b/i.test(q)
    ) {
      return rollingDays(30, now, tz, "last 30 days");
    }
    return fromDateRange(parsed, "parsed");
  }

  return rollingDays(30, now, tz, "last 30 days", "default_30d");
}

/** Prisma `@db.Date` values for each calendar day in the window. */
export function novaTrendPrismaDays(window: NovaTrendWindow, tz: string): Date[] {
  const start = prismaDateFromCalendar(getCalendarDateInTimezone(window.from, tz));
  const end = prismaDateFromCalendar(getCalendarDateInTimezone(window.to, tz));
  const days: Date[] = [];
  for (let cur = new Date(start); cur.getTime() <= end.getTime(); ) {
    days.push(new Date(cur));
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate() + 1));
  }
  return days.length ? days : [start];
}

export function formatBucketKey(d: Date, grain: NovaTrendGrain, tz: string): string {
  const cal = getCalendarDateInTimezone(d, tz);
  if (grain === "month") {
    return `${cal.year}-${String(cal.month).padStart(2, "0")}`;
  }
  if (grain === "week") {
    const noon = zonedDateTimeToUtc(cal.year, cal.month, cal.day, 12, 0, 0, 0, tz);
    const dow = noon.getUTCDay();
    const mondayOffset = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(noon.getTime() + mondayOffset * 24 * 60 * 60 * 1000);
    const mcal = getCalendarDateInTimezone(monday, tz);
    return `${mcal.year}-W${String(mcal.month).padStart(2, "0")}${String(mcal.day).padStart(2, "0")}`;
  }
  return `${cal.year}-${String(cal.month).padStart(2, "0")}-${String(cal.day).padStart(2, "0")}`;
}
