/**
 * Skill — staff_expense_summary (manual vouchers + workflow expense PRs).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
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

/** Workflow payment-request types that are org/staff expenses (not salary/vendor-only). */
const EXPENSE_PAYMENT_REQUEST_TYPES = [
  "STAFF_EXPENSE_REIMBURSEMENT",
  "GENERAL_EXPENSE",
  "PROJECT_EXPENSE",
  "STAFF_ADVANCE_SETTLEMENT_EXTRA_PAYMENT",
] as const;

const REIMBURSEMENT_PAYMENT_REQUEST_TYPES = [
  "STAFF_EXPENSE_REIMBURSEMENT",
  "STAFF_ADVANCE_SETTLEMENT_EXTRA_PAYMENT",
] as const;

const ALL_TIME_RE = /\b(all[-\s]?time|lifetime|ever|overall)\b/i;
const STAFF_RANKING_RE =
  /\b(who|which\s+staff|top|highest|largest|most|more|max(?:imum)?)\b[\s\S]*\b(reimburs\w*|claim(?:ed|s)?|spend(?:s|ing)?|spent|expenses?)\b|\b(staff[-\s]?wise|employee\s+expense|top\s+claimants?)\b/i;
const REIMBURSEMENT_RE = /\b(reimburs\w*|claim(?:ed|s)?|claimed|claimant|claimants)\b/i;
const PENDING_APPROVAL_RE =
  /\b(pending|awaiting|waiting)\b[\s\S]*\b(approval|approve|approved)\b|\b(approval|approve)\b[\s\S]*\b(pending|awaiting|waiting)\b/i;
const PENDING_PAYMENT_RE =
  /\b(pending|awaiting|waiting|unpaid)\b[\s\S]*\b(reimburs\w*|payment|paid|payout)\b|\b(reimburs\w*|payment|paid|payout)\b[\s\S]*\b(pending|awaiting|waiting|unpaid)\b/i;
const PAID_RE = /\b(paid|reimbursed|settled|posted)\b/i;

type StaffSpendBucket = {
  staffId: string;
  manualExpense: number;
  reimbursement: number;
  settlementExpense: number;
  count: number;
};

function addStaffSpend(
  buckets: Map<string, StaffSpendBucket>,
  staffId: string | null | undefined,
  patch: Partial<Omit<StaffSpendBucket, "staffId">>
) {
  if (!staffId) return;
  const row =
    buckets.get(staffId) ??
    ({
      staffId,
      manualExpense: 0,
      reimbursement: 0,
      settlementExpense: 0,
      count: 0,
    } satisfies StaffSpendBucket);
  row.manualExpense += patch.manualExpense ?? 0;
  row.reimbursement += patch.reimbursement ?? 0;
  row.settlementExpense += patch.settlementExpense ?? 0;
  row.count += patch.count ?? 0;
  buckets.set(staffId, row);
}

function isStaffSpendRankingAsk(query: string): boolean {
  return STAFF_RANKING_RE.test(query);
}

function isReimbursementAsk(query: string): boolean {
  return REIMBURSEMENT_RE.test(query);
}

function hasAllTimeIntent(query: string): boolean {
  return ALL_TIME_RE.test(query);
}

function reimbursementStatusWhere(query: string): Record<string, unknown> {
  if (PENDING_APPROVAL_RE.test(query)) {
    return { status: { in: ["SUBMITTED", "MANAGER_VERIFIED"] } };
  }
  if (PENDING_PAYMENT_RE.test(query)) {
    return {
      status: { in: ["SUBMITTED", "MANAGER_VERIFIED", "ADMIN_APPROVED"] },
      paymentStatus: { not: "PAID" },
    };
  }
  if (PAID_RE.test(query)) {
    return { status: "PAID" };
  }
  return { status: { notIn: ["REJECTED", "CANCELLED", "REVERSED"] } };
}

function periodFilter(field: string, period: { from: Date; to: Date } | null) {
  return period ? { [field]: { gte: period.from, lte: period.to } } : {};
}

async function resolveStaffFilter(
  personHint: string | null,
  user: NovaSkillHandlerContext["user"]
): Promise<
  | { kind: "none"; staffId: null; subject: null }
  | {
      kind: "ok";
      staffId: string | null;
      subject: { name: string; relation: "self" | "other"; staffCode: string | null };
    }
  | { kind: "missing"; message: string; subject: { name: string; relation: "other"; resolved: false } }
