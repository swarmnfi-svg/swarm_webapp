/**
 * Skill — system_tools_open (extracted from nova-tools; behaviour identical).
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
          sources: ["system_tools"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runSystemToolsOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "system_tools_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (user.role !== "SUPER_ADMIN" && user.role !== "ADMIN" && user.role !== "DIRECTOR") {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "System tools require Admin, Super Admin, or Director",
    });
    return finalize();
  }
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "System Tools",
      href: "/system/tools",
      note: "Open System Tools in the ERP for platform modules and admin utilities (NOVA does not change settings here).",
      related: [
        { title: "NOVA unmatched", href: "/system/nova-unmatched" },
        { title: "Documents", href: "/documents" },
      ],
    },
  });
  links.push(
    { title: "System Tools", href: "/system/tools" },
    { title: "NOVA unmatched", href: "/system/nova-unmatched" }
  );
  return finalize();
}
