/**
 * Skill — search_entities (Empower global/data search).
 * Uses SearchEngine entityHint / searchQuery when present — never invents matches.
 */
import { searchBusinessData } from "@/lib/search/data-search";
import {
  novaSearchKindForEntityType,
  runNovaSearchEngine,
} from "@/lib/nova/nova-search-engine";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

function finalizeFrom(
  facts: NovaSkillHandlerResult["fact"][],
  links: NovaToolLink[]
): NovaSkillHandlerResult {
  const fact = facts[facts.length - 1]!;
  if (fact?.ok && fact.data && typeof fact.data === "object") {
    return {
      fact: {
        ...fact,
        data: withFactProvenance(fact.data as Record<string, unknown>, {
          period: null,
          sources: ["entity_search"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runSearchEntities(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, entityHint } = ctx;
  const name = "search_entities";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];

  const searchSlots = runNovaSearchEngine(query);
  const rawQ =
    (entityHint?.trim() ||
      searchSlots.searchQuery?.trim() ||
      searchSlots.entityHint?.trim() ||
      query.trim()).slice(0, 120);
  // Drop SEARCH:/FIND: leftovers so contains matching hits project/party names
  const q = rawQ
    .replace(/^(?:search|find|look\s*up|lookup)\s*:\s*/i, "")
    .replace(/^[:\-–—]+\s*/, "")
    .trim()
    .slice(0, 120);

  let results = await searchBusinessData(user, q);
  const kind = novaSearchKindForEntityType(
    searchSlots.entityType ??
      (ctx.resolvedEntityType as typeof searchSlots.entityType) ??
      null
  );
  if (kind) {
    const filtered = results.filter((r) => r.kind === kind);
    if (filtered.length > 0) results = filtered;
  }

  facts.push({
    tool: name,
    ok: true,
    data: {
      matchCount: results.length,
      searchHint: q,
      entityType: searchSlots.entityType,
      matches: results.slice(0, 8).map((r) => ({
        kind: r.kind,
        title: r.title,
        subtitle: r.subtitle ?? null,
        href: r.href,
      })),
    },
  });
  for (const r of results.slice(0, 8)) {
    links.push({ title: `${r.kind}: ${r.title}`, href: r.href });
  }
  return finalizeFrom(facts, links);
}