> {
  if (!personHint) return { kind: "none", staffId: null, subject: null };
  const { resolveNovaPersonHint } = await import("@/lib/ai/nova-tools");
  const resolved = await resolveNovaPersonHint(personHint, user);
  if (resolved.kind !== "ok") {
    return {
      kind: "missing",
      message: resolved.message,
      subject: { name: personHint, relation: "other", resolved: false },
    };
  }
  return {
    kind: "ok",
    staffId: resolved.person.staffId,
    subject: {
      name: resolved.person.name,
      relation: resolved.person.relation,
      staffCode: resolved.person.staffCode,
    },
  };
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
          sources: ["manual_expense_payment", "payment_request", "staff_advance_settlement_line"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runStaffExpenseSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, tz, range, entityFilterName, personHint, query, sampleLimit } = ctx;
  const name = "staff_expense_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (
    !can(user, "accounts.dashboard.read") &&
    !can(user, "accounts.read") &&
    !can(user, "accounts.reports.read")
  ) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing accounts.dashboard.read / accounts.reports.read",
    });
    return finalize();
  }
  if (!canViewOrgFinanceAggregates(user)) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Org finance aggregates required for expense totals",
    });
    return finalize();
  }
  const rankingAsk = isStaffSpendRankingAsk(query);
  const reimbursementAsk = isReimbursementAsk(query);
  const requestedLikeAsk =
    reimbursementAsk && /\b(requested|request|claimed|claim|pending|awaiting|waiting|unpaid)\b/i.test(query);
  const staffFilter = await resolveStaffFilter(personHint, user);
  if (staffFilter.kind === "missing") {
    facts.push({
      tool: name,
      ok: true,
      data: {
        subject: staffFilter.subject,
        message: staffFilter.message,
        totalPaid: 0,
        samples: [],
      },
    });
    links.push({ title: "Manual expenses", href: "/accounts/expenses" });
    links.push({ title: "Payment requests", href: "/payment-requests" });
    return finalize();
  }
  const resolvedPeriod =
    range ??
    (hasAllTimeIntent(query) || rankingAsk || requestedLikeAsk
      ? null
      : resolveToolPeriod(null, "month", new Date(), tz).period);
  const period = resolvedPeriod;
  const periodGrain = period
    ? resolveToolPeriod(period, "month", new Date(), tz).periodGrain
    : ("other" as const);
  const periodSource = range ? "explicit" : period ? "default_month" : "explicit";
  const periodLabel = period?.label ?? "all time";
  const paidInPeriod = period ? { gte: period.from, lte: period.to } : undefined;
  const scopedStaffId = staffFilter.kind === "ok" ? staffFilter.staffId : null;
  const staffIdFilter = scopedStaffId ? { staffId: scopedStaffId } : {};
  const entityExpense = entityFilterName
    ? {
        OR: [
          {
            vendor: {
              vendorName: { contains: entityFilterName, mode: "insensitive" as const },
            },
          },
          { partyLabel: { contains: entityFilterName, mode: "insensitive" as const } },
          { projectRef: { contains: entityFilterName, mode: "insensitive" as const } },
        ],
      }
    : null;
  const manualWhere = {
    ...(paidInPeriod ? { paidAt: paidInPeriod } : {}),
    status: "PAID" as const,
    AND: [
      {
        OR: [
          { entryType: "EXPENSE" as const },
          ...(reimbursementAsk ? [] : [{ entryType: "VENDOR_PAYMENT" as const }]),
        ],
      },
      ...(entityExpense ? [entityExpense] : []),
    ],
    ...staffIdFilter,
  };
  // Workflow expenses not already mirrored as a PAID manual voucher (avoid double-count).
  const prWhere = {
    ...(requestedLikeAsk ? periodFilter("createdAt", period) : paidInPeriod ? { paidAt: paidInPeriod } : {}),
    ...(requestedLikeAsk ? reimbursementStatusWhere(query) : { status: "PAID" as const }),
    requestType: {
      in: reimbursementAsk
        ? [...REIMBURSEMENT_PAYMENT_REQUEST_TYPES]
        : [...EXPENSE_PAYMENT_REQUEST_TYPES],
    },
    manualExpensePayment: null,
    ...staffIdFilter,
    ...(entityExpense
      ? {
          AND: [entityExpense],
        }
      : {}),
  };
  const settlementWhere = {
    settlement: {
      status: "POSTED" as const,
      ...(scopedStaffId ? { staffId: scopedStaffId } : {}),
    },
    ...periodFilter("date", period),
    ...(entityFilterName
      ? {
          OR: [
            { projectRef: { contains: entityFilterName, mode: "insensitive" as const } },
            { vendorName: { contains: entityFilterName, mode: "insensitive" as const } },
            { description: { contains: entityFilterName, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const staffLinkedManualWhere = scopedStaffId
    ? manualWhere
    : { ...manualWhere, staffId: { not: null } };
  const staffLinkedPrWhere = scopedStaffId ? prWhere : { ...prWhere, staffId: { not: null } };

  const [
    byType,
    samples,
    prAgg,
    prSamples,
    pendingManualCount,
    settlementAgg,
    settlementSamples,
    manualByStaff,
    prByStaff,
    settlementByStaff,
  ] = await Promise.all([
    prisma.manualExpensePayment.groupBy({
      by: ["entryType"],
      where: manualWhere,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.manualExpensePayment.findMany({
      where: manualWhere,
      orderBy: { paidAt: "desc" },
      take: 6,
      select: {
        voucherNo: true,
        entryType: true,
        amount: true,
        purpose: true,
        paidAt: true,
        partyLabel: true,
        staffId: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
    prisma.paymentRequest.groupBy({
      by: ["requestType"],
      where: prWhere,
      _sum: { amount: true },
      _count: true,
    }),
    prisma.paymentRequest.findMany({
      where: prWhere,
      orderBy: requestedLikeAsk ? { createdAt: "desc" } : { paidAt: "desc" },
      take: 6,
      select: {
        paymentRequestId: true,
        requestType: true,
        amount: true,
        purpose: true,
        paidAt: true,
        createdAt: true,
        partyLabel: true,
        staffId: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
    prisma.manualExpensePayment.count({
      where: {
        status: "PENDING",
        ...(paidInPeriod ? { paidAt: paidInPeriod } : {}),
        ...staffIdFilter,
        ...(entityExpense ? { AND: [entityExpense] } : {}),
      },
    }),
    reimbursementAsk
      ? Promise.resolve({ _sum: { totalAmount: 0 }, _count: 0 })
      : prisma.staffAdvanceSettlementLine.aggregate({
          where: settlementWhere,
          _sum: { totalAmount: true },
          _count: true,
        }),
    reimbursementAsk
      ? Promise.resolve([])
      : prisma.staffAdvanceSettlementLine.findMany({
          where: settlementWhere,
          orderBy: { date: "desc" },
          take: 6,
          select: {
            id: true,
            date: true,
            description: true,
            totalAmount: true,
            projectRef: true,
            settlement: {
              select: {
                settlementNo: true,
                staffId: true,
                staff: { select: { fullName: true, staffCode: true } },
              },
            },
          },
        }),
    rankingAsk
      ? prisma.manualExpensePayment.groupBy({
          by: ["staffId"],
          where: staffLinkedManualWhere,
          _sum: { amount: true },
          _count: true,
        })
      : Promise.resolve([]),
    rankingAsk
      ? prisma.paymentRequest.groupBy({
          by: ["staffId"],
          where: staffLinkedPrWhere,
          _sum: { amount: true },
          _count: true,
        })
      : Promise.resolve([]),
    rankingAsk && !reimbursementAsk
      ? prisma.staffAdvanceSettlementLine.groupBy({
          by: ["settlementId"],
          where: settlementWhere,
          _sum: { totalAmount: true },
          _count: true,
        })
      : Promise.resolve([]),
  ]);

  const manualTotal = byType.reduce((s, r) => s + n(r._sum.amount), 0);
  const prTotal = prAgg.reduce((s, r) => s + n(r._sum.amount), 0);
  const settlementTotal = n(settlementAgg._sum.totalAmount);
  const total = manualTotal + prTotal + settlementTotal;
  const settlementStaffIds =
    rankingAsk && settlementByStaff.length > 0
      ? await prisma.staffAdvanceSettlement.findMany({
          where: { id: { in: settlementByStaff.map((s) => s.settlementId) } },
          select: { id: true, staffId: true },
        })
      : [];
  const settlementStaffById = new Map(settlementStaffIds.map((s) => [s.id, s.staffId]));
  const buckets = new Map<string, StaffSpendBucket>();
  for (const r of manualByStaff) {
    addStaffSpend(buckets, r.staffId, { manualExpense: n(r._sum.amount), count: r._count });
  }
  for (const r of prByStaff) {
    addStaffSpend(buckets, r.staffId, { reimbursement: n(r._sum.amount), count: r._count });
  }
  for (const r of settlementByStaff) {
    addStaffSpend(buckets, settlementStaffById.get(r.settlementId), {
      settlementExpense: n(r._sum.totalAmount),
      count: r._count,
    });
  }
  const staffMap = await staffNamesById([...buckets.keys()]);
  const topStaff = [...buckets.values()]
    .map((b) => {
      const totalSpend = b.manualExpense + b.reimbursement + b.settlementExpense;
      const staff = staffMap.get(b.staffId);
      return {
        staffId: b.staffId,
        staff: staff?.fullName ?? "Unknown staff",
        code: staff?.staffCode ?? null,
        count: b.count,
        totalSpend,
        totalSpendInr: inr(totalSpend),
        manualExpenseInr: inr(b.manualExpense),
        reimbursementInr: inr(b.reimbursement),
        settlementExpenseInr: inr(b.settlementExpense),
      };
    })
    .sort((a, b) => b.totalSpend - a.totalSpend || b.count - a.count || a.staff.localeCompare(b.staff))
    .slice(0, 10);
  const sampleRows = [
    ...samples.map((s) => ({
      source: "manual" as const,
      voucher: s.voucherNo,
      type: s.entryType,
      amountInr: inr(n(s.amount)),
      purpose: s.purpose,
      staff: s.staff?.fullName ?? null,
      code: s.staff?.staffCode ?? null,
      party: s.staff?.fullName ?? s.partyLabel,
      statusDate: null,
      paidAt: s.paidAt?.toISOString().slice(0, 10) ?? null,
    })),
    ...prSamples.map((s) => ({
      source: "payment_request" as const,
      voucher: s.paymentRequestId,
      type: s.requestType,
      amountInr: inr(n(s.amount)),
      purpose: s.purpose,
      staff: s.staff?.fullName ?? null,
      code: s.staff?.staffCode ?? null,
      party: s.staff?.fullName ?? s.partyLabel,
      statusDate: (requestedLikeAsk ? s.createdAt : s.paidAt)?.toISOString().slice(0, 10) ?? null,
      paidAt: s.paidAt?.toISOString().slice(0, 10) ?? null,
    })),
    ...settlementSamples.map((s) => ({
      source: "advance_settlement_line" as const,
      voucher: s.settlement.settlementNo,
      type: "STAFF_ADVANCE_SETTLEMENT_EXPENSE",
      amountInr: inr(n(s.totalAmount)),
      purpose: s.description,
      staff: s.settlement.staff.fullName,
      code: s.settlement.staff.staffCode,
      party: s.settlement.staff.fullName,
      statusDate: null,
      paidAt: s.date?.toISOString().slice(0, 10) ?? null,
    })),
  ]
    .sort((a, b) => ((b.statusDate ?? b.paidAt) ?? "").localeCompare((a.statusDate ?? a.paidAt) ?? ""))
    .slice(0, 8);

  facts.push({
    tool: name,
    ok: true,
    data: (() => {
      const data = {
        period: periodLabel,
        periodGrain,
        periodSource,
        entityFilter: entityFilterName ?? null,
        personFilter: personHint ?? null,
        subject: staffFilter.kind === "ok" ? staffFilter.subject : null,
        mode: reimbursementAsk
          ? requestedLikeAsk
            ? "reimbursement_requests"
            : "reimbursements_paid"
          : rankingAsk
            ? "staff_wise_spend"
            : "expense_paid_summary",
        statusFilter: requestedLikeAsk
          ? PENDING_APPROVAL_RE.test(query)
            ? "pending_approval"
            : PENDING_PAYMENT_RE.test(query)
              ? "pending_payment"
              : "requested"
          : "paid",
        totalPaidInr: inr(total),
        totalPaid: total,
        manualPaid: manualTotal,
        manualPaidInr: inr(manualTotal),
        paymentRequestPaid: prTotal,
        paymentRequestPaidInr: inr(prTotal),
        settlementExpense: settlementTotal,
        settlementExpenseInr: inr(settlementTotal),
        pendingManualCount,
        ranking: rankingAsk
          ? {
              type: reimbursementAsk ? "top_reimbursement_claimants" : "staff_wise_spend",
              topStaff,
              emptyNote:
                topStaff.length === 0
                  ? "No staff-linked expense/reimbursement rows matched this status/period scope."
                  : null,
            }
          : null,
        byType: [
          ...byType.map((r) => ({
            source: "manual",
            entryType: r.entryType,
            count: r._count,
            amount: n(r._sum.amount),
            amountInr: inr(n(r._sum.amount)),
          })),
          ...prAgg.map((r) => ({
            source: "payment_request",
            entryType: r.requestType,
            count: r._count,
            amount: n(r._sum.amount),
            amountInr: inr(n(r._sum.amount)),
          })),
          ...(settlementTotal > 0 || settlementAgg._count > 0
            ? [
                {
                  source: "advance_settlement_line",
                  entryType: "STAFF_ADVANCE_SETTLEMENT_EXPENSE",
                  count: settlementAgg._count,
                  amount: settlementTotal,
                  amountInr: inr(settlementTotal),
                },
              ]
            : []),
        ],
        sampleCount: sampleRows.length,
        samples: sampleRows,
        emptyNote:
          total === 0
            ? pendingManualCount > 0
              ? `${pendingManualCount} manual expense voucher(s) still PENDING approval in this period (not in paid total).`
              : "No paid manual expenses or expense payment requests in this period."
            : null,
      };

      const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
      if (!reportIntent) return data;

      const typeChart = (data.byType as { entryType: string; amount: number; amountInr: string }[])
        .slice(0, 8)
        .map((r) => ({
          label: String(r.entryType).replaceAll("_", " ").slice(0, 18),
          value: r.amount,
          unit: "inr" as const,
        }));
      const staffChart = (rankingAsk ? topStaff : []).slice(0, 8).map((s) => ({
        label: String(s.staff ?? "Staff").slice(0, 18),
        value: Number(s.totalSpend ?? 0),
        unit: "inr" as const,
      }));
      const { attachment } = buildSkillReportPack({
        packId: "staff_expense_report",
        reportMode,
        title: reimbursementAsk ? "Staff reimbursements report" : "Staff expenses report",
        headline: `Paid ${inr(total)} in ${periodLabel} (manual ${inr(manualTotal)} · PR ${inr(prTotal)} · settlement ${inr(settlementTotal)})`,
        period: {
          label: periodLabel,
          grain: periodGrain === "day" || periodGrain === "week" || periodGrain === "month" || periodGrain === "fy"
            ? periodGrain
            : "month",
          calendarKind: "calendar_month",
          source: range ? "explicit" : "default",
        },
        metrics: [
          {
            metricId: "staff_expense.total_paid",
            version: "1",
            certification: "draft",
            value: total,
            display: inr(total),
            periodLabel,
          },
          {
            metricId: "staff_expense.manual_paid",
            version: "1",
            certification: "draft",
            value: manualTotal,
            display: inr(manualTotal),
            periodLabel,
          },
          {
            metricId: "staff_expense.pr_paid",
            version: "1",
            certification: "draft",
            value: prTotal,
            display: inr(prTotal),
            periodLabel,
          },
        ],
        charts: [
          {
            bindingId: "kpi_strip",
            metricIds: ["staff_expense.total_paid"],
            title: "Spend by type",
            points: typeChart,
          },
          ...(staffChart.length
            ? [
                {
                  bindingId: "ageing_or_attention" as const,
                  metricIds: ["staff_expense.total_paid"],
                  title: "Spend by staff",
                  points: staffChart,
                },
              ]
            : []),
        ],
        tables: [
          {
            id: "expense_samples",
            title: rankingAsk ? "Top staff spend" : "Expense samples",
            columns: rankingAsk
              ? ["Staff", "Code", "Count", "Amount"]
              : ["Voucher", "Staff", "Type", "Amount", "Date"],
            rows: rankingAsk
              ? topStaff.map((s) => [
                  reportCell(s.staff),
                  reportCell(s.code),
                  reportCell(s.count),
                  reportCell(s.totalSpendInr),
                ])
              : sampleRows.map((s) => [
                  reportCell(s.voucher),
                  reportCell(s.staff ?? s.party),
                  reportCell(s.type),
                  reportCell(s.amountInr),
                  reportCell(s.paidAt ?? s.statusDate),
                ]),
          },
        ],
        facts: [{ tool: name, ok: true, data }],
        links: [
          { title: "Manual expenses", href: "/accounts/expenses" },
          { title: "Payment requests", href: "/payment-requests" },
        ],
        omittedNotes: [
          "Paid totals only unless query asks pending approval/payment. Org finance aggregate gate applies.",
        ],
      });
      return withSkillReportAttachment(data, attachment);
    })(),
  });
  links.push({ title: "Manual expenses", href: "/accounts/expenses" });
  links.push({ title: "Payment requests", href: "/payment-requests" });
  return finalize();
}
