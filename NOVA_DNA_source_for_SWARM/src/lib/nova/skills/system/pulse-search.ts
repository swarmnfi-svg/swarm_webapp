/**
 * Skill — nova_pulse_search
 * Read-only search over append-only NovaPulseEvent facts (RBAC-filtered).
 * Never writes Pulse events; emitters live in ERP mutation paths.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import {
  parsePulseQueryHints,
  searchNovaPulseEvents,
} from "@/lib/nova-pulse/search";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

async function resolvePersonUserId(personHint: string | null): Promise<string | null> {
  if (!personHint || personHint.trim().length < 2) return null;
  const hint = personHint.trim();
  const staff = await prisma.staffProfile.findMany({
    where: {
      OR: [
        { fullName: { contains: hint, mode: "insensitive" } },
        { staffCode: { equals: hint, mode: "insensitive" } },
      ],
      userId: { not: null },
    },
    select: { userId: true, fullName: true, staffCode: true },
    take: 8,
  });
  const exact =
    staff.find((s) => s.fullName.toLowerCase() === hint.toLowerCase()) ??
    staff.find((s) => s.staffCode?.toLowerCase() === hint.toLowerCase()) ??
    (staff.length === 1 ? staff[0] : null);
  if (exact?.userId) return exact.userId;

  const users = await prisma.user.findMany({
    where: { name: { contains: hint, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 8,
  });
  const uExact =
    users.find((u) => u.name?.toLowerCase() === hint.toLowerCase()) ??
    (users.length === 1 ? users[0] : null);
  return uExact?.id ?? null;
}

export async function runNovaPulseSearch(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, personHint, range } = ctx;
  const name = "nova_pulse_search";
  const links: NovaToolLink[] = [];

  if (!can(user, "task.read.self") && !can(user, "documents.read") && !can(user, "task.admin")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing task.read.self or documents.read — Pulse is closed without grant",
      },
    };
  }

  const personUserId = await resolvePersonUserId(personHint);
  const hints = parsePulseQueryHints(query, {
    personUserId,
    sessionUserId: user.id,
  });

  // Prefer person ACL filter over leftover name tokens in searchText.
  let textHint = hints.textHint;
  if (textHint && personHint) {
    textHint = textHint
      .replace(new RegExp(personHint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
      .replace(/\s+/g, " ")
      .trim();
    if (textHint.length < 2) textHint = null;
  }

  const result = await searchNovaPulseEvents(user, {
    query: textHint ?? undefined,
    entityTypes: hints.entityTypes,
    actions: hints.actions,
    actorUserId: hints.actorUserId,
    relatedUserId: hints.relatedUserId,
    since: range?.from ?? null,
    until: range?.to ?? null,
    limit: Math.min(ctx.sampleLimit || 12, 20),
  });

  if (!result.ok) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: result.denied,
        error: result.error,
      },
    };
  }

  for (const hit of result.hits.slice(0, 8)) {
    if (hit.href) {
      links.push({
        title: hit.summary.slice(0, 80),
        href: hit.href,
      });
    }
  }
  links.push({ title: "Tasks", href: "/tasks" });

  const empty = result.hits.length === 0;
  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          matchCount: result.hits.length,
          lookbackDays: result.lookbackDays,
          personHint: personHint ?? null,
          personUserId,
          actorFilter: hints.actorUserId ?? null,
          actionFilters: hints.actions ?? null,
          entityTypeFilters: hints.entityTypes ?? null,
          textHint,
          events: result.hits.map((h) => ({
            id: h.id,
            action: h.action,
            entityType: h.entityType,
            entityId: h.entityId,
            summary: h.summary,
            actorName: h.actorName,
            createdAt: h.createdAt,
            href: h.href,
            fileName:
              typeof h.payloadRef?.fileName === "string" ? h.payloadRef.fileName : null,
            taskNo: typeof h.payloadRef?.taskNo === "string" ? h.payloadRef.taskNo : null,
          })),
          empty,
          note: empty
            ? personHint
              ? `No permission-visible Pulse changes matching this ask for “${personHint}” in the last ${result.lookbackDays} days.`
              : `No permission-visible Pulse changes matching this ask in the last ${result.lookbackDays} days.`
            : `Showing ${result.hits.length} recent change(s) you can access (recorded Pulse facts — not invented).`,
          disclaimer:
            "NOVA Pulse only reports recorded ERP change events. It does not invent activity or write back.",
        },
        { sources: ["task", "document"] }
      ),
    },
    links,
  };
}
