/**
 * Shared NOVA LLM error classification + user-facing copy for chat and Reader.
 * Keeps 429/503 from looking like a silent hang or generic "try again".
 */

export type NovaLlmErrorKind =
  | "rate_limited"
  | "unavailable"
  | "deadline"
  | "not_configured"
  | "generic";

export type NovaLlmErrorSurface = "chat" | "reader";

export function classifyNovaLlmError(err: unknown): NovaLlmErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  if (/NOT_CONFIGURED/i.test(msg)) return "not_configured";
  if (
    /NOVA_LLM_HTTP_429|HTTP_429|\b429\b|rate.?limit|RESOURCE_EXHAUSTED|over.?quota|quota.?exceed/i.test(
      msg
    )
  ) {
    return "rate_limited";
  }
  if (
    /NOVA_LLM_HTTP_503|NOVA_LLM_HTTP_502|NOVA_LLM_HTTP_504|HTTP_50[234]|UNAVAILABLE|high.?demand/i.test(
      msg
    )
  ) {
    return "unavailable";
  }
  if (/GLOBAL_DEADLINE|timeout|AbortError|\babort\b/i.test(msg)) return "deadline";
  return "generic";
}

/** Suggested client cooldown after a classified failure (ms). */
export function novaLlmSuggestedRetryMs(kind: NovaLlmErrorKind): number {
  if (kind === "rate_limited") return 45_000;
  if (kind === "unavailable" || kind === "deadline") return 12_000;
  return 0;
}

export function novaLlmErrorUserMessage(
  err: unknown,
  opts?: { surface?: NovaLlmErrorSurface }
): string {
  const surface = opts?.surface ?? "chat";
  switch (classifyNovaLlmError(err)) {
    case "rate_limited":
      return surface === "reader"
        ? "NOVA Reader is rate-limited across AI providers right now. Wait about a minute and retry, or upload a PDF with a text layer."
        : "NOVA AI is temporarily rate-limited (provider quota). Wait about a minute and try again.";
    case "unavailable":
      return surface === "reader"
        ? "NOVA Reader providers are temporarily unavailable (high demand). Retry shortly, or try a text-layer PDF."
        : "NOVA AI providers are temporarily unavailable (high demand). Wait a moment and try again.";
    case "deadline":
      return surface === "reader"
        ? "NOVA Reader timed out across providers. Wait a moment and try again."
        : "NOVA took too long across providers. Wait a moment and try again.";
    case "not_configured":
      return "NOVA LLM keys are not configured. Ask an admin to set Groq / Gemini / OpenRouter keys.";
    default:
      return surface === "reader"
        ? "NOVA Reader could not finish reading. Try again shortly."
        : "NOVA AI could not answer right now. Try again.";
  }
}

/** True when a prior user-facing error implies a short client cooldown. */
export function isNovaLlmBackoffUserMessage(text: string): boolean {
  return /rate-limited|provider quota|high demand|Wait about a minute|timed out across providers|took too long across providers/i.test(
    text
  );
}

export function novaLlmBackoffMsFromUserMessage(text: string): number {
  if (/rate-limited|provider quota|Wait about a minute/i.test(text)) return 45_000;
  if (/high demand|timed out|took too long/i.test(text)) return 12_000;
  return 0;
}
