/**
 * Skill — portal_open (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
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
          sources: ["portal"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runPortalOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "portal_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "portal.read")) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing portal.read",
    });
    return finalize();
  }
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Portal",
      href: "/portal",
      note: "Open the Portal screen in the ERP for portal users and access.",
    },
  });
  links.push({ title: "Portal", href: "/portal" });
  return finalize();
}
