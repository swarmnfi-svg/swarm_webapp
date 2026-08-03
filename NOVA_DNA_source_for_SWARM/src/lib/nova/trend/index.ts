/**
 * NOVA Trend — public barrel.
 */
export {
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
  type NovaTrendDomain,
  type NovaTrendGrain,
  type NovaTrendRanking,
  type NovaTrendResult,
  type NovaTrendSeriesPoint,
  type NovaTrendWindow,
} from "@/lib/nova/trend/contract";
export { isNovaTrendCue, inferNovaTrendDomain } from "@/lib/nova/trend/domain";
export {
  NOVA_TREND_PARTY_MATRIX,
  trendPartySupport,
  trendTaskPartyScopeFromCtx,
} from "@/lib/nova/trend/party-scope";
export {
  bindNovaTrendWindow,
  inferNovaTrendGrain,
  formatBucketKey,
  novaTrendPrismaDays,
} from "@/lib/nova/trend/window";
export {
  rankNovaTrendEntities,
  buildNovaTrendSeries,
  sparklineFromSeries,
} from "@/lib/nova/trend/rank";
export { formatNovaTrendDeterministic } from "@/lib/nova/trend/format";
export { runNovaTrend } from "@/lib/nova/trend/engine";
export { isTaskCompletedAfterDue } from "@/lib/nova/trend/adapters/task-late-completion";
export {
  invoiceOutstandingAsOf,
  agingDaysAsOf,
  preferArAgingGrain,
  AR_TREND_OVERDUE_DAYS,
} from "@/lib/nova/trend/adapters/ar-aging";
export {
  kpiTrendWindowDays,
  wantsKpiHighStreak,
  kpiHighScoreTrailingStreak,
  KPI_HIGH_SCORE_FLOOR,
} from "@/lib/nova/trend/adapters/kpi-score";
export {
  NOVA_TREND_MEASURE_REGISTRY,
  listNovaTrendMeasures,
  findNovaTrendMeasure,
  type NovaTrendMeasureDef,
  type NovaTrendMeasureStatus,
} from "@/lib/nova/trend/measures";
