/**
 * Skill — appearance_open (extracted from nova-tools; behaviour identical).
 */
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
          sources: ["appearance_settings"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runAppearanceOpen(
  _ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const name = "appearance_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Appearance",
      href: "/settings/appearance",
      note: "Personal theme and language — open Appearance to switch light/dark/system. Company Users settings need admin access.",
    },
  });
  links.push({ title: "Appearance", href: "/settings/appearance" });
  return finalizeFrom(facts, links);
}
