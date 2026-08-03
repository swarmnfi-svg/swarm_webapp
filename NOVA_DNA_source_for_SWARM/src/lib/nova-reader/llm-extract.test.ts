import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("nova reader vision failover", () => {
  const originalFetch = globalThis.fetch;
  const envKeys = [
    "NOVA_LLM_ENABLED",
    "NOVA_LLM_API_KEY",
    "GROQ_API_KEY",
    "GROQ_API_KEY_2",
    "NOVA_LLM_GROQ_API_KEY_2",
    "NOVA_LLM_BASE_URL",
    "NOVA_LLM_MODEL",
    "NOVA_LLM_FALLBACK_MODEL",
    "NOVA_LLM_PROVIDERS",
    "NOVA_READER_VISION_PROVIDERS",
    "OPENROUTER_API_KEY",
    "OPENROUTER_MODEL",
    "OPENROUTER_VISION_MODEL",
    "GOOGLE_AI_API_KEY",
    "GEMINI_API_KEY",
    "GEMINI_API_KEY_FALLBACK",
    "GEMINI_API_KEY_2",
    "GEMINI_API_KEY_3",
    "NOVA_LLM_GEMINI_API_KEY",
    "NOVA_GEMINI_API_KEY",
    "GEMINI_MODEL",
    "NOVA_LLM_GEMINI_MODEL",
    "GEMINI_BASE_URL",
    "NOVA_LLM_VISION_GROQ_MODEL",
    "NOVA_LLM_VISION_GROQ_MODEL_2",
    "NOVA_LLM_VISION_GROQ_MODEL_FALLBACK",
    "NOVA_LLM_MAX_PROVIDERS",
    "NOVA_LLM_GLOBAL_DEADLINE_MS",
  ];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of envKeys) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("resolveNovaVisionProviders order: gemini → gemini2 → openrouter → groq Scout → groq2", async () => {
    process.env.GROQ_API_KEY = "gsk_1";
    process.env.GROQ_API_KEY_2 = "gsk_2";
    process.env.GEMINI_API_KEY = "gem_1";
    process.env.GEMINI_API_KEY_2 = "gem_2";
    process.env.OPENROUTER_API_KEY = "or_1";
    process.env.NOVA_LLM_MAX_PROVIDERS = "2"; // vision still raises to ≥4

    const { resolveNovaVisionProviders, DEFAULT_VISION_GROQ_MODEL } = await import(
      "@/lib/ai/llm"
    );
    const ids = resolveNovaVisionProviders().map((p) => p.id);
    expect(ids).toEqual(["gemini", "gemini2", "openrouter", "groq"]);
    const groq = resolveNovaVisionProviders().find((p) => p.id === "groq");
    expect(groq?.model).toBe(DEFAULT_VISION_GROQ_MODEL);
    expect(groq?.fallbackModel).toBe("qwen/qwen3.6-27b");
  });

  it("skips missing vision keys gracefully", async () => {
    process.env.GROQ_API_KEY = "gsk_1";
    process.env.GEMINI_API_KEY = "gem_1";
    // no GEMINI_API_KEY_2 / OPENROUTER / GROQ_API_KEY_2
    const { resolveNovaVisionProviders } = await import("@/lib/ai/llm");
    expect(resolveNovaVisionProviders().map((p) => p.id)).toEqual(["gemini", "groq"]);
  });

  it("vision Groq uses Scout not text Llama", async () => {
    process.env.GROQ_API_KEY = "gsk_1";
    process.env.NOVA_LLM_MODEL = "llama-3.3-70b-versatile";
    process.env.NOVA_LLM_VISION_GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
    process.env.NOVA_LLM_VISION_GROQ_MODEL_2 = "qwen/qwen3.6-27b";
    const { resolveNovaLlmProviders, resolveNovaVisionProviders } = await import(
      "@/lib/ai/llm"
    );
    expect(resolveNovaLlmProviders()[0].model).toBe("llama-3.3-70b-versatile");
    const visionGroq = resolveNovaVisionProviders().find((p) => p.id === "groq");
    expect(visionGroq?.model).toBe("meta-llama/llama-4-scout-17b-16e-instruct");
    expect(visionGroq?.fallbackModel).toBe("qwen/qwen3.6-27b");
  });

  it("gemini native rotates to GEMINI_API_KEY_2 on 429", async () => {
    process.env.GROQ_API_KEY = "gsk_keep_llm_on";
    process.env.GEMINI_API_KEY = "gem_quota";
    process.env.GEMINI_API_KEY_2 = "gem_ok";
    process.env.NOVA_LLM_GEMINI_MODEL = "gemini-2.0-flash";

    const seenKeys: string[] = [];
    globalThis.fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const key = String((init?.headers as Record<string, string>)?.["x-goog-api-key"] || "");
      seenKeys.push(key);
      if (key === "gem_quota") {
        return new Response("rate", { status: 429 });
      }
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"rawText":"ok","fields":{}}' }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const { geminiNativeDocumentExtract } = await import("@/lib/nova-reader/llm-extract");
    const out = await geminiNativeDocumentExtract({
      buffer: Buffer.from("fake-image"),
      mime: "image/jpeg",
      userText: "read",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.provider).toBe("gemini-native-gemini2");
      expect(out.result.content).toContain("rawText");
    }
    expect(seenKeys).toContain("gem_quota");
    expect(seenKeys).toContain("gem_ok");
  });

  it("openAiCompatVisionExtract uses OpenRouter then Groq Scout after Gemini fails", async () => {
    process.env.GROQ_API_KEY = "gsk_ok";
    process.env.GEMINI_API_KEY = "gem_fail";
    process.env.OPENROUTER_API_KEY = "or_ok";
    process.env.OPENROUTER_VISION_MODEL = "openrouter/free";
    process.env.NOVA_LLM_GLOBAL_DEADLINE_MS = "20000";

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("generativelanguage.googleapis.com")) {
        return new Response("nope", { status: 429 });
      }
      if (url.includes("openrouter.ai")) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"rawText":"from or","fields":{}}' } }],
            model: "openrouter/free",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const { openAiCompatVisionExtract } = await import("@/lib/nova-reader/llm-extract");
    const out = await openAiCompatVisionExtract({
      buffer: Buffer.from("tiny"),
      mime: "image/jpeg",
      userText: "ocr",
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.provider).toBe("openrouter");
      expect(out.result.content).toContain("from or");
    }
  });

  it("visionFailureUserMessage is multi-provider when OpenRouter configured", async () => {
    process.env.GROQ_API_KEY = "gsk_a";
    process.env.GEMINI_API_KEY = "gem_a";
    process.env.OPENROUTER_API_KEY = "or_a";
    const { visionFailureUserMessage } = await import("@/lib/nova-reader/llm-extract");
    expect(visionFailureUserMessage("quota")).toMatch(/across configured providers/i);
  });

  it("ensureGroqVisionImageBudget leaves small buffers alone", async () => {
    const { ensureGroqVisionImageBudget } = await import("@/lib/nova-reader/llm-extract");
    const buf = Buffer.alloc(10_000, 1);
    const out = await ensureGroqVisionImageBudget(buf, "image/jpeg");
    expect(out.buffer.equals(buf)).toBe(true);
    expect(out.mime).toBe("image/jpeg");
  });
});
