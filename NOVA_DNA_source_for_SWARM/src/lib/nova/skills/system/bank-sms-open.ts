/**
 * Skill — bank_sms_open (extracted from nova-tools; behaviour identical).
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
          sources: ["bank_sms"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runBankSmsOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "bank_sms_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "bank.sms.read")) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing bank.sms.read",
    });
    return finalize();
  }
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Bank SMS",
      href: "/accounts/bank-sms",
      note: "Open Bank SMS entries in Accounts to review pending SMS (NOVA does not invent balances or account numbers).",
      related: [
        { title: "Paste SMS", href: "/accounts/bank-sms/paste" },
        { title: "SMS Settings", href: "/accounts/bank-sms/settings" },
      ],
    },
  });
  links.push(
    { title: "Bank SMS", href: "/accounts/bank-sms" },
    { title: "Paste SMS", href: "/accounts/bank-sms/paste" }
  );
  return finalize();
}
