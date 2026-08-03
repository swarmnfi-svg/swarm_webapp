import {
  GROQ_VISION_MAX_BASE64_BYTES,
  isNovaLlmConfigured,
  novaChatCompletion,
  resolveGeminiApiKeySlots,
  resolveNovaVisionProviders,
  type LlmMessage,
} from "@/lib/ai/llm";
import {
  NOVA_READER_TEXT_LLM_TIMEOUT_MS,
  NOVA_READER_VISION_LLM_TIMEOUT_MS,
} from "@/lib/nova-reader/limits";
import { preprocessImageForNovaReader } from "@/lib/nova-reader/preprocess-image";

export const NOVA_READER_SYSTEM_PROMPT = `You are NOVA Reader. You OCR / read Indian business documents (tax invoices, purchase orders, receipts), payment screenshots, chat notes, and handwritten notes — and return structured JSON only (no markdown).

Return this shape:
{
  "rawText": string,  // visible text transcription (OCR); keep layout roughly; max ~8000 chars
  "confidence": "high"|"medium"|"low",
  "warnings": string[],
  "fields": {
    "documentKind": "tax_invoice"|"purchase_order"|"receipt"|"expense"|"other"|null,
    "vendorName": string|null,
    "vendorGstin": string|null,
    "buyerName": string|null,
    "buyerGstin": string|null,
    "documentNumber": string|null,
    "documentDate": "YYYY-MM-DD"|null,
    "dueDate": "YYYY-MM-DD"|null,
    "subtotal": number|null,
    "cgst": number|null,
    "sgst": number|null,
    "igst": number|null,
    "gstAmount": number|null,
    "totalAmount": number|null,
    "currency": "INR"|string|null,
    "tdsApplicable": boolean|null,
    "tdsAmount": number|null,
    "rcmApplicable": boolean|null,
    "lineItems": [{"description": string, "hsnSac": string, "quantity": number, "rate": number, "gstRate": number, "amount": number|null}]
  }
}
Rules:
- Never invent amounts, GST%, qty, or document numbers you cannot read.
- If unclear, use null / omit and add a warning.
- For missing optional strings (hsnSac), use "" not null.
- rate is unit taxable rate (₹), not line total; gstRate is percent (e.g. 18).
- Do not use buyer (company) GSTIN as vendorGstin.
- vendorName is the **supplier** (party you pay), not the buyer company letterhead.
- buyerName / buyerGstin are the **customer / Bill To** party (for sales invoices or a customer's PO). Prefer buyer* over vendor* when the document is outbound sales / customer PO.
- Purchase orders: still extract vendor/supplier, lines, totals; set documentKind purchase_order; invoice fields may be null.
- rawText must reflect what you can actually read on the page — always fill rawText when any text is visible.
- Screenshots / WhatsApp / chat bubbles / dark UI: read every line in the bubble (names, work notes, payment balance). Put party/project names in vendorName when sensible; put payment amounts (e.g. "3500 rs") in totalAmount; documentKind may be "other" or "receipt".
- Handwriting / pen notes: carefully transcribe cursive and block letters; prefer null + warning over guessing digits; still put clear amounts and names into fields.
- Prefer a single complete JSON object; do not ask clarifying questions.`;

function envTrim(name: string): string {
  return (process.env[name] || "").trim();
}

export type LlmExtractOut = {
  content: string;
  model: string;
  provider: string;
};

/** Why vision extract failed — surfaced as clearer user errors. */
export type VisionExtractFailureReason =
  | "no_gemini_key"
  | "no_vision_key"
  | "llm_off"
  | "quota"
  | "unavailable"
  | "all_failed"
  | "provider_error";

export type VisionExtractAttempt =
  | { ok: true; result: LlmExtractOut }
  | { ok: false; reason: VisionExtractFailureReason; detail?: string };

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Ordered Gemini native keys (separate AI Studio projects / API keys). */
export function resolveGeminiNativeApiKeys(): { id: string; apiKey: string }[] {
  return resolveGeminiApiKeySlots();
}

export function isGeminiApiKeyConfigured(): boolean {
  return resolveGeminiNativeApiKeys().length > 0;
}

