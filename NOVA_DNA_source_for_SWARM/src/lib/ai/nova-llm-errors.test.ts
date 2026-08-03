import { describe, expect, it } from "vitest";
import {
  classifyNovaLlmError,
  isNovaLlmBackoffUserMessage,
  novaLlmBackoffMsFromUserMessage,
  novaLlmErrorUserMessage,
  novaLlmSuggestedRetryMs,
} from "./nova-llm-errors";

describe("nova-llm-errors", () => {
  it("classifies 429 / quota as rate_limited", () => {
    expect(classifyNovaLlmError(new Error("NOVA_LLM_HTTP_429"))).toBe("rate_limited");
    expect(classifyNovaLlmError(new Error("RESOURCE_EXHAUSTED"))).toBe("rate_limited");
  });

  it("classifies 503 as unavailable", () => {
    expect(classifyNovaLlmError(new Error("NOVA_LLM_HTTP_503"))).toBe("unavailable");
  });

  it("maps chat + reader copy without leaking status codes as the only clue", () => {
    const chat = novaLlmErrorUserMessage(new Error("NOVA_LLM_HTTP_429"), { surface: "chat" });
    expect(chat).toMatch(/rate-limited/i);
    expect(chat).toMatch(/minute/i);

    const reader = novaLlmErrorUserMessage(new Error("NOVA_LLM_HTTP_503"), {
      surface: "reader",
    });
    expect(reader).toMatch(/unavailable|high demand/i);
    expect(reader).toMatch(/PDF|retry/i);
  });

  it("suggests client cooldown for rate limits", () => {
    expect(novaLlmSuggestedRetryMs("rate_limited")).toBeGreaterThanOrEqual(30_000);
    expect(novaLlmSuggestedRetryMs("generic")).toBe(0);
    expect(isNovaLlmBackoffUserMessage("NOVA AI is temporarily rate-limited (provider quota).")).toBe(
      true
    );
    expect(novaLlmBackoffMsFromUserMessage("rate-limited")).toBeGreaterThan(0);
  });
});
