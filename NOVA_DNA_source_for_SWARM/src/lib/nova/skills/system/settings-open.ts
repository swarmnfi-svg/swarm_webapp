/**
 * Skill — settings_open (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
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
          period:
            typeof (fact.data as Record<string, unknown>).period === "string"
              ? ((fact.data as Record<string, unknown>).period as string)
              : null,
          sources: ["company_profile"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runSettingsOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "settings_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "settings.write")) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing settings.write",
    });
    return finalize();
  }
  const [profile, activeUserCount] = await Promise.all([
    Promise.resolve(
      prisma.companyProfile.findFirst({
        select: { name: true, brandName: true, timezone: true },
      })
    ).catch(() => null),
    Promise.resolve(prisma.user.count({ where: { active: true } })).catch(() => 0),
  ]);
  const companyName =
    (profile && typeof profile.name === "string" && profile.name.trim()) || "Company";
  const brandName =
    profile && typeof profile.brandName === "string" && profile.brandName.trim()
      ? profile.brandName.trim()
      : null;
  const timezone =
    profile && typeof profile.timezone === "string" && profile.timezone.trim()
      ? profile.timezone.trim()
      : null;
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Settings",
      href: "/settings",
      companyName,
      brandName,
      timezone,
      activeUserCount,
      note:
        `Company settings for **${companyName}**` +
        (brandName ? ` (${brandName})` : "") +
        (timezone ? ` · timezone ${timezone}` : "") +
        (activeUserCount > 0 ? ` · ${activeUserCount} active user(s)` : "") +
        ". Open Settings for Users / Company (no passwords or bank details shown here).",
      related: [
        { title: "Company", href: "/settings/company" },
        { title: "Users", href: "/settings/users" },
        { title: "Appearance", href: "/settings/appearance" },
      ],
    },
  });
  links.push(
    { title: "Settings", href: "/settings" },
    { title: "Company", href: "/settings/company" },
    { title: "Users", href: "/settings/users" }
  );
  return finalize();
}
