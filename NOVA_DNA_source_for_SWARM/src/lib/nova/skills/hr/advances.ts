/**
 * Skill — staff_advances_summary (extracted from nova-tools; behaviour identical).
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { resolveToolPeriod } from "@/lib/ai/nova-dates";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const n = (v: unknown) => Number(v ?? 0);

const ALL_TIME_RE = /\b(all[-\s]?time|lifetime|ever|overall)\b/i;
const TOP_STAFF_RE =
  /\b(who|which\s+staff|top|highest|largest|most|more|max(?:imum)?)\b[\s\S]*\badvances?\b|\badvances?\b[\s\S]*\b(most|more|highest|largest|top|max(?:imum)?)\b/i;
const PENDING_APPROVAL_RE =
  /\b(pending|awaiting|waiting)\b[\s\S]*\b(approval|approve|approved)\b|\b(approval|approve)\b[\s\S]*\b(pending|awaiting|waiting)\b/i;
const PENDING_SETTLEMENT_RE =
  /\b(pending|awaiting|waiting|due|overdue)\b[\s\S]*\b(settlement|settle|settled|adjustment|balance)\b|\b(settlement|settle|settled|balance)\b[\s\S]*\b(pending|awaiting|waiting|due|overdue)\b/i;
const ISSUED_ADVANCE_RE = /\b(took|taken|issued|paid|disbursed)\b/i;

function hasAllTimeIntent(query: string): boolean {
  return ALL_TIME_RE.test(query);
}

function isStaffAdvanceRankingAsk(query: string): boolean {
  return TOP_STAFF_RE.test(query);
}

function advanceStatusWhere(query: string): Record<string, unknown> {
  if (PENDING_APPROVAL_RE.test(query)) {
    return { status: "REQUESTED" };
  }
  if (PENDING_SETTLEMENT_RE.test(query)) {
    return {
      status: { in: ["PAID", "PARTIALLY_SETTLED", "OVERDUE"] },
      balancePending: { gt: 0 },
    };
  }
  if (/\b(rejected|cancelled|canceled)\b/i.test(query)) {
    return { status: { in: ["REJECTED", "CANCELLED"] } };
  }
  if (/\b(settled|closed|cleared)\b/i.test(query)) {
    return { status: "SETTLED" };
  }
  return {
    status: { in: ["REQUESTED", "APPROVED", "PAID", "PARTIALLY_SETTLED", "OVERDUE"] },
  };
}

function advanceAmountField(query: string): "amountIssued" | "balancePending" {
  return PENDING_SETTLEMENT_RE.test(query) || /\b(balance|outstanding|pending)\b/i.test(query)
    ? "balancePending"
    : "amountIssued";
}

function advanceDateField(query: string): "createdAt" | "issuedDate" | "updatedAt" {
  if (PENDING_SETTLEMENT_RE.test(query)) return "updatedAt";
  return ISSUED_ADVANCE_RE.test(query) ? "issuedDate" : "createdAt";
}

async function staffNamesById(staffIds: string[]) {
  if (staffIds.length === 0) return new Map<string, { fullName: string; staffCode: string | null }>();
  const rows = await prisma.staffProfile.findMany({
    where: { id: { in: staffIds } },
    select: { id: true, fullName: true, staffCode: true },
  });
  return new Map(rows.map((s) => [s.id, { fullName: s.fullName, staffCode: s.staffCode }]));
}

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
          sources: ["staff_advance"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runStaffAdvancesSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, personHint, query, tz, range, sampleLimit } = ctx;
  const name = "staff_advances_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  const canAll = can(user, "staffadvance.read");
  const canSelf =
    can(user, "staffadvance.self.create") || can(user, "staffadvance.self.settle");
  if (!canAll && !canSelf) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing staff advance access" });
    return finalize();
  }
  const rankingAsk = isStaffAdvanceRankingAsk(query);
  const statusWhere = advanceStatusWhere(query);
  const period =
    range ?? (hasAllTimeIntent(query) || !rankingAsk ? null : resolveToolPeriod(null, "fy", new Date(), tz).period);
  const periodMeta = period
    ? {
        period: period.label,
        periodGrain: resolveToolPeriod(period, "fy", new Date(), tz).periodGrain,
        periodSource: range ? "explicit" : "default_fy",
      }
    : { period: "all time", periodGrain: "other" as const, periodSource: "explicit" as const };
  const dateField = advanceDateField(query);
  let where: Record<string, unknown> = {
    ...statusWhere,
    ...(period ? { [dateField]: { gte: period.from, lte: period.to } } : {}),
  };
  let advanceSubject: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } | null = null;
  if (!canAll) {
    const me = await prisma.staffProfile.findFirst({
      where: { userId: user.id },
      select: { id: true, fullName: true, staffCode: true },
    });
    if (!me) {
      facts.push({
        tool: name,
        ok: true,
        data: { message: "No staff profile linked — cannot load advances." },
      });
      return finalize();
    }
    where = { ...where, staffId: me.id };
    advanceSubject = { name: me.fullName, relation: "self", staffCode: me.staffCode };
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
          openCount: 0,
          samples: [],
        },
      });
      links.push({ title: "Staff advances", href: "/staff-advances" });
      return finalize();
    }
    const p = resolved.person;
    if (p.relation === "other" && !canAll) {
      facts.push({
        tool: name,
        ok: false,
        denied: true,
        error: `You can only view your own advances — not ${p.name}'s.`,
        data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
      });
      return finalize();
    }
    if (p.staffId) {
      where = { ...where, staffId: p.staffId };
      advanceSubject = { name: p.name, relation: p.relation, staffCode: p.staffCode };
    }
  }
  const amountField = advanceAmountField(query);
  const [openCount, openBalance, samples, byStaff] = await Promise.all([
    prisma.staffAdvance.count({ where }),
    prisma.staffAdvance.aggregate({
      where,
      _sum: { balancePending: true },
    }),
    prisma.staffAdvance.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        advanceNo: true,
        status: true,
        amountIssued: true,
        balancePending: true,
        purpose: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
    rankingAsk && canAll
      ? prisma.staffAdvance.groupBy({
          by: ["staffId"],
          where,
          _sum: { amountIssued: true, balancePending: true },
          _count: true,
        })
      : Promise.resolve([]),
  ]);
  const staffMap = await staffNamesById(byStaff.map((r) => r.staffId));
  const topStaff = byStaff
    .map((r) => {
      const staff = staffMap.get(r.staffId);
      const amount = n(r._sum[amountField]);
      return {
        staffId: r.staffId,
        staff: staff?.fullName ?? "Unknown staff",
        code: staff?.staffCode ?? null,
        count: r._count,
        amount,
        amountInr: inr(amount),
      };
    })
    .sort((a, b) => b.amount - a.amount || b.count - a.count || a.staff.localeCompare(b.staff))
    .slice(0, 10);
  const balancePending = n(openBalance._sum.balancePending);
  const sampleRows = samples.map((a) => ({
    no: a.advanceNo,
    staff: a.staff.fullName,
    code: a.staff.staffCode,
    status: a.status,
    issuedInr: inr(n(a.amountIssued)),
    issued: n(a.amountIssued),
    balanceInr: inr(n(a.balancePending)),
    balance: n(a.balancePending),
    purpose: a.purpose.slice(0, 60),
  }));
  const data = {
    period: periodMeta.period,
    periodGrain: periodMeta.periodGrain,
    periodSource: periodMeta.periodSource,
    statusFilter: PENDING_APPROVAL_RE.test(query)
      ? "pending_approval"
      : PENDING_SETTLEMENT_RE.test(query)
        ? "pending_settlement"
        : "open_or_active",
    amountBasis: amountField,
    ranking: rankingAsk
      ? {
          type: "staff_advance_top_staff",
          topStaff,
          emptyNote:
            topStaff.length === 0
              ? "No staff advance rows matched this status/period scope."
              : null,
        }
      : null,
    scope: advanceSubject
      ? advanceSubject.relation === "self"
        ? "person_self"
        : "person_other"
      : canAll
        ? "all"
        : "self",
    subject: advanceSubject,
    personFilter: personHint ?? null,
    openCount,
    totalBalancePendingInr: inr(balancePending),
    totalBalancePending: balancePending,
    sampleCount: sampleRows.length,
    samplesShowing: sampleRows.length,
    samplesOf: openCount,
    samples: sampleRows,
  };
  links.push({
    title: canAll ? "Staff advances" : "My advances",
    href: canAll ? "/staff-advances" : "/my-advances",
  });

  const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
  if (reportIntent) {
    const chartPoints = (
      rankingAsk && topStaff.length
        ? topStaff.map((row) => ({
            label: String(row.staff ?? "Staff").slice(0, 18),
            value: row.amount,
            unit: "inr" as const,
          }))
        : sampleRows.map((row) => ({
            label: String(row.staff ?? row.no ?? "Advance").slice(0, 18),
            value: Number(row.balance ?? 0),
            unit: "inr" as const,
          }))
    ).slice(0, 8);
    const { attachment } = buildSkillReportPack({
      packId: "staff_advances_report",
      reportMode,
      title: "Staff advances report",
      headline: `${openCount} advance(s) · balance pending ${inr(balancePending)} · scope ${data.scope}`,
      period: {
        label: String(periodMeta.period),
        grain: period ? "fy" : "open",
        calendarKind: period ? "financial_year" : "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "staff_advances.open_count",
          version: "1",
          certification: "draft",
          value: openCount,
          display: `${openCount} open`,
        },
        {
          metricId: "staff_advances.balance_pending",
          version: "1",
          certification: "draft",
          value: balancePending,
          display: inr(balancePending),
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["staff_advances.balance_pending"],
          title: rankingAsk ? "Advance amount by staff" : "Balance pending (sample)",
          points: chartPoints,
        },
      ],
      tables: [
        {
          id: "staff_advances_detail",
          title: rankingAsk ? "Top staff by advance" : "Advance samples",
          columns: rankingAsk
            ? ["Staff", "Code", "Count", "Amount"]
            : ["Advance", "Staff", "Status", "Issued", "Balance", "Purpose"],
          rows: rankingAsk
            ? topStaff.map((s) => [
                reportCell(s.staff),
                reportCell(s.code),
                reportCell(s.count),
                reportCell(s.amountInr),
              ])
            : sampleRows.map((s) => [
                reportCell(s.no),
                reportCell(s.staff),
                reportCell(s.status),
                reportCell(s.issuedInr),
                reportCell(s.balanceInr),
                reportCell(s.purpose),
              ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        canAll
          ? "Org-wide staffadvance.read scope."
          : "Self-scoped advances only (staffadvance.self.*).",
      ],
    });
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(data, attachment),
    });
  } else {
    facts.push({
      tool: name,
      ok: true,
      data,
    });
  }
  return finalize();
}
