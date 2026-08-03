/**
 * NOVA data-freshness / report trust warnings.
 * Surfaces when facts may be stale (cache age, provider failovers, report “as of”).
 * Role-adaptive copy; never opens free SQL — catalog facts + timestamps only.
 */

import type { NovaPackWarning } from "@/lib/nova/pack-result";

/** Soft SLA: older than this → mild “may be aging” note. */
export const NOVA_FRESHNESS_SOFT_MS = 15 * 60 * 1000;
/** Hard SLA: older than this → stale warning. */
export const NOVA_FRESHNESS_STALE_MS = 60 * 60 * 1000;
/** Saved report snapshot: warn regenerate after this age. */
export const NOVA_REPORT_STALE_MS = 24 * 60 * 60 * 1000;

export type NovaFreshnessAudience = "staff" | "ops" | "finance" | "director";

export type NovaTrustWarningKind =
  | "stale_facts"
  | "cache_age"
  | "provider_failover"
  | "report_as_of"
  | "live_unfrozen";

export type NovaTrustWarning = {
  kind: NovaTrustWarningKind;
  code: "freshness";
  severity: "info" | "warn";
  message: string;
  ageMs?: number;
  source?: string;
};

const FAILOVER_TOOL_TAGS = new Set([
  "llm_rate_limited",
  "llm_fallback_facts",
  "llm_unavailable",
  "llm_deadline",
]);

export function audienceFromRole(role: string | null | undefined): NovaFreshnessAudience {
  const r = (role ?? "").toUpperCase();
  if (r === "DIRECTOR" || r === "SUPER_ADMIN") return "director";
  if (r === "ADMIN" || r === "ACCOUNTANT") return "finance";
  if (r === "MANAGER") return "ops";
  return "staff";
}

export function ageMsFromIso(
  iso: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!iso || typeof iso !== "string") return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, nowMs - t);
}

