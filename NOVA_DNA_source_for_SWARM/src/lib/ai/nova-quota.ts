/**
 * NOVA usage quotas, history redaction, concurrency, and query-log retention helpers.
 */

const DEFAULT_DAILY_QUOTA = 120;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_CONCURRENT_PER_USER = 1;

/** In-process per-user in-flight slots (NOVA-09). Multi-replica: soft limit per instance. */
const novaInflightByUser = new Map<string, number>();

export function novaDailyQuotaLimit(): number {
  const raw = Number(process.env.NOVA_DAILY_QUOTA || DEFAULT_DAILY_QUOTA);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_DAILY_QUOTA;
  return Math.min(Math.floor(raw), 10_000);
}

/** Max concurrent NOVA answers per user (default 1). Override with NOVA_MAX_CONCURRENT_PER_USER. */
export function novaConcurrentLimit(): number {
  const raw = Number(process.env.NOVA_MAX_CONCURRENT_PER_USER || DEFAULT_CONCURRENT_PER_USER);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_CONCURRENT_PER_USER;
  return Math.min(Math.floor(raw), 8);
}

/** Try to reserve a concurrency slot. Caller must release in finally. */
export function tryAcquireNovaSlot(userId: string): boolean {
  const limit = novaConcurrentLimit();
  const cur = novaInflightByUser.get(userId) ?? 0;
  if (cur >= limit) return false;
  novaInflightByUser.set(userId, cur + 1);
  return true;
}

export function releaseNovaSlot(userId: string): void {
  const cur = novaInflightByUser.get(userId) ?? 0;
  if (cur <= 1) novaInflightByUser.delete(userId);
  else novaInflightByUser.set(userId, cur - 1);
}

/** Test helper — clear in-flight map. */
export function resetNovaConcurrencyForTests(): void {
  novaInflightByUser.clear();
}

export function novaQueryLogRetentionDays(): number {
  const raw = Number(process.env.NOVA_QUERY_LOG_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.floor(raw), 3650);
}

/** Light redaction for client-supplied chat history before it reaches the model. */
export function redactNovaHistoryText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:\+?\d[\d\s\-()]{8,}\d)\b/g, "[phone]")
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[card]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[pan]")
    .slice(0, 800);
}

export function redactNovaQueryForLog(query: string): string {
  return redactNovaHistoryText(query).slice(0, 1000);
}
