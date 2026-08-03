/**
 * Cheap provenance for fact packs / answers — period, sources, freshness.
 * Person / amount / date in answers must still come from the fact pack itself.
 */

import { formatNovaDataAsOfAbsolute } from "@/lib/nova/freshness-trust";

export type NovaProvenance = {
  period?: string | null;
  sources?: string[];
  /** ISO timestamp when facts were assembled. */
  freshness?: string;
  /** Role-adaptive trust / staleness lines (cache age, failover, report as-of). */
  trustWarnings?: string[];
};

/** UI-facing provenance (period / sources / freshness) for chat footers. */
export type NovaProvenanceDisplay = {
  period: string | null;
  sources: string[];
  freshnessLabel: string | null;
  /** Absolute as-of when useful next to relative freshness. */
  dataAsOfLabel: string | null;
  trustWarnings: string[];
};

export function withFactProvenance(
  data: Record<string, unknown>,
  opts: {
    period?: string | null;
    sources: string[];
    freshness?: string;
  }
): Record<string, unknown> {
  const freshness = opts.freshness ?? new Date().toISOString();
  return {
    ...data,
    ...(opts.period != null && data.period == null ? { period: opts.period } : {}),
    sources: opts.sources,
    freshness,
  };
}

/** Pull provenance from tool facts for the answer payload. */
export function provenanceFromFacts(
  facts: { ok: boolean; denied?: boolean; tool: string; data?: Record<string, unknown> | null }[],
  interpretedAs?: string[]
): NovaProvenance {
  const sources = new Set<string>();
  let period: string | null = null;
  let freshness: string | undefined;

  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    if (!period && typeof f.data.period === "string" && f.data.period.trim()) {
      period = f.data.period;
    }
    const factSources = f.data.sources;
    if (Array.isArray(factSources)) {
      for (const s of factSources) {
        if (typeof s === "string" && s.trim()) sources.add(s.trim());
      }
    } else {
      sources.add(f.tool);
    }
    if (!freshness && typeof f.data.freshness === "string") {
      freshness = f.data.freshness;
    }
  }

  for (const label of interpretedAs ?? []) {
    if (label.trim()) sources.add(label.trim());
  }

  return {
    period,
    sources: sources.size ? [...sources] : undefined,
    freshness: freshness ?? new Date().toISOString(),
  };
}

/** Turn tool ids / lexicon labels into short readable source chips. */
export function humanizeNovaSource(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (s.includes(" ") && !s.includes("_")) return s;
  return s
    .replace(/_summary$/i, "")
    .replace(/_open$/i, "")
    .replace(/_counts$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Relative freshness for chat footers. Returns null when timestamp is missing/invalid.
 * Exported for unit tests.
 */
export function formatNovaFreshnessLabel(
  iso: string | null | undefined,
  nowMs: number = Date.now()
): string | null {
  if (!iso || typeof iso !== "string") return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const deltaSec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (deltaSec < 45) return "just now";
  if (deltaSec < 120) return "1 min ago";
  if (deltaSec < 3600) return `${Math.floor(deltaSec / 60)} min ago`;
  if (deltaSec < 7200) return "1 hour ago";
  if (deltaSec < 86400) return `${Math.floor(deltaSec / 3600)} hours ago`;
  return "earlier today";
}

/** Normalize structured provenance + optional italic fallback line for the chat UI. */
export function toNovaProvenanceDisplay(
  provenance: NovaProvenance | null | undefined,
  opts?: {
    periodLabel?: string | null;
    sourceLineFallback?: string | null;
    nowMs?: number;
  }
): NovaProvenanceDisplay | null {
  const period =
    (typeof provenance?.period === "string" && provenance.period.trim()) ||
    (typeof opts?.periodLabel === "string" && opts.periodLabel.trim()) ||
    null;

  const fromStruct = (provenance?.sources ?? [])
    .map((s) => humanizeNovaSource(String(s)))
    .filter(Boolean);
  const fromLine = (opts?.sourceLineFallback ?? "")
    .split(",")
    .map((s) => humanizeNovaSource(s.trim()))
    .filter(Boolean);

  const seen = new Set<string>();
  const sources: string[] = [];
  for (const s of [...fromStruct, ...fromLine]) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(s);
    if (sources.length >= 6) break;
  }

  const freshnessLabel = formatNovaFreshnessLabel(provenance?.freshness, opts?.nowMs);
  const trustWarnings = (provenance?.trustWarnings ?? [])
    .map((s) => String(s).trim())
    .filter(Boolean)
    .slice(0, 3);
  const dataAsOfLabel = formatNovaDataAsOfAbsolute(provenance?.freshness);

  if (!period && sources.length === 0 && !freshnessLabel && trustWarnings.length === 0) {
    return null;
  }
  return { period, sources, freshnessLabel, dataAsOfLabel, trustWarnings };
}
