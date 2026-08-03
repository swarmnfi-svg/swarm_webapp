/**
 * Skill — automation_open (extracted from nova-tools; behaviour identical).
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
          sources: ["automation"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runAutomationOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "automation_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "automation.read")) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing automation.read",
    });
    return finalize();
  }
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Automation",
      href: "/automation",
      note: "Open Automation in the ERP to review rules and runs (no invented automation stats).",
    },
  });
  links.push({ title: "Automation", href: "/automation" });
  return finalize();
}
