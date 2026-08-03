/**
 * Skill — incentives_summary (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { kpiTeamUserIdsForUser } from "@/lib/kpi/team-scope";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const n = (v: unknown) => Number(v ?? 0);

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
          sources: ["staff_incentive"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runIncentivesSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, personHint } = ctx;
  const name = "incentives_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  const canAll = can(user, "incentive.read.all");
  const canTeam = can(user, "incentive.read.team");
  const canSelf = can(user, "incentive.read.self");
  if (!canAll && !canTeam && !canSelf) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing incentive.read" });
    return finalize();
  }
  let where: Record<string, unknown> = {};
  let incentiveSubject: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } | null = null;
  if (!canAll) {
    if (canTeam) {
      const teamUserIds = await kpiTeamUserIdsForUser(user);
      where = { userId: { in: teamUserIds ?? [user.id] } };
    } else {
      where = { userId: user.id };
    }
  }
  if (personHint) {
    const { resolveNovaPersonHint } = await import("@/lib/ai/nova-tools");
    const resolved = await resolveNovaPersonHint(personHint, user);
    if (resolved.kind !== "ok") {
      facts.push({
        tool: name,
        ok: true,
        data: {
          subject: { name: personHint, relation: "other", resolved: false },
          message: resolved.message,
          openOrUnpaidCount: 0,
          samples: [],
        },
      });
      links.push({ title: "Incentives", href: "/kpi/incentives" });
      return finalize();
    }
    const p = resolved.person;
    if (p.relation === "other") {
      if (!canAll && !canTeam) {
        facts.push({
          tool: name,
          ok: false,
          denied: true,
          error: `You can only view your own incentives — not ${p.name}'s.`,
          data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
        });
        return finalize();
      }
      if (canTeam && !canAll && p.userId) {
        const teamUserIds = await kpiTeamUserIdsForUser(user);
        if (teamUserIds && !teamUserIds.includes(p.userId)) {
          facts.push({
            tool: name,
            ok: false,
            denied: true,
            error: `You can only view incentives for your team — not ${p.name}'s.`,
            data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
          });
          return finalize();
        }
      }
    }
    if (p.userId) {
      where = { userId: p.userId };
      incentiveSubject = { name: p.name, relation: p.relation, staffCode: p.staffCode };
    }
  }
  const [openCount, samples] = await Promise.all([
    prisma.staffIncentive.count({
      where: {
        ...where,
        OR: [
          { approvalStatus: { in: ["DRAFT", "PENDING_APPROVAL", "HELD"] } },
          {
            paymentStatus: { in: ["UNPAID", "PARTIALLY_PAID"] },
            approvalStatus: "APPROVED",
          },
        ],
      },
    }),
    prisma.staffIncentive.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        incentiveNo: true,
        approvalStatus: true,
        paymentStatus: true,
        calculatedAmount: true,
        approvedAmount: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
  ]);
  facts.push({
    tool: name,
    ok: true,
    data: {
      scope: incentiveSubject
        ? incentiveSubject.relation === "self"
          ? "person_self"
          : "person_other"
        : canAll
          ? "all"
          : canTeam
            ? "team"
            : "self",
      subject: incentiveSubject,
      personFilter: personHint ?? null,
      scopeNote: incentiveSubject
        ? incentiveSubject.relation === "other"
          ? `Incentives for ${incentiveSubject.name} (third person).`
          : "Your own incentives."
        : canAll
          ? "Org-wide incentives."
          : canTeam
            ? "Team incentives (incentive.read.team)."
            : "Your own incentives only (incentive.read.self).",
      openOrUnpaidCount: openCount,
      sampleCount: samples.length,
      samples: samples.map((i) => ({
        no: i.incentiveNo,
        staff: i.staff.fullName,
        code: i.staff.staffCode,
        approval: i.approvalStatus,
        payment: i.paymentStatus,
        amountInr: inr(n(i.approvedAmount ?? i.calculatedAmount)),
      })),
    },
  });
  links.push({ title: "Incentives", href: "/kpi/incentives" });
  return finalize();
}