/** Preferred Gemini models for document/vision (env first, then resilient fallbacks). */
function geminiModelCandidates(): string[] {
  const primary =
    envTrim("NOVA_LLM_GEMINI_MODEL") ||
    envTrim("GEMINI_MODEL") ||
    "gemini-flash-latest";
  const extras = [
    "gemini-flash-latest",
    "gemini-3.5-flash",
    "gemini-2.0-flash",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of [primary, ...extras]) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

type GeminiOnce =
  | { content: string }
  | { retryable: true; kind: "quota" | "unavailable" | "network" }
  | { retryable: false; kind: "http" | "empty" };

async function geminiGenerateOnce(opts: {
  apiKey: string;
  model: string;
  buffer: Buffer;
  mime: string;
  userText: string;
  timeoutMs: number;
}): Promise<GeminiOnce | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": opts.apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: `${NOVA_READER_SYSTEM_PROMPT}\n\n${opts.userText}` },
              {
                inline_data: {
                  mime_type: opts.mime,
                  data: opts.buffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2800,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });
    if (res.status === 429) {
      await res.text().catch(() => "");
      return { retryable: true, kind: "quota" };
    }
    if (res.status === 503) {
      await res.text().catch(() => "");
      return { retryable: true, kind: "unavailable" };
    }
    if (!res.ok) {
      await res.text().catch(() => "");
      return { retryable: false, kind: "http" };
    }
    const json = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const content = json.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || "")
      .join("")
      .trim();
    if (!content) return { retryable: false, kind: "empty" };
    return { content };
  } catch {
    return { retryable: true, kind: "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gemini native multimodal extract with multi-key + model failover + brief 503/429 retries.
 * Key order: GEMINI_API_KEY → GEMINI_API_KEY_2 → GEMINI_API_KEY_3.
 */
export async function geminiNativeDocumentExtract(opts: {
  buffer: Buffer;
  mime: string;
  userText: string;
}): Promise<VisionExtractAttempt> {
  if (!isNovaLlmConfigured()) {
    return { ok: false, reason: "llm_off" };
  }
  const keys = resolveGeminiNativeApiKeys();
  if (!keys.length) {
    // Compat path may still succeed via OpenRouter / Groq Scout.
    return { ok: false, reason: "no_gemini_key" };
  }

  const models = geminiModelCandidates();
  let sawQuota = false;
  let sawUnavailable = false;

  for (const { id: keyId, apiKey } of keys) {
    let keyHadQuota = false;
    for (const model of models.slice(0, 4)) {
      if (keyHadQuota) break; // advance to next project key on sustained 429
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await geminiGenerateOnce({
          apiKey,
          model,
          buffer: opts.buffer,
          mime: opts.mime,
          userText: opts.userText,
          timeoutMs: NOVA_READER_VISION_LLM_TIMEOUT_MS,
        });
        if (result && "content" in result) {
          return {
            ok: true,
            result: {
              content: result.content,
              model,
              provider: keyId === "gemini" ? "gemini-native" : `gemini-native-${keyId}`,
            },
          };
        }
        if (result && "retryable" in result && result.retryable) {
          if (result.kind === "quota") {
            sawQuota = true;
            keyHadQuota = true;
            // Brief backoff then hop to next Gemini key (separate project quota).
            await sleep(Math.min(900 * 2 ** attempt, 3_500));
            break;
          }
          if (result.kind === "unavailable") sawUnavailable = true;
          if (attempt === 1) break;
          await sleep(result.kind === "unavailable" ? 600 * (attempt + 1) : 450 * (attempt + 1));
          continue;
        }
        break; // non-retryable failure for this model — try next model / key
      }
    }
  }
  if (sawQuota) return { ok: false, reason: "quota" };
  if (sawUnavailable) return { ok: false, reason: "unavailable" };
  return { ok: false, reason: "all_failed" };
}

/**
 * Ensure image base64 fits Groq's ~4MB request limit (HTTP 413 above).
 * Leaves already-small buffers unchanged.
 */
export async function ensureGroqVisionImageBudget(
  buffer: Buffer,
  mime: string
): Promise<{ buffer: Buffer; mime: string }> {
  const jsonOverhead = 96_000;
  const maxB64 = GROQ_VISION_MAX_BASE64_BYTES - jsonOverhead;
  // base64 expands ~4/3; skip encode when clearly under budget
  if (Math.ceil((buffer.length * 4) / 3) <= maxB64) {
    return { buffer, mime };
  }
  const b64Len = buffer.toString("base64").length;
  if (b64Len <= maxB64) {
    return { buffer, mime };
  }
  const maxRaw = Math.max(200_000, Math.floor(maxB64 * 0.75));
  const pre = await preprocessImageForNovaReader(buffer, {
    maxBytes: maxRaw,
    quality: 72,
    longEdge: 1600,
  });
  return { buffer: pre.buffer, mime: pre.mime };
}

export async function openAiCompatVisionExtract(opts: {
  buffer: Buffer;
  mime: string;
  userText: string;
}): Promise<VisionExtractAttempt> {
  if (!isNovaLlmConfigured()) {
    return { ok: false, reason: "llm_off" };
  }

  const visionProviders = resolveNovaVisionProviders();
  if (!visionProviders.length) {
    return { ok: false, reason: "no_vision_key", detail: "no_vision_provider" };
  }

  // Compress once so Groq Scout/Qwen stay under the 4MB base64 ceiling.
  const sized = await ensureGroqVisionImageBudget(opts.buffer, opts.mime);
  const dataUrl = `data:${sized.mime};base64,${sized.buffer.toString("base64")}`;
  const messages: LlmMessage[] = [
    { role: "system", content: NOVA_READER_SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: opts.userText },
        { type: "image_url", image_url: { url: dataUrl } },
      ],
    },
  ];

  try {
    const result = await novaChatCompletion(messages, {
      temperature: 0.1,
      maxTokens: 2800,
      timeoutMs: NOVA_READER_VISION_LLM_TIMEOUT_MS,
      dataClasses: ["finance_money"],
      // Vision failover intentionally includes OpenRouter free VL + Groq Scout.
      skipDataClassFilter: true,
      providersOverride: visionProviders,
    });
    return {
      ok: true,
      result: {
        content: result.content,
        model: result.model,
        provider: result.provider,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/429/.test(msg)) return { ok: false, reason: "quota", detail: msg };
    if (/503|UNAVAILABLE/i.test(msg))
      return { ok: false, reason: "unavailable", detail: msg };
    if (/NOT_CONFIGURED/i.test(msg)) return { ok: false, reason: "llm_off" };
    return { ok: false, reason: "provider_error", detail: msg.slice(0, 160) };
  }
}

