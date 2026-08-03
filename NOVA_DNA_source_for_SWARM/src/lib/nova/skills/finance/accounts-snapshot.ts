/**
 * Finance skill — accounts_snapshot (extracted from nova-tools; behaviour identical).
 * Structural journal/ledger counts + optional fund position. Never invents TB/P&L/BS.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { novaMoney } from "@/lib/ai/nova-money";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import { settlePromise } from "@/lib/nova/skills/settle";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

export async function runAccountsSnapshot(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user } = ctx;
  const name = "accounts_snapshot";
  const links: NovaToolLink[] = [];

  if (!can(user, "accounts.dashboard.read") && !can(user, "accounts.reports.read")) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing accounts.dashboard.read / reports",
      },
    };
  }

  const showMoney = canViewOrgFinanceAggregates(user);
  const [journalSettle, ledgerSettle, activeLedgerSettle, journalsByStatus, fund, bankOps] =
    await Promise.all([
      settlePromise(prisma.journalVoucher.count()),
      settlePromise(prisma.ledgerAccount.count()),
      settlePromise(prisma.ledgerAccount.count({ where: { active: true } })),
      settlePromise(prisma.journalVoucher.groupBy({ by: ["status"], _count: { _all: true } })),
      showMoney
        ? import("@/lib/finance/financial-account-queries")
            .then((m) => m.getFundPositionSummary())
            .catch(() => null)
        : Promise.resolve(null),
      showMoney
        ? import("@/lib/accounts/queries")
            .then((m) => m.totalOperationalBankBalance())
            .catch(() => null)
        : Promise.resolve(null),
    ]);

  // Primary structural counts both failed → surface error, never invent 0 journals/ledgers.
  if (!journalSettle.ok && !ledgerSettle.ok) {
    return {
      fact: {
        tool: name,
        ok: false,
        error:
          "Accounts journal/ledger lookup failed. Open /accounts — do not treat as zero counts.",
      },
      links: [{ title: "Accounts", href: "/accounts" }],
    };
  }

  const journalCount = journalSettle.ok ? journalSettle.value : null;
  const ledgerCount = ledgerSettle.ok ? ledgerSettle.value : null;
  const activeLedgerCount = activeLedgerSettle.ok ? activeLedgerSettle.value : null;
  const statusRows =
    journalsByStatus.ok && Array.isArray(journalsByStatus.value) ? journalsByStatus.value : [];
  const journalByStatus = Object.fromEntries(
    statusRows.map((r) => [r.status, r._count._all])
  ) as Record<string, number>;
  const postedJournals = journalByStatus.POSTED ?? 0;
  const draftJournals = journalByStatus.DRAFT ?? 0;
  const bankM = showMoney && bankOps != null ? novaMoney(bankOps) : null;
  const fundMoney = fund
    ? {
        cashInHand: novaMoney(fund.cashInHand),
        positiveBank: novaMoney(fund.positiveBank),
        bookBank: novaMoney(fund.bookBank),
        odCcUtilised: novaMoney(fund.odCcUtilised),
        odCcAvailable: novaMoney(fund.odCcAvailable),
        netFundsAvailable: novaMoney(fund.netFundsAvailable),
      }
    : null;
  const related = [
    { title: "Trial balance", href: "/accounts/trial-balance" },
    { title: "Cash book", href: "/accounts/cash-book" },
    { title: "Day book", href: "/accounts/day-book" },
    { title: "Chart of accounts", href: "/accounts/chart" },
    { title: "Ledger", href: "/accounts/ledger" },
    { title: "Balance sheet", href: "/accounts/balance-sheet" },
  ];

  links.push({ title: "Accounts", href: "/accounts" });
  links.push({ title: "Journals", href: "/accounts/journal" });
  links.push({ title: "Trial balance", href: "/accounts/trial-balance" });
  links.push({ title: "Cash book", href: "/accounts/cash-book" });
  links.push({ title: "Chart of accounts", href: "/accounts/chart" });
  links.push({ title: "Fund / bank book", href: "/finance/accounts" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          journalVoucherCount: journalCount,
          journalByStatus,
          postedJournalCount: postedJournals,
          draftJournalCount: draftJournals,
          ledgerAccountCount: ledgerCount,
          activeLedgerAccountCount: activeLedgerCount,
          balancesVisible: showMoney,
          operationalBankBalance: bankM?.value ?? null,
          operationalBankBalanceInr: bankM?.valueInr ?? "hidden",
          netFundsAvailableInr: fundMoney?.netFundsAvailable.valueInr ?? null,
          fundPosition: fundMoney
            ? {
                cashInHand: fundMoney.cashInHand.value,
                cashInHandInr: fundMoney.cashInHand.valueInr,
                positiveBank: fundMoney.positiveBank.value,
                positiveBankInr: fundMoney.positiveBank.valueInr,
                bookBank: fundMoney.bookBank.value,
                bookBankInr: fundMoney.bookBank.valueInr,
                odCcUtilised: fundMoney.odCcUtilised.value,
                odCcUtilisedInr: fundMoney.odCcUtilised.valueInr,
                odCcAvailable: fundMoney.odCcAvailable.value,
                odCcAvailableInr: fundMoney.odCcAvailable.valueInr,
                netFundsAvailable: fundMoney.netFundsAvailable.value,
                netFundsAvailableInr: fundMoney.netFundsAvailable.valueInr,
              }
            : null,
          related,
          moneyNote: "Copy *Inr fields exactly. Never reinterpret Indian commas.",
          note: showMoney
            ? "Structural counts + fund position only. Trial balance / P&L / BS figures are not invented here — open those screens."
            : "Money totals hidden — need finance aggregate access. Structural journal/ledger counts only; open Accounts for TB / ledgers.",
        },
        { sources: ["accounts_snapshot"] }
      ),
    },
    links,
  };
}
