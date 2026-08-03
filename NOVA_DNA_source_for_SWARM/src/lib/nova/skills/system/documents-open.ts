/**
 * Skill — documents_open (extracted from nova-tools; behaviour identical).
 */
import { prisma } from "@/lib/nova/prisma-readonly";
import { canAccessNovaDocuments } from "@/lib/ai/nova-suggest";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import { settlePromise } from "@/lib/nova/skills/settle";
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
          sources: ["document"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runDocumentsOpen(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "documents_open";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!canAccessNovaDocuments(user)) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Documents hub is not available for your role",
    });
    return finalize();
  }
  const whereActive = { archived: false };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [totalSettle, archivedSettle, recentSettle, byModuleSettle] = await Promise.all([
    settlePromise(prisma.document.count({ where: whereActive })),
    settlePromise(prisma.document.count({ where: { archived: true } })),
    settlePromise(
      prisma.document.count({
        where: { archived: false, uploadedAt: { gte: weekAgo } },
      })
    ),
    settlePromise(
      prisma.document.groupBy({ by: ["module"], where: whereActive, _count: { _all: true } })
    ),
  ]);

  // Primary vault count failed → surface error, never invent “0 documents”.
  if (!totalSettle.ok) {
    facts.push({
      tool: name,
      ok: false,
      error: "Documents count lookup failed. Open /documents — do not treat as zero files.",
    });
    links.push({ title: "Documents", href: "/documents" });
    return finalize();
  }

  const totalCount = totalSettle.value;
  const archivedCount = archivedSettle.ok ? archivedSettle.value : null;
  const recent7dCount = recentSettle.ok ? recentSettle.value : null;
  const byModuleRaw =
    byModuleSettle.ok && Array.isArray(byModuleSettle.value) ? byModuleSettle.value : [];
  const byModule = byModuleRaw
    .map((r) => ({ module: r.module, count: r._count._all }))
    .sort((a, b) => b.count - a.count);
  const empty = totalCount === 0;
  facts.push({
    tool: name,
    ok: true,
    data: {
      screen: "Documents",
      href: "/documents",
      totalCount,
      archivedCount,
      recent7dCount,
      byModule,
      empty,
      note: empty
        ? "No active documents on file yet — open Documents to upload or browse when available."
        : `Document vault: ${totalCount} active file(s)` +
          (recent7dCount != null && recent7dCount > 0
            ? ` (${recent7dCount} uploaded in the last 7 days)`
            : "") +
          (archivedCount != null && archivedCount > 0 ? `; ${archivedCount} archived` : "") +
          ". Open Documents to browse (file names/contents not listed here).",
    },
  });
  links.push({ title: "Documents", href: "/documents" });
  return finalize();
}
