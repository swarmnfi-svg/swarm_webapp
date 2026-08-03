/**
 * Skill — audit_log_open (extracted from nova-tools; behaviour identical).
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
          sources: ["audit_log"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runAuditLogOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "audit_log_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "audit.read")) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing audit.read",
    });
    return finalize();
  }
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Audit Log",
      href: "/system/audit-log",
      note: "Open the Audit Log in the ERP to review activity (NOVA does not list audit rows in chat).",
    },
  });
  links.push({ title: "Audit Log", href: "/system/audit-log" });
  return finalize();
}
