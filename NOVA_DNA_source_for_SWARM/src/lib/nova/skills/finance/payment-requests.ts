/**
 * Finance skill — payment_requests_summary (awaiting / paid queue).
 * Report-intent asks return a savable payment_requests_report pack.
 * Person-scoped asks (“Arif payment requests pending”) filter by staff / requestedFor.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { paymentRequestListWhereForUser } from "@/lib/payment-request-access";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const n = (v: unknown) => Number(v ?? 0);

/** List / names / details follow-ups should surface sample rows, not count-only. */
function wantsPaymentRequestList(query: string): boolean {
  return /\b(list|names?|details?|show\s+them|enumerate|itemize)\b/i.test(query);
}

export async function runPaymentRequestsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, range, entityFilterName, personHint, sampleLimit } = ctx;
  const name = "payment_requests_summary";

  if (!can(user, "paymentrequest.read") && !can(user, "paymentrequest.create")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing paymentrequest.read",
      },
    };
  }

  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const listIntent = wantsPaymentRequestList(query ?? "");
  const prScope = await paymentRequestListWhereForUser(user);

  let subject: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } | null = null;
  let personPr: Record<string, unknown> = {};

  if (personHint?.trim()) {
    const { resolveNovaPersonHint } = await import("@/lib/ai/nova-tools");
    const resolved = await resolveNovaPersonHint(personHint.trim(), user);
    if (resolved.kind !== "ok") {
      return {
        fact: {
          tool: name,
          ok: true,
          data: withFactProvenance(
            {
              scope: "person",
              personFilter: personHint.trim(),
              subject: { name: personHint.trim(), relation: "other", resolved: false },
              message: resolved.message,
              awaitingActionCount: 0,
              awaitingTotal: 0,
              awaitingTotalInr: inr(0),
              samples: [],
              sampleCount: 0,
            },
            { period: range?.label ?? "current queue", sources: ["payment_request"] }
          ),
        },
        links: [{ title: "Payment requests", href: "/payment-requests" }],
      };
    }
    const p = resolved.person;
    subject = { name: p.name, relation: p.relation, staffCode: p.staffCode };
    const orClauses: Record<string, unknown>[] = [];
    if (p.staffId) orClauses.push({ staffId: p.staffId });
    if (p.userId) {
      orClauses.push({ requestedForUserId: p.userId });
      orClauses.push({ requestedBy: p.userId });
    }
    if (orClauses.length === 0) {
      return {
        fact: {
          tool: name,
          ok: true,
          data: withFactProvenance(
            {
              scope: "person",
              personFilter: personHint.trim(),
              subject,
              message: `No payment-request staff link for “${p.name}”.`,
              awaitingActionCount: 0,
              awaitingTotal: 0,
              awaitingTotalInr: inr(0),
              samples: [],
              sampleCount: 0,
            },
            { period: range?.label ?? "current queue", sources: ["payment_request"] }
          ),
        },
        links: [{ title: "Payment requests", href: "/payment-requests" }],
      };
    }
    personPr = { OR: orClauses };
  }

  const entityPr = entityFilterName
    ? {
        OR: [
          { vendor: { vendorName: { contains: entityFilterName, mode: "insensitive" as const } } },
          { partyLabel: { contains: entityFilterName, mode: "insensitive" as const } },
          { projectRef: { contains: entityFilterName, mode: "insensitive" as const } },
          {
            project: {
              projectName: { contains: entityFilterName, mode: "insensitive" as const },
            },
          },
        ],
      }
    : {};
  const awaiting = ["SUBMITTED", "MANAGER_VERIFIED", "ADMIN_APPROVED"] as const;
  const sampleTake = reportIntent ? rowCap : listIntent ? 24 : (sampleLimit ?? 8);
  const whereBase = { AND: [prScope, personPr, entityPr, { status: { in: [...awaiting] } }] };
  const [awaitingCount, paidRecent, samples, awaitingAgg] = await Promise.all([
    prisma.paymentRequest.count({
      where: whereBase,
    }),
    range
      ? prisma.paymentRequest.count({
          where: {
            AND: [
              prScope,
              personPr,
              entityPr,
              {
                status: "PAID",
                updatedAt: { gte: range.from, lte: range.to },
              },
            ],
          },
        })
      : Promise.resolve(null),
    prisma.paymentRequest.findMany({
      where: whereBase,
      orderBy: { updatedAt: "desc" },
      take: sampleTake,
      select: {
        id: true,
        paymentRequestId: true,
        status: true,
        amount: true,
        purpose: true,
        partyLabel: true,
        vendor: { select: { vendorName: true } },
        staff: { select: { fullName: true } },
      },
    }),
    prisma.paymentRequest.aggregate({
      where: whereBase,
      _sum: { amount: true },
    }),
  ]);

  const period = range?.label ?? "current queue";
  const awaitingTotal = n(awaitingAgg._sum.amount);
  const awaitingTotalInr = inr(awaitingTotal);
  const sampleRows = samples.map((r) => ({
    id: r.paymentRequestId,
    status: r.status,
    amount: n(r.amount),
    amountInr: inr(n(r.amount)),
    purpose: r.purpose,
    party: r.vendor?.vendorName ?? r.partyLabel ?? r.staff?.fullName ?? "—",
    href: `/payment-requests/${r.id}`,
  }));

  const data = withFactProvenance(
    {
      scope: subject
        ? subject.relation === "self"
          ? "person_self"
          : "person_other"
        : Object.keys(prScope).length === 0
          ? "org"
          : "self",
      entityFilter: entityFilterName ?? null,
      personFilter: personHint?.trim() || null,
      subject,
      period,
      awaitingActionCount: awaitingCount,
      awaitingTotal,
      awaitingTotalInr,
      paidInPeriod: paidRecent,
      listIntent,
      sampleCount: sampleRows.length,
      samplesShowing: sampleRows.length,
      samplesOf: awaitingCount,
      samples: sampleRows.map((r) => ({
        id: r.id,
        status: r.status,
        amountInr: r.amountInr,
        purpose: r.purpose,
        party: r.party,
        href: r.href,
      })),
    },
    { period, sources: ["payment_request"] }
  );

  const links = [{ title: "Payment requests", href: "/payment-requests" }];

  if (reportIntent) {
    const byStatus = new Map<string, number>();
    for (const r of sampleRows) {
      byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
    }
    const { attachment } = buildSkillReportPack({
      packId: "payment_requests_report",
      reportMode,
      title: "Payment requests outstanding report",
      headline: `${awaitingCount} awaiting action · ${awaitingTotalInr}${
        paidRecent != null ? ` · ${paidRecent} paid in ${period}` : ""
      }`,
      period: {
        label: period,
        grain: "open",
        calendarKind: "point_in_time",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "payment_requests.awaiting_count",
          version: "1",
          certification: "draft",
          value: awaitingCount,
          display: `${awaitingCount} awaiting`,
          periodLabel: period,
        },
        {
          metricId: "payment_requests.awaiting_total",
          version: "1",
          certification: "draft",
          value: awaitingTotal,
          display: awaitingTotalInr,
          periodLabel: period,
        },
        ...(paidRecent != null
          ? [
              {
                metricId: "payment_requests.paid_in_period",
                version: "1",
                certification: "draft" as const,
                value: paidRecent,
                display: `${paidRecent} paid`,
                periodLabel: period,
              },
            ]
          : []),
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["payment_requests.awaiting_total"],
          title: "Awaiting amount by party (sample)",
          points: sampleRows.slice(0, 8).map((s) => ({
            label: String(s.party || s.id).slice(0, 18),
            value: s.amount,
            unit: "inr",
          })),
        },
        {
          bindingId: "kpi_strip",
          metricIds: ["payment_requests.awaiting_count"],
          title: "Awaiting by status (sample)",
          points: [...byStatus.entries()].map(([label, value]) => ({
            label,
            value,
            unit: "count",
          })),
        },
      ],
      tables: [
        {
          id: "payment_requests_awaiting",
          title: "Awaiting payment requests",
          columns: ["PR", "Party", "Amount", "Status", "Purpose"],
          rows: sampleRows.map((s) => [
            reportCell(s.id),
            reportCell(s.party),
            reportCell(s.amountInr),
            reportCell(s.status),
            reportCell(s.purpose),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Queue scoped by payment-request list ACL (org vs self). Never re-sum sample rows for totals.",
      ],
    });
    return {
      fact: {
        tool: name,
        ok: true,
        data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
      },
      links,
    };
  }

  return {
    fact: {
      tool: name,
      ok: true,
      data,
    },
    links,
  };
}
