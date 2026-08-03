/**
 * Soft-fail settle helpers — never map lookup failures to 0 / empty as success.
 */

export type SettleResult<T> = { ok: true; value: T } | { ok: false };

export async function settlePromise<T>(promise: Promise<T>): Promise<SettleResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}
