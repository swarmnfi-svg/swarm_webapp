/**
 * Skill — bank_recon_summary.
 * Report-intent asks return a savable bank_recon_report pack.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
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
          sources: ["bank_recon"],
        }),
      },
      links,
    };
  }
  return { fact, links };
}

export async function runBankReconSummary(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, sampleLimit } = ctx;
  const name = "bank_recon_summary";
  const facts: NovaSkillHandlerResult["fact"][] = [];
  const links: NovaToolLink[] = [];
  const finalize = () => finalizeFrom(facts, links);

  if (!can(user, "bank.read") && !can(user, "bank.reconcile")) {
    facts.push({ tool: name, ok: false, denied: true, error: "Missing bank.read / bank.reconcile" });
    return finalize();
  }
  const showBalances =
    can(user, "bank.viewfullaccount") || canViewOrgFinanceAggregates(user);
  const { reportMode, reportIntent, rowCap } = resolveSkillReportIntent(query, sampleLimit);
  const { getUnreconciledAging, getOldestUnreconciled } = await import("@/lib/unreconciled-aging");
  const aging = can(user, "bank.reconcile") ? await getUnreconciledAging() : null;
  const oldest = can(user, "bank.reconcile") ? await getOldestUnreconciled(5).catch(() => []) : [];
  const [accounts, uploadAgg, recentUploads] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { active: true },
      orderBy: { bankName: "asc" },
      take: 12,
      select: {
        bankAccountId: true,
        bankName: true,
        accountNickname: true,
        statementCurrentBalance: true,
        manualCurrentBalance: true,
        lastStatementUploadDate: true,
      },
    }),
    prisma.bankStatementUpload
      .aggregate({
        _count: { _all: true },
        _sum: { rowCount: true, importedCount: true, duplicateCount: true },
      })
      .catch(() => null),
    prisma.bankStatementUpload
      .findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          fileName: true,
          rowCount: true,
          importedCount: true,
          duplicateCount: true,
          createdAt: true,
          bankAccount: { select: { accountNickname: true, bankName: true } },
        },
      })
      .catch(() => []),
  ]);
  const accountsWithUpload = accounts.filter((a) => a.lastStatementUploadDate).length;
  const oldestSamples = Array.isArray(oldest)
    ? oldest.slice(0, 5).map((r) => ({
        id: r.bankTransactionId ?? r.id,
        date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
        amountInr: showBalances ? inr(n(r.amount)) : "hidden",
        amount: showBalances ? n(r.amount) : null,
        direction: r.direction,
        bank: r.bankAccount?.accountNickname ?? r.bankAccount?.bankName ?? null,
      }))
    : [];

  const agingBuckets = aging?.buckets ?? null;
  const data = {
    unreconciledTotal: aging?.total ?? null,
    oldestDays: aging?.oldestDays ?? null,
    agingBuckets,
    oldestSamples,
    balancesVisible: showBalances,
    lastStatementUpload: {
      accountsWithUpload,
      activeAccountCount: accounts.length,
      uploadCount: uploadAgg?._count._all ?? 0,
      totalRows: uploadAgg?._sum.rowCount ?? 0,
      totalImported: uploadAgg?._sum.importedCount ?? 0,
      totalDuplicates: uploadAgg?._sum.duplicateCount ?? 0,
      recent: (recentUploads ?? []).map((u) => ({
        file: u.fileName,
        bank: u.bankAccount?.accountNickname ?? u.bankAccount?.bankName ?? null,
        rows: u.rowCount,
        imported: u.importedCount,
        duplicates: u.duplicateCount,
        uploadedAt: u.createdAt.toISOString().slice(0, 10),
      })),
    },
    accounts: accounts.map((a) => ({
      id: a.bankAccountId,
      name: a.accountNickname ?? a.bankName,
      statementBalanceInr: showBalances ? inr(n(a.statementCurrentBalance)) : "hidden",
      manualBalanceInr: showBalances ? inr(n(a.manualCurrentBalance)) : "hidden",
      lastStatementUpload: a.lastStatementUploadDate?.toISOString().slice(0, 10) ?? null,
    })),
    note: showBalances
      ? "Open /bank-statements to upload or review statement files."
      : "Balances hidden — need bank.viewfullaccount or finance/accounts report access. Open /bank-statements for uploads.",
  };

  if (can(user, "bank.reconcile")) links.push({ title: "Reconciliation", href: "/reconciliation" });
  links.push({ title: "Bank statements", href: "/bank-statements" });
  links.push({ title: "Bank accounts", href: "/finance/accounts" });

  if (reportIntent) {
    const bucketPoints = Array.isArray(agingBuckets)
      ? (agingBuckets as { label?: string; bucket?: string; count?: number }[])
          .map((b) => ({
            label: String(b.label ?? b.bucket ?? "bucket").slice(0, 18),
            value: Number(b.count ?? 0),
            unit: "count" as const,
          }))
          .filter((p) => Number.isFinite(p.value))
          .slice(0, 8)
      : [];
    const unreconciled = Number(aging?.total ?? 0);

    const { attachment } = buildSkillReportPack({
      packId: "bank_recon_report",
      reportMode,
      title: "Bank reconciliation report",
      headline:
        aging != null
          ? `${unreconciled} unreconciled · oldest ${aging.oldestDays ?? "—"} day(s)`
          : `${accounts.length} active account(s) · reconcile permission required for aging`,
      period: {
        label: "point in time",
        grain: "open",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "bank_recon.unreconciled_total",
          version: "1",
          certification: "draft",
          value: aging?.total ?? null,
          display: aging != null ? `${unreconciled} unreconciled` : "n/a",
        },
        {
          metricId: "bank_recon.active_accounts",
          version: "1",
          certification: "draft",
          value: accounts.length,
          display: `${accounts.length} accounts`,
        },
      ],
      charts: [
        {
          bindingId: "ageing_or_attention",
          metricIds: ["bank_recon.unreconciled_total"],
          title: bucketPoints.length ? "Unreconciled aging buckets" : "Unreconciled vs accounts",
          points: bucketPoints.length
            ? bucketPoints
            : [
                { label: "Unreconciled", value: unreconciled, unit: "count" },
                { label: "Accounts", value: accounts.length, unit: "count" },
              ],
        },
      ],
      tables: [
        {
          id: "bank_recon_oldest",
          title: "Oldest unreconciled samples",
          columns: ["Date", "Bank", "Direction", "Amount"],
          rows: oldestSamples.map((r) => [
            reportCell(r.date),
            reportCell(r.bank),
            reportCell(r.direction),
            reportCell(r.amountInr),
          ]),
        },
        {
          id: "bank_recon_accounts",
          title: "Active bank accounts",
          columns: ["Account", "Statement", "Book", "Last upload"],
          rows: data.accounts.map((a) => [
            reportCell(a.name),
            reportCell(a.statementBalanceInr),
            reportCell(a.manualBalanceInr),
            reportCell(a.lastStatementUpload),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        showBalances
          ? "Balances visible under bank.viewfullaccount / org finance aggregates."
          : "Balances hidden without bank.viewfullaccount or finance aggregate access.",
      ],
    });
    facts.push({
      tool: name,
      ok: true,
      data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
    });
    return finalize();
  }

  facts.push({
    tool: name,
    ok: true,
    data,
  });
  return finalize();
}