/** Absolute “as of” label for report footers (locale-light, IST-friendly). */
export function formatNovaDataAsOfAbsolute(
  iso: string | null | undefined,
  timeZone = "Asia/Kolkata"
): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  try {
    return new Date(t).toLocaleString("en-IN", {
      timeZone,
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(t).toISOString();
  }
}

function formatAgeHuman(ageMs: number): string {
  const sec = Math.floor(ageMs / 1000);
  if (sec < 90) return "under 2 minutes";
  if (sec < 3600) return `${Math.floor(sec / 60)} min`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} hour${sec >= 7200 ? "s" : ""}`;
  const days = Math.floor(sec / 86400);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function failoverSignals(toolsUsed: string[] | undefined): string[] {
  if (!toolsUsed?.length) return [];
  return toolsUsed.filter((t) => FAILOVER_TOOL_TAGS.has(t));
}

/**
 * Build trust warnings for chat footers, pack notes, and My reports.
 * Empty when nothing material — no theatre warnings on fresh live reads.
 */
export function buildNovaTrustWarnings(input: {
  dataAsOf?: string | null;
  /** Explicit skill/cache age when a layer caches facts. */
  cacheAgeMs?: number | null;
  toolsUsed?: string[];
  /** Viewing / referencing an immutable saved report. */
  isSavedReport?: boolean;
  /** Live pack answer not yet snapshotted. */
  isLivePack?: boolean;
  role?: string | null;
  nowMs?: number;
}): NovaTrustWarning[] {
  const now = input.nowMs ?? Date.now();
  const audience = audienceFromRole(input.role);
  const out: NovaTrustWarning[] = [];

  const cacheAge =
    input.cacheAgeMs != null && Number.isFinite(input.cacheAgeMs)
      ? Math.max(0, input.cacheAgeMs)
      : null;
  const dataAge = ageMsFromIso(input.dataAsOf, now);
  const effectiveAge = cacheAge != null ? Math.max(cacheAge, dataAge ?? 0) : dataAge;

  if (cacheAge != null && cacheAge >= NOVA_FRESHNESS_SOFT_MS) {
    const detail =
      audience === "staff"
        ? "Some figures may be slightly out of date — ask again to refresh."
        : audience === "director" || audience === "finance"
          ? `Cached facts are ${formatAgeHuman(cacheAge)} old — refresh before decisions.`
          : `Cached data age ${formatAgeHuman(cacheAge)} — re-run if you need the latest.`;
    out.push({
      kind: "cache_age",
      code: "freshness",
      severity: cacheAge >= NOVA_FRESHNESS_STALE_MS ? "warn" : "info",
      message: detail,
      ageMs: cacheAge,
      source: "cache",
    });
  } else if (
    !input.isSavedReport &&
    effectiveAge != null &&
    effectiveAge >= NOVA_FRESHNESS_SOFT_MS
  ) {
    const asOf = formatNovaDataAsOfAbsolute(input.dataAsOf);
    const detail =
      audience === "staff"
        ? "These numbers may be outdated — ask again if something looks off."
        : audience === "director"
          ? `Data as of ${asOf ?? "earlier"} (${formatAgeHuman(effectiveAge)} ago) — re-run for live ledger.`
          : `Facts assembled ${formatAgeHuman(effectiveAge)} ago${asOf ? ` (${asOf})` : ""} — refresh if acting on them.`;
    out.push({
      kind: "stale_facts",
      code: "freshness",
      severity: effectiveAge >= NOVA_FRESHNESS_STALE_MS ? "warn" : "info",
      message: detail,
      ageMs: effectiveAge,
      source: "dataAsOf",
    });
  }

  const hops = failoverSignals(input.toolsUsed);
  if (hops.length) {
    const detail =
      audience === "staff" || audience === "ops"
        ? "AI wording used a backup path — ERP totals still come from registered skills."
        : audience === "director"
          ? `Provider failover (${hops.join(", ")}) — numbers remain skill/facts-only; prose may be thinner.`
          : `LLM failover (${hops.join(", ")}) — figures are still from catalog skills, not free SQL.`;
    out.push({
      kind: "provider_failover",
      code: "freshness",
      severity:
        hops.includes("llm_rate_limited") || hops.includes("llm_unavailable") ? "warn" : "info",
      message: detail,
      source: hops[0],
    });
  }

  if (input.isSavedReport) {
    const reportAge = dataAge ?? 0;
    const asOf = formatNovaDataAsOfAbsolute(input.dataAsOf);
    const stale = reportAge >= NOVA_REPORT_STALE_MS;
    const detail =
      audience === "staff"
        ? stale
          ? "This saved report is older — regenerate for today’s figures."
          : "Saved snapshot — not live ERP."
        : stale
          ? `Snapshot as of ${asOf ?? "earlier"} (${formatAgeHuman(reportAge)} old) — regenerate for current data.`
          : `Immutable snapshot as of ${asOf ?? "save time"} — regenerate to refresh.`;
    out.push({
      kind: "report_as_of",
      code: "freshness",
      severity: stale ? "warn" : "info",
      message: detail,
      ageMs: reportAge,
      source: "report",
    });
  } else if (
    input.isLivePack &&
    out.every((w) => w.kind !== "stale_facts" && w.kind !== "cache_age")
  ) {
    // Informational only when live pack is fresh — directors/finance/ops see freeze hint.
    if (audience === "director" || audience === "finance" || audience === "ops") {
      out.push({
        kind: "live_unfrozen",
        code: "freshness",
        severity: "info",
        message:
          audience === "director"
            ? "Live ledger reads at dataAsOf — save a report for an immutable snapshot."
            : "Live figures — save a NOVA report if you need a frozen export.",
        ageMs: effectiveAge ?? 0,
        source: "pack",
      });
    }
  }

  return dedupeTrustWarnings(out);
}

function dedupeTrustWarnings(warnings: NovaTrustWarning[]): NovaTrustWarning[] {
  const seen = new Set<string>();
  const out: NovaTrustWarning[] = [];
  for (const w of warnings) {
    const key = `${w.kind}:${w.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

export function trustWarningsToPackWarnings(
  warnings: NovaTrustWarning[]
): NovaPackWarning[] {
  return warnings.map((w) => ({
    code: w.code,
    message: w.message,
    source: w.source,
  }));
}

/** Short labels for chat provenance (cap 3). */
export function trustWarningLabels(warnings: NovaTrustWarning[]): string[] {
  return warnings.slice(0, 3).map((w) => w.message);
}

/** Max cacheAgeMs across fact payloads (skills may stamp cacheAgeMs). */
export function maxCacheAgeMsFromFacts(
  facts: { ok: boolean; denied?: boolean; data?: Record<string, unknown> | null }[]
): number | null {
  let max: number | null = null;
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    const raw = f.data.cacheAgeMs;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
      max = max == null ? raw : Math.max(max, raw);
    }
  }
  return max;
}
