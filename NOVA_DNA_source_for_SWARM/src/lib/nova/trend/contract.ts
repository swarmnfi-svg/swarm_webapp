/**
 * NOVA Trend — universal contract (series + rankings over a bound window).
 * Numbers only from adapters; formatters may round, never invent.
 */

export const NOVA_TREND_SCHEMA_VERSION = 1 as const;

export type NovaTrendDomain =
  | "attendance_late"
  | "task_late_completion"
  | "ar_aging"
  | "staff_expense_spend"
  | "kpi_score"
  | "generic";

export type NovaTrendGrain = "day" | "week" | "month";

export type NovaTrendEntity = {
  kind: "person" | "org" | "party" | "project" | "queue";
  id?: string | null;
  label: string;
};

export type NovaTrendMetric = {
  id: string;
  label: string;
  unit: string;
};

export type NovaTrendWindow = {
  from: Date;
  to: Date;
  label: string;
  source: "explicit" | "parsed" | "default_30d";
};

export type NovaTrendSeriesPoint = {
  bucket: string;
  value: number;
  label?: string;
};

export type NovaTrendRanking = {
  rank: number;
  entityId?: string | null;
  label: string;
  value: number;
  secondary?: string | null;
};

export type NovaTrendBundle = {
  schemaVersion: typeof NOVA_TREND_SCHEMA_VERSION;
  domain: NovaTrendDomain;
  entity: NovaTrendEntity;
  metric: NovaTrendMetric;
  window: NovaTrendWindow;
  grain: NovaTrendGrain;
  series: NovaTrendSeriesPoint[];
  rankings: NovaTrendRanking[];
  methodology?: string | null;
  links?: Array<{ title: string; href: string }>;
  empty?: boolean;
  message?: string | null;
};

export type NovaTrendResult = NovaTrendBundle & {
  summary: string;
  findingsFormatted: string;
  primaryNarrative: string;
};
