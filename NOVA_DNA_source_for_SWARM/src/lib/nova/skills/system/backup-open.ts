/**
 * Skill — backup_open (extracted from nova-tools; behaviour identical).
 */
import { canViewBackupHistory } from "@/lib/backup/access";
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
          sources: ["system_backup"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runBackupOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "backup_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!canViewBackupHistory(user)) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing backup history access",
    });
    return finalize();
  }
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "System Backup",
      href: "/system/backup",
      note: "Open System Backup in the ERP to view backup history (NOVA does not create, download, or restore backups).",
    },
  });
  links.push({ title: "System Backup", href: "/system/backup" });
  return finalize();
}