function onlyGeminiVisionConfigured(): boolean {
  const vision = resolveNovaVisionProviders();
  if (!vision.length) return isGeminiApiKeyConfigured();
  return vision.every((p) => p.id.startsWith("gemini"));
}

/** Map vision failure → user-facing message (images only). */
export function visionFailureUserMessage(
  reason: VisionExtractFailureReason
): string {
  const geminiOnly = onlyGeminiVisionConfigured();
  switch (reason) {
    case "no_gemini_key":
    case "no_vision_key":
      return "NOVA Reader needs a vision OCR key for photos and screenshots (PDF text still works). Add GEMINI_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY with Llama 4 Scout, then retry.";
    case "llm_off":
      return "NOVA Reader is unavailable — LLM keys are not configured.";
    case "quota":
      return geminiOnly
        ? "Vision OCR is rate-limited or over quota (Gemini). Wait a minute and retry, or check Gemini billing / rate limits. PDF text extraction is unaffected."
        : "Vision OCR is rate-limited across configured providers. Wait a minute and retry, or upload a PDF with a text layer.";
    case "unavailable":
      return geminiOnly
        ? "Vision OCR is temporarily unavailable (Gemini high demand). Retry shortly — or upload a PDF with a text layer."
        : "Vision OCR is temporarily unavailable (provider high demand). Retry shortly — or use a text-layer PDF.";
    case "provider_error":
    case "all_failed":
    default:
      return geminiOnly
        ? "Could not read this image with vision OCR (provider error). Retry, or try a PDF. If this keeps failing, check Gemini / vision provider status."
        : "Could not read this image with vision OCR across configured providers. Retry, or try a PDF with a text layer.";
  }
}

export async function textOnlyExtract(opts: {
  userText: string;
}): Promise<LlmExtractOut> {
  const messages: LlmMessage[] = [
    { role: "system", content: NOVA_READER_SYSTEM_PROMPT },
    { role: "user", content: opts.userText },
  ];
  const result = await novaChatCompletion(messages, {
    temperature: 0.1,
    maxTokens: 2800,
    timeoutMs: NOVA_READER_TEXT_LLM_TIMEOUT_MS,
    dataClasses: ["finance_money"],
  });
  return { ...result, provider: `${result.provider}+text` };
}
