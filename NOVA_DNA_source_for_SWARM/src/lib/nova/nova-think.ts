/**
 * NovaThink — optional/gated LLM understand layer for ALL reasonable ERP queries.
 *
 * Emits the same NovaSearchSlots schema as NovaSearchEngine rules.
 * Output is validated via validateNovaSearchSlots before NovaPlan.
 * READ-ONLY: never writes, free SQL, or invents money/people.
 * Fallback: runNovaSearchEngine(rules) when Think is off / fails / invalid.
 *
 * Gate: NOVA_THINK=true (or NOVA_LLM_PLANNER=true) + LLM configured.
 */
import type { SessionUser } from "@/auth";
import { isNovaLlmConfigured, novaChatCompletion } from "@/lib/ai/llm";
import { NOVA_LEXICON } from "@/lib/ai/nova-lexicon";
import { filterNovaToolsForUser } from "@/lib/ai/nova-suggest";
import { listNovaSkillToolIds } from "@/lib/nova/skills/registry";
import {
  buildNovaThinkCatalogText,
  runNovaSearchEngine,
  validateNovaSearchSlots,
  type NovaSearchSlots,
} from "@/lib/nova/nova-search-engine";

export function isNovaThinkEnabled(): boolean {
  const think = process.env.NOVA_THINK?.trim().toLowerCase();
  if (think === "true" || think === "1") return true;
  // Reuse planner gate so existing envs get Think without a second flag
  const planner = process.env.NOVA_LLM_PLANNER?.trim().toLowerCase();
  return planner === "true" || planner === "1";
}

function allowedToolIdSet(user?: SessionUser | null): Set<string> {
  const all = listNovaSkillToolIds();
  if (!user) return new Set(all);
  return new Set(filterNovaToolsForUser(user, all));
}

/**
 * Run NovaThink (LLM) then validate against SearchEngine slot schema.
 * Returns null on disable / failure — caller must use rules fallback.
 */
export async function runNovaThink(
  query: string,
  user?: SessionUser | null
): Promise<NovaSearchSlots | null> {
  if (!isNovaThinkEnabled() || !isNovaLlmConfigured()) return null;
  const q = query.trim();
  if (!q || q.length > 500) return null;

  const allowed = allowedToolIdSet(user);
  const lexiconLines = NOVA_LEXICON.map(
    (t) => `${t.id}: ${t.label} → [${t.tools.join(",") || "none"}]`
  );
  const catalog = buildNovaThinkCatalogText({
    lexiconLines,
    skillToolIds: [...allowed],
  });

  try {
    const llm = await novaChatCompletion(
      [
        {
          role: "system",
          content: [
            "You are NovaThink for emPOWER ERP — READ-ONLY understanding only.",
            "Analyse the user query against the app catalog and return ONLY compact JSON matching:",
            '{"intent":"string","entityType":"project|customer|vendor|employee|document"|null,"entityKindHint":"project|customer|vendor|staff"|null,"entityHint":string|null,"metric":string|null,"period":string|null,"comparison":string|null,"focus":string|null,"queryFamily":"search|status|money|attendance|approvals|resolve|follow_up|deny_write|unknown","tools":["toolId"],"confidence":"high"|"low","interpretedAs":["label"],"searchQuery":string|null,"suppressPersonHint":boolean}',
            "entityHint = stripped entity SPAN only — never include role words (project/task(s)/invoice(s)/customer/vendor).",
            "entityKindHint from role words: trailing project|tasks-in-X → project; invoices/receipts/orders → customer; staff → staff. Drop invents with no evidence.",
            "Example: “Avaada project task” → entityHint=\"Avaada\", entityKindHint=\"project\", entityType=\"project\", tools=[tasks_summary], suppressPersonHint=true.",
            "Pick tools ONLY from the registered skill list. Empty tools when clarifying/resolving.",
            "Never invent tool ids, money amounts, people, or SQL.",
            "HOW-TO / GUIDE (critical): queries like how to / guide me / can I do / where do I / steps to → queryFamily unknown, tools [], entityHint null, interpretedAs [\"howto_guide\"]. Do NOT deny_write and do NOT resolve typos as party names (e.g. salry≠customer).",
            "PERMISSION / RBAC (critical): can <role> see/view/access…, who can see…, does <role> have access… → queryFamily unknown, tools [], entityHint null, interpretedAs [\"permission_help\"]. Do NOT pick profitability_summary, salary_summary, bank tools, or any live money dump.",
            "Typos: salry/salery→salary module; taks→tasks; pament→payment. Prefer module tools over entityHint for domain nouns (salary, tasks, attendance, payment requests).",
            "Bare write asks (create/delete/approve this record) without how-to framing → queryFamily deny_write.",
            "who is <person> → queryFamily people, entityType employee, tools [staff_summary], entityHint=name.",
            "who is late/absent → attendance (not people). who is customer|vendor X → resolve + search_entities.",
            "find/search/what is <entity> → search + search_entities (or documents_search / tasks_summary when typed).",
            "projects named X / find projects → search + search_entities; no projects_summary; period null.",
            "tasks pending in <project> → status + tasks_summary + entityHint + entityType project + entityKindHint project.",
            catalog,
          ].join("\n"),
        },
        { role: "user", content: `Query: ${q}` },
      ],
      { temperature: 0, maxTokens: 320 }
    );

    const raw = llm.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    let parsed: Partial<NovaSearchSlots>;
    try {
      parsed = JSON.parse(jsonMatch[0]) as Partial<NovaSearchSlots>;
    } catch {
      return null;
    }

    return validateNovaSearchSlots(parsed, allowed);
  } catch (err) {
    console.error("[nova-think] failed", err);
    return null;
  }
}

/**
 * Prefer Think when valid; otherwise deterministic SearchEngine rules.
 * Always returns slots (never throws).
 */
export async function understandNovaQuery(
  query: string,
  user?: SessionUser | null
): Promise<{ slots: NovaSearchSlots; source: "think" | "rules" }> {
  const thought = await runNovaThink(query, user);
  if (thought && (thought.confidence === "high" || thought.tools.length > 0)) {
    return { slots: thought, source: "think" };
  }
  return { slots: runNovaSearchEngine(query), source: "rules" };
}
