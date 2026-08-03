/**
 * Skill — notifications_open (extracted from nova-tools; behaviour identical).
 */
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
          period: null,
          sources: ["notification"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runNotificationsOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "notifications_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];

  const unreadCount = await Promise.resolve(
    prisma.notification.count({ where: { userId: user.id, read: false, dismissedAt: null } })
  ).catch(() => 0);
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Notifications",
      href: "/notifications",
      unreadCount,
      note:
        unreadCount > 0
          ? `You have ${unreadCount} unread notification(s). Open Notifications for your inbox (message bodies not listed here).`
          : "No unread notifications — open Notifications for your inbox / alerts.",
    },
  });
  links.push({ title: "Notifications", href: "/notifications" });
  return finalizeFrom(facts, links);
}
