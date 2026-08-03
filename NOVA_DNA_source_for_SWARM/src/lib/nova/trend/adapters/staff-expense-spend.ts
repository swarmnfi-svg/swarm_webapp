/**
 * Adapter — staff-linked expense spend trend.
 * SoT: PAID ManualExpensePayment, PAID expense PaymentRequest rows not mirrored
 * to manual vouchers, and POSTED StaffAdvanceSettlementLine expenses.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import {
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
} from "@/lib/nova/trend/contract";
import {
  bindNovaTrendWindow,
  formatBucketKey,
  inferNovaTrendGrain,
  novaTrendPrismaDays,
} from "@/lib/nova/trend/window";
import { rankNovaTrendEntities } from "@/lib/nova/trend/rank";
import type { TrendLoadFail, TrendLoadOk } from "@/lib/nova/trend/adapters/attendance-late";
import type { NovaSkillHandlerContext } from "@/lib/nova/skills/skill-contract";

const n = (v: unknown) => Number(v ?? 0);

const EXPENSE_PAYMENT_REQUEST_TYPES = [
  "STAFF_EXPENSE_REIMBURSEMENT",
  "GENERAL_EXPENSE",
  "PROJECT_EXPENSE",
  "STAFF_ADVANCE_SETTLEMENT_EXTRA_PAYMENT",
] as const;

type StaffTotal = {
  label: string;
  total: number;
  count: number;
};

function addStaff(
  map: Map<string, StaffTotal>,
  staffId: string,
  label: string,
  amount: number
) {
  const row = map.get(staffId) ?? { label, total: 0, count: 0 };
  row.total += amount;
  row.count += 1;
  map.set(staffId, row);
}

function addBucket(map: Map<string, number>, bucket: string, amount: number) {
  map.set(bucket, (map.get(bucket) ?? 0) + amount);
}

export async function loadStaffExpenseSpendTrend(
  ctx: NovaSkillHandlerContext
): Promise<TrendLoadOk | TrendLoadFail> {
  const { user, query, tz, range } = ctx;
  if (
    !(
      can(user, "accounts.dashboard.read") ||
      can(user, "accounts.read") ||
      can(user, "accounts.reports.read")
    ) ||
    !canViewOrgFinanceAggregates(user)
  ) {
    return {
      ok: false,
      denied: true,
      error: "Missing accounts finance access and/or org finance aggregates (money-hide)",
    };
  }

  const window = bindNovaTrendWindow(query, { range, tz });
  const grain = inferNovaTrendGrain(window.from, window.to);
  const links = [
    { title: "Manual expenses", href: "/accounts/expenses" },
    { title: "Payment requests", href: "/payment-requests" },
    { title: "Staff advance settlements", href: "/staff-advances/settlements" },
  ];

  const [manualRows, paymentRows, settlementRows] = await Promise.all([
    prisma.manualExpensePayment.findMany({
      where: {
        status: "PAID",
        entryType: "EXPENSE",
        staffId: { not: null },
        paidAt: { gte: window.from, lte: window.to },
      },
      select: {
        amount: true,
        paidAt: true,
        staffId: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
      take: 5000,
    }),
    prisma.paymentRequest.findMany({
      where: {
        status: "PAID",
        requestType: { in: [...EXPENSE_PAYMENT_REQUEST_TYPES] },
        manualExpensePayment: null,
        staffId: { not: null },
        paidAt: { gte: window.from, lte: window.to },
      },
      select: {
        amount: true,
        paidAt: true,
        staffId: true,
        staff: { select: { fullName: true, staffCode: true } },
      },
      take: 5000,
    }),
    prisma.staffAdvanceSettlementLine.findMany({
      where: {
        date: { gte: window.from, lte: window.to },
        settlement: { status: "POSTED" },
      },
      select: {
        totalAmount: true,
        date: true,
        settlement: {
          select: {
            staffId: true,
            staff: { select: { fullName: true, staffCode: true } },
          },
        },
      },
      take: 5000,
    }),
  ]);

  const bucketTotals = new Map<string, number>();
  for (const day of novaTrendPrismaDays(window, tz)) {
    bucketTotals.set(formatBucketKey(day, grain, tz), 0);
  }
  const staffTotals = new Map<string, StaffTotal>();

  for (const row of manualRows) {
    if (!row.staffId || !row.paidAt) continue;
    const amount = Math.round(n(row.amount));
    addBucket(bucketTotals, formatBucketKey(row.paidAt, grain, tz), amount);
    addStaff(staffTotals, row.staffId, row.staff?.fullName ?? "Unknown staff", amount);
  }
  for (const row of paymentRows) {
    if (!row.staffId || !row.paidAt) continue;
    const amount = Math.round(n(row.amount));
    addBucket(bucketTotals, formatBucketKey(row.paidAt, grain, tz), amount);
    addStaff(staffTotals, row.staffId, row.staff?.fullName ?? "Unknown staff", amount);
  }
  for (const row of settlementRows) {
    const staffId = row.settlement.staffId;
    const amount = Math.round(n(row.totalAmount));
    addBucket(bucketTotals, formatBucketKey(row.date, grain, tz), amount);
    addStaff(staffTotals, staffId, row.settlement.staff.fullName, amount);
  }

  const series = [...bucketTotals.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bucket, value]) => ({ bucket, value, label: bucket }));
  const rankings = rankNovaTrendEntities(
    [...staffTotals.entries()].map(([staffId, row]) => ({
      entityId: staffId,
      label: row.label,
      value: row.total,
      secondary: `${row.count} row${row.count === 1 ? "" : "s"}`,
    }))
  );
  const empty = series.every((s) => s.value === 0) && rankings.length === 0;

  const bundle: NovaTrendBundle = {
    schemaVersion: NOVA_TREND_SCHEMA_VERSION,
    domain: "staff_expense_spend",
    entity: { kind: "org", label: "Organisation" },
    metric: {
      id: "staff_expense_spend_inr",
      label: "Staff expense spend INR",
      unit: "INR",
    },
    window,
    grain,
    series,
    rankings,
    links,
    empty,
    message: empty
      ? "No staff-linked paid expense, reimbursement, or posted settlement expense rows matched this window."
      : null,
    methodology:
      "Uses staff-linked paid manual expenses, paid expense payment requests without a mirrored manual voucher, and posted staff-advance settlement lines. Staff advances themselves are not counted as spend.",
  };

  return empty ? { ok: false, empty: true, bundle } : { ok: true, bundle };
}
