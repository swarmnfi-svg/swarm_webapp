/**
 * Finance skill — bank_accounts_summary.
 * Report-intent asks return a savable bank_accounts_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { totalOperationalBankBalance } from "@/lib/accounts/queries";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  NOVA_REPORT_DETAILED_ROW_CAP_WIDE,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

const n = (v: unknown) => Number(v ?? 0);

export async function runBankAccountsSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, sampleLimit } = ctx;
  const name = "bank_accounts_summary";
  const links: NovaToolLink[] = [];

  if (!can(user, "bank.read")) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing bank.read" },
    };
  }

  const showBalances =
    can(user, "bank.viewfullaccount") || canViewOrgFinanceAggregates(user);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit, {
    detailedMax: NOVA_REPORT_DETAILED_ROW_CAP_WIDE,
  });
  const accounts = await prisma.bankAccount.findMany({
    where: { active: true },
    orderBy: { bankName: "asc" },
    take: reportIntent ? rowCap : 20,
    select: {
      id: true,
      bankAccountId: true,
      bankName: true,
      accountNickname: true,
      accountNumberLast4: true,
      manualCurrentBalance: true,
      statementCurrentBalance: true,
      accountKind: true,
    },
  });
  let totalBook = 0;
  let totalStatement = 0;
  for (const a of accounts) {
    totalBook += n(a.manualCurrentBalance);
    totalStatement += n(a.statementCurrentBalance);
  }
  const operationalTotal = showBalances ? await totalOperationalBankBalance() : null;

  links.push({ title: "Bank accounts", href: "/bank-accounts" });

  const accountRows = accounts.map((a) => ({
    id: a.bankAccountId,
    bank: a.bankName,
    nickname: a.accountNickname,
    last4: showBalances ? a.accountNumberLast4 : null,
    kind: a.accountKind,
    bookBalance: showBalances ? n(a.manualCurrentBalance) : null,
    bookBalanceInr: showBalances ? inr(n(a.manualCurrentBalance)) : "hidden",
    statementBalance: showBalances ? n(a.statementCurrentBalance) : null,
    statementBalanceInr: showBalances ? inr(n(a.statementCurrentBalance)) : "hidden",
    href: `/finance/accounts/${a.id}`,
  }));

  const data = withFactProvenance(
    {
      accountCount: accounts.length,
      balancesVisible: showBalances,
      totalBookBalance: showBalances ? totalBook : null,
      totalBookBalanceInr: showBalances ? inr(totalBook) : "hidden",
      totalStatementBalance: showBalances ? totalStatement : null,
      totalStatementBalanceInr: showBalances ? inr(totalStatement) : "hidden",
      totalOperationalBalance: operationalTotal,
      totalOperationalBalanceInr:
        operationalTotal != null ? inr(operationalTotal) : "hidden",
      accounts: accountRows,
      moneyNote: showBalances
        ? "Lead with totalOperationalBalanceInr (or totalBookBalanceInr). Copy *Inr exactly — never reinterpret commas."
        : undefined,
      note: showBalances
        ? "Lead with totalOperationalBalanceInr (or totalBookBalanceInr) when the user asks for total bank balance; list accounts as secondary detail."
        : "Balances hidden — need bank.viewfullaccount or finance/accounts report access.",
    },
    { sources: ["bank_accounts"] }
  );

  if (reportIntent) {
    const chartPoints = showBalances
      ? accountRows
          .filter((a) => a.bookBalance != null)
          .sort((a, b) => Number(b.bookBalance) - Number(a.bookBalance))
          .slice(0, 8)
          .map((a) => ({
            label: String(a.nickname || a.bank || a.id).slice(0, 18),
            value: Number(a.bookBalance ?? 0),
            unit: "inr" as const,
          }))
      : [
          { label: "Accounts", value: accounts.length, unit: "count" as const },
        ];

    const { attachment } = buildSkillReportPack({
      packId: "bank_accounts_report",
      reportMode,
      detailedMax: NOVA_REPORT_DETAILED_ROW_CAP_WIDE,
      title: "Bank accounts report",
      headline: showBalances
        ? `${accounts.length} account(s) · book ${inr(totalBook)}${
            operationalTotal != null ? ` · operational ${inr(operationalTotal)}` : ""
          }`
        : `${accounts.length} account(s) · balances hidden`,
      period: {
        label: "point in time",
        grain: "open",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "bank_accounts.count",
          version: "1",
          certification: "draft",
          value: accounts.length,
          display: `${accounts.length} accounts`,
        },
        {
          metricId: "bank_accounts.book_total",
          version: "1",
          certification: "draft",
          value: showBalances ? totalBook : null,
          display: showBalances ? inr(totalBook) : "hidden",
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: showBalances
            ? ["bank_accounts.book_total"]
            : ["bank_accounts.count"],
          title: showBalances ? "Book balance by account" : "Account count",
          points: chartPoints,
        },
      ],
      tables: [
        {
          id: "bank_accounts_rows",
          title: "Active bank accounts",
          columns: ["Bank", "Nickname", "Kind", "Book", "Statement"],
          rows: accountRows.map((a) => [
            reportCell(a.bank),
            reportCell(a.nickname),
            reportCell(a.kind),
            reportCell(a.bookBalanceInr),
            reportCell(a.statementBalanceInr),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        showBalances
          ? "Operational total from totalOperationalBankBalance when available."
          : "Balances hidden without bank.viewfullaccount or finance aggregate access.",
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
