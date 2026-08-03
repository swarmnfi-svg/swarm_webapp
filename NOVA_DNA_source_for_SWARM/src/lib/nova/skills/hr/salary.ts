/**
 * Skill — salary_summary (extracted from nova-tools; behaviour identical).
 * Report-intent asks return a savable salary_report pack (never widens self payslip scope).
 */
import { can } from "@/lib/rbac";
import { canViewPayrollSalaryAmounts } from "@/lib/confidential-financials-access";
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
          sources: ["salary_payment", "hr_payroll_run"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runSalarySummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, tz, range, query, personHint, sampleLimit } = ctx;
  const name = "salary_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);

  // FIN-HR-SAL: org totals need payroll salary amounts (not Manager canSeeSalaryInfo).
  const canSalaryAll = canViewPayrollSalaryAmounts(user);
  const canPayslipSelf = can(user, "hr.payslip.self");
  if (!canSalaryAll && !canPayslipSelf) {
    facts.push({
      tool: name,
      ok: false,
      denied: true,
      error: "Missing payroll salary access / hr.payslip.self",
    });
    return finalize();
  }
  const { period, periodGrain, periodSource } = resolveToolPeriod(range, "month", new Date(), tz);
  let salaryStaffFilter: { staffId?: string } = {};
  let salarySubject: {
    name: string;
    relation: "self" | "other";
    staffCode: string | null;
  } | null = null;
  if (!canSalaryAll) {
    const me = await prisma.staffProfile.findFirst({
      where: { userId: user.id },
      select: { id: true, fullName: true, staffCode: true },
    });
    if (!me) {
      facts.push({
        tool: name,
        ok: true,
        data: { message: "No staff profile linked — cannot load payslips." },
      });
      return finalize();
    }
    salaryStaffFilter = { staffId: me.id };
    salarySubject = { name: me.fullName, relation: "self", staffCode: me.staffCode };
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
          paymentsInPeriod: 0,
          samples: [],
        },
      });
      links.push({ title: "Payroll", href: "/attendance-hr/payroll" });
      return finalize();
    }
    const p = resolved.person;
    if (p.relation === "other" && !canSalaryAll) {
      facts.push({
        tool: name,
        ok: false,
        denied: true,
        error: `You can only view your own payslip/salary — not ${p.name}'s.`,
        data: { subject: { name: p.name, relation: "other", staffCode: p.staffCode } },
      });
      return finalize();
    }
    if (p.staffId) {
      salaryStaffFilter = { staffId: p.staffId };
      salarySubject = { name: p.name, relation: p.relation, staffCode: p.staffCode };
    }
  }
  const payWhere = {
    paidAt: { gte: period.from, lte: period.to },
    ...salaryStaffFilter,
  };
  const sampleTake = reportIntent ? rowCap : (sampleLimit ?? 8);
  const [runCount, paymentCount, paidAgg, recent] = await Promise.all([
    canSalaryAll ? prisma.hrPayrollRun.count() : Promise.resolve(0),
    prisma.salaryPayment.count({ where: payWhere }),
    prisma.salaryPayment.aggregate({
      where: { ...payWhere, status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.salaryPayment.findMany({
      where: payWhere,
      orderBy: { paidAt: "desc" },
      take: sampleTake,
      select: {
        salaryPaymentNo: true,
        salaryMonth: true,
        amount: true,
        status: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
    }),
  ]);

  const paidTotal = n(paidAgg._sum.amount);
  const scope = salarySubject
    ? salarySubject.relation === "self"
      ? "person_self"
      : "person_other"
    : canSalaryAll
      ? "all"
      : "self";
  const sampleMapped = recent.map((r) => ({
    no: r.salaryPaymentNo,
    month: r.salaryMonth,
    staff: `${r.staff.fullName} (${r.staff.staffCode})`,
    staffName: r.staff.fullName,
    amount: n(r.amount),
    amountInr: inr(n(r.amount)),
    status: r.status,
  }));

  const data: Record<string, unknown> = {
    period: period.label,
    periodGrain,
    periodSource,
    scope,
    subject: salarySubject,
    personFilter: personHint ?? null,
    payrollRunCount: runCount,
    paymentsInPeriod: paymentCount,
    paidTotal,
    paidTotalInr: inr(paidTotal),
    sampleCount: sampleMapped.length,
    samplesShowing: sampleMapped.length,
    samplesOf: paymentCount,
    samples: sampleMapped.map(({ staffName: _n, ...rest }) => rest),
    note:
      canPayslipSelf && !canSalaryAll ? "Self payslip scope (hr.payslip.self)." : undefined,
  };

  links.push({ title: "Payroll", href: "/attendance-hr/payroll" });
  if (canSalaryAll) links.push({ title: "Salary payments", href: "/accounts/salary" });
  else links.push({ title: "My payslips", href: "/attendance-hr/payroll" });

  if (reportIntent) {
    const byStaff = new Map<string, number>();
    for (const s of sampleMapped) {
      const key = String(s.staffName ?? s.staff).slice(0, 18);
      byStaff.set(key, (byStaff.get(key) ?? 0) + s.amount);
    }
    const staffPoints = [...byStaff.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value, unit: "inr" as const }));

    const { attachment } = buildSkillReportPack({
      packId: "salary_report",
      reportMode,
      title: "Salary / payroll report",
      headline: `${period.label}: ${paymentCount} payment(s) · ${inr(paidTotal)} · scope ${scope}`,
      period: {
        label: period.label,
        grain:
          periodGrain === "day" || periodGrain === "week" || periodGrain === "month" || periodGrain === "fy"
            ? periodGrain
            : "month",
        calendarKind: periodGrain === "fy" ? "financial_year" : "calendar_month",
        source: range ? "explicit" : "default",
      },
      metrics: [
        {
          metricId: "salary.payments_in_period",
          version: "1",
          certification: "draft",
          value: paymentCount,
          display: `${paymentCount} payments`,
          periodLabel: period.label,
        },
        {
          metricId: "salary.paid_total",
          version: "1",
          certification: "draft",
          value: paidTotal,
          display: inr(paidTotal),
          periodLabel: period.label,
        },
        ...(canSalaryAll
          ? [
              {
                metricId: "salary.payroll_run_count",
                version: "1",
                certification: "draft" as const,
                value: runCount,
                display: `${runCount} payroll runs`,
              },
            ]
          : []),
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["salary.paid_total"],
          title: "Paid by staff (sample)",
          points: staffPoints,
        },
      ],
      tables: [
        {
          id: "salary_payments",
          title: "Salary payments",
          columns: ["Payment", "Month", "Staff", "Amount", "Status"],
          rows: sampleMapped.map((s) => [
            reportCell(s.no),
            reportCell(s.month),
            reportCell(s.staff),
            reportCell(s.amountInr),
            reportCell(s.status),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        canSalaryAll
          ? "Org payroll salary amounts scope."
          : "Self payslip scope only (hr.payslip.self). Report intent never widens to other staff.",
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
