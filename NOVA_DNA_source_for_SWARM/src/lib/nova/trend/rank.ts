/**
 * Pure ranking helpers for NOVA Trend.
 */
import type { NovaTrendRanking, NovaTrendSeriesPoint } from "@/lib/nova/trend/contract";

export type RankInput = {
  entityId?: string | null;
  label: string;
  value: number;
  secondary?: string | null;
};

/** Sort by value desc, then label asc; assign 1-based ranks. Cap at `limit`. */
export function rankNovaTrendEntities(rows: RankInput[], limit = 8): NovaTrendRanking[] {
  const sorted = [...rows]
    .filter((r) => Number.isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
    .slice(0, Math.max(1, limit));
  return sorted.map((r, i) => ({
    rank: i + 1,
    entityId: r.entityId ?? null,
    label: r.label,
    value: r.value,
    secondary: r.secondary ?? null,
  }));
}

/** Aggregate event dates into ordered series buckets. */
export function buildNovaTrendSeries(
  eventDates: Date[],
  bucketKey: (d: Date) => string
): NovaTrendSeriesPoint[] {
  const map = new Map<string, number>();
  for (const d of eventDates) {
    const key = bucketKey(d);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, value]) => ({ bucket, value, label: bucket }));
}

/** Compact ASCII sparkline from series values (min→▁ … max→█). */
export function sparklineFromSeries(series: NovaTrendSeriesPoint[]): string | null {
  if (series.length < 3) return null;
  const bars = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const vals = series.map((s) => s.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  return vals
    .map((v) => {
      const idx = Math.min(bars.length - 1, Math.round(((v - min) / span) * (bars.length - 1)));
      return bars[idx]!;
    })
    .join("");
}
