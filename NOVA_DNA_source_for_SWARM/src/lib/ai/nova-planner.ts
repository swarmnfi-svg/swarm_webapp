/**
 * Optional LLM slot-fill for NOVA (Phase C).
 * Enabled when NOVA_LLM_PLANNER=true and an LLM key is configured.
 * Invoked only when the compose plan has confidence === "low".
 * Output is validated against the lexicon allowlist — never invents tools;
 * topics map to tools via the catalog (no free tool pick).
 * Heuristic composeNovaIntent remains authority when decisive.
 */
import type { SessionUser } from "@/auth";
import { isNovaLlmConfigured, novaChatCompletion } from "@/lib/ai/llm";
import {
  NOVA_LEXICON,
  selectToolsFromLexicon,
  type NovaTopicId,
} from "@/lib/ai/nova-lexicon";
import { composeNovaIntent, novaIntentIsDecisive, type NovaSlot } from "@/lib/ai/nova-intent";
import { filterNovaToolsForUser } from "@/lib/ai/nova-suggest";

export type NovaLlmPlan = {
  tools: string[];
  interpretedAs: string[];
  clarify?: string;
  slots?: NovaSlot[];
};

const ALLOWED_TOPIC_IDS = new Set(NOVA_LEXICON.map((t) => t.id));

function slotSummary(slots: NovaSlot[]): string {
  return slots
    .map((s) => {
      if (s.kind === "period") return `period:${s.grain}:${s.raw}`;
      if (s.kind === "metric") return `metric:${s.topicId}${s.focus ? `:${s.focus}` : ""}`;
      if (s.kind === "status") return `status:${s.value}`;
      if (s.kind === "person") return `person:${s.name}`;
      if (s.kind === "entity") return `entity:${s.name}`;
      return "unknown";
    })
    .join(", ");
}

export async function planNovaTopicsWithLlm(
  user: SessionUser,
  query: string
): Promise<NovaLlmPlan | null> {
  if (!isNovaLlmConfigured()) return null;

  // Heuristic composer wins when decisive (tools or clarify) — period never implies money
  const composed = composeNovaIntent(query);
  if (novaIntentIsDecisive(composed)) {
    if (composed.clarify && composed.tools.length === 0) {
      return {
        tools: [],
        interpretedAs: [],
        clarify: composed.clarify,
        slots: composed.slots,
      };
    }
    if (composed.tools.length > 0) {
      const allowed = filterNovaToolsForUser(user, composed.tools);
      if (allowed.length) {
        return {
          tools: allowed,
          interpretedAs: composed.interpretedAs ?? [],
          slots: composed.slots,
        };
      }
    }
  }

  // Low-confidence only: fill slots / pick catalog topics — never invent tool ids
  const topicCatalog = NOVA_LEXICON.map(
    (t) => `${t.id}: ${t.label} → tools[${t.tools.join(",") || "none"}]`
  ).join("\n");

  const heuristic = selectToolsFromLexicon(query);

  const llm = await novaChatCompletion(
    [
      {
        role: "system",
        content: [
          "You are NOVA's slot filler for emPOWER ERP (low-confidence queries only).",
          "Return ONLY compact JSON:",
          '{"slots":[{"kind":"period|metric|status|person|entity",...}],"topics":["topic_id"],"clarify":null|"question"}',
          "Fill slots from the query. Optionally pick 1–3 topic ids from the catalog.",
          "Do NOT invent tool names — topics map to tools server-side.",
          "If required slots are missing (bare period, bare pending, bare late/absent/present), set clarify and empty topics.",
          "Rules: period alone never implies money; late+period → attendance; late+payment ≠ attendance.",
          "Never invent topic ids. Never suggest write/approve actions.",
          "Catalog:\n" + topicCatalog,
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `Query: ${query}`,
          `Heuristic slots: ${slotSummary(composed.slots) || "none"}`,
          `Heuristic topics: ${heuristic.topics.map((t) => t.id).join(", ") || "none"}`,
        ].join("\n"),
      },
    ],
    { temperature: 0, maxTokens: 280 }
  );

  const raw = llm.content.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: {
    topics?: string[];
    clarify?: string | null;
    slots?: NovaSlot[];
  };
  try {
    parsed = JSON.parse(jsonMatch[0]) as {
      topics?: string[];
      clarify?: string | null;
      slots?: NovaSlot[];
    };
  } catch {
    return null;
  }

  if (parsed.clarify && typeof parsed.clarify === "string" && parsed.clarify.trim()) {
    return {
      tools: [],
      interpretedAs: [],
      clarify: parsed.clarify.trim(),
      slots: Array.isArray(parsed.slots) ? parsed.slots : composed.slots,
    };
  }

  const topicIds = (parsed.topics ?? []).filter((id): id is NovaTopicId =>
    ALLOWED_TOPIC_IDS.has(id as NovaTopicId)
  );
  if (!topicIds.length) return null;

  const tools = new Set<string>();
  const interpretedAs: string[] = [];
  for (const id of topicIds) {
    const topic = NOVA_LEXICON.find((t) => t.id === id);
    if (!topic) continue;
    interpretedAs.push(topic.label);
    for (const t of topic.tools) tools.add(t);
  }

  const allowed = filterNovaToolsForUser(user, [...tools]);
  if (!allowed.length) return null;

  return {
    tools: allowed,
    interpretedAs,
    slots: Array.isArray(parsed.slots) ? parsed.slots : composed.slots,
  };
}
