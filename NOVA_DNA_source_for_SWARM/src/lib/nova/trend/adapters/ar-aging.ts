/**
 * Adapter — AR aging time series (overdue outstanding reconstructed as-of bucket ends).
 * SoT: SalesInvoice + receipts/CN/DN dates (same outstanding math as receivables report).
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import {
  NOVA_TREND_SCHEMA_VERSION,
  type NovaTrendBundle,
  type NovaTrendGrain,
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

/** Posted invoices that may have held open AR during the window. */
const AR_TREND_STATUSES = [
  "SENT",
  "PART_PAID",
  "OVERDUE",
  "FULLY_PAID",
  "CREDIT_NOTE_ISSUED",
] as const;

/** Days past invoice date → overdue for trend (31+ aligns with UI b30+ buckets). */
export const AR_TREND_OVERDUE_DAYS = 30;

export type ArAgingAsOfInput = {
  invoiceDate: Date;
  grandTotal: unknown;
  receipts: { amount: unknown; receiptDate: Date }[];
  creditNotes: { grandTotal: unknown; cnDate: Date; voidedAt: Date | null }[];
  debitNotes: { grandTotal: unknown; dnDate: Date; voidedAt: Date | null }[];
};

/** Outstanding as of `asOf` end — receipts/CN/DN only when dated on/before asOf. */
export function invoiceOutstandingAsOf(inv: ArAgingAsOfInput, asOf: Date): number {
  if (inv.invoiceDate.getTime() > asOf.getTime()) return 0;
  const paid = inv.receipts
    .filter((r) => r.receiptDate.getTime() <= asOf.getTime())
    .reduce((s, r) => s + n(r.amount), 0);
  const credited = inv.creditNotes
    .filter((c) => !c.voidedAt && c.cnDate.getTime() <= asOf.getTime())
    .reduce((s, c) => s + n(c.grandTotal), 0);
  const debited = inv.debitNotes
    .filter((d) => !d.voidedAt && d.dnDate.getTime() <= asOf.getTime())
    .reduce((s, d) => s + n(d.grandTotal), 0);
  return Math.max(0, n(inv.grandTotal) + debited - paid - credited);
}

export function agingDaysAsOf(invoiceDate: Date, asOf: Date): number {
  return Math.max(
    0,
    Math.floor((asOf.getTime() - invoiceDate.getTime()) / 86400000)
  );
}

/** Prefer week grain for AR (daily as-of snapshots are noisy / heavy). */
export function preferArAgingGrain(from: Date, to: Date): NovaTrendGrain {
  const base = inferNovaTrendGrain(from, to);
  if (base === "day") return "week";
  return base;
}

/** Last calendar day of each grain bucket in the window. */
export function trendBucketEndDates(
  window: { from: Date; to: Date },
  grain: NovaTrendGrain,
  tz: string
): Date[] {
  const days = novaTrendPrismaDays(
    { ...window, label: "", source: "parsed" },
    tz
  );
  const lastByBucket = new Map<string, Date>();
  for (const d of days) {
    lastByBucket.set(formatBucketKey(d, grain, tz), d);
  }
  return [...lastByBucket.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, d]) => d);
}

export function loadArAgingTrend(
  ctx: NovaSkillHandlerContext
): Promise<TrendLoadOk | TrendLoadFail> {
  return loadArAgingTrendInner(ctx);
}

async function loadArAgingTrendInner(
  ctx: NovaSkillHandlerContext
): Promise<TrendLoadOk | TrendLoadFail> {
  const { user, query, tz, range } = ctx;
  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      ok: false,
      denied: true,
      error: "Missing invoice.read and/or org finance aggregates (money-hide)",
    };
  }

  const window = bindNovaTrendWindow(query, { range, tz });
  const grain = preferArAgingGrain(window.from, window.to);
  const links = [{ title: "Receivables", href: "/accounts/receivables" }];

  const customerId =
    ctx.resolvedEntityType === "customer" && ctx.resolvedEntityDbId
      ? ctx.resolvedEntityDbId
      : null;
  const customerName =
    ctx.entityFilterName?.trim() ||
    ctx.entityHint?.trim() ||
    (customerId ? "Customer" : null);

  const invoices = await prisma.salesInvoice.findMany({
    where: {
      status: { in: [...AR_TREND_STATUSES] },
      invoiceDate: { lte: window.to },
      ...(customerId ? { customerId } : {}),
      ...(!customerId && customerName
        ? {
            customer: {
              customerName: { contains: customerName, mode: "insensitive" },
            },
          }
        : {}),
    },
    select: {
      id: true,
      invoiceDate: true,
      grandTotal: true,
      customerId: true,
      customer: { select: { customerName: true } },
      receipts: { select: { amount: true, receiptDate: true } },
      creditNotes: { select: { grandTotal: true, cnDate: true, voidedAt: true } },
      debitNotes: { select: { grandTotal: true, dnDate: true, voidedAt: true } },
    },
    take: 8000,
  });

  const asOfDates = trendBucketEndDates(window, grain, tz);
  if (asOfDates.length < 2) {
    const empty: NovaTrendBundle = {
      schemaVersion: NOVA_TREND_SCHEMA_VERSION,
      domain: "ar_aging",
      entity: customerName
        ? { kind: "party", id: customerId, label: customerName }
        : { kind: "org", label: "Organisation" },
      metric: {
        id: "overdue_outstanding_inr",
        label: "Overdue outstanding ₹",
        unit: "₹ overdue",
      },
      window,
      grain,
      series: [],
      rankings: [],
      links,
      empty: true,
      message:
        "AR aging trend needs at least two time buckets in the window — try “last 60 days” or “last 3 months”.",
    };
    return { ok: false, empty: true, bundle: empty };
  }

  const series: NovaTrendBundle["series"] = [];
  const byCustomerStart = new Map<string, { label: string; overdue: number }>();
  const byCustomerEnd = new Map<string, { label: string; overdue: number }>();

  for (let i = 0; i < asOfDates.length; i++) {
    const asOf = asOfDates[i]!;
    const bucket = formatBucketKey(asOf, grain, tz);
    let orgOverdue = 0;
    const perCustomer = new Map<string, { label: string; overdue: number }>();

    for (const inv of invoices) {
      const outstanding = invoiceOutstandingAsOf(inv, asOf);
      if (outstanding <= 0.01) continue;
      const days = agingDaysAsOf(inv.invoiceDate, asOf);
      if (days <= AR_TREND_OVERDUE_DAYS) continue;
      const amt = Math.round(outstanding);
      orgOverdue += amt;
      const id = inv.customerId;
      const label = inv.customer.customerName;
      const cur = perCustomer.get(id) ?? { label, overdue: 0 };
      cur.overdue += amt;
      perCustomer.set(id, cur);
    }

    series.push({ bucket, value: orgOverdue, label: bucket });

    if (i === 0) {
      for (const [id, v] of perCustomer) byCustomerStart.set(id, v);
    }
    if (i === asOfDates.length - 1) {
      for (const [id, v] of perCustomer) byCustomerEnd.set(id, v);
    }
  }

  const riseRows: {
    entityId: string;
    label: string;
    value: number;
    secondary: string;
  }[] = [];
  const ids = new Set([...byCustomerStart.keys(), ...byCustomerEnd.keys()]);
  for (const id of ids) {
    const start = byCustomerStart.get(id)?.overdue ?? 0;
    const end = byCustomerEnd.get(id)?.overdue ?? 0;
    const rise = end - start;
    if (rise <= 0) continue;
    const label =
      byCustomerEnd.get(id)?.label ?? byCustomerStart.get(id)?.label ?? id;
    riseRows.push({
      entityId: id,
      label,
      value: rise,
      secondary: `start ₹${start} → end ₹${end}`,
    });
  }

  const rankings = rankNovaTrendEntities(riseRows);

  const empty = series.every((s) => s.value === 0) && rankings.length === 0;
  const bundle: NovaTrendBundle = {
    schemaVersion: NOVA_TREND_SCHEMA_VERSION,
    domain: "ar_aging",
    entity: customerName
      ? { kind: "party", id: customerId, label: customerName }
      : { kind: "org", label: "Organisation" },
    metric: {
      id: "overdue_outstanding_inr",
      label: rankings.length ? "Overdue rise ₹" : "Overdue outstanding ₹",
      unit: "₹ overdue",
    },
    window,
    grain,
    series,
    rankings,
    methodology:
      "As-of overdue (invoice age > 30 days) reconstructed from SalesInvoice receipts/CN/DN dated on or before each bucket end — same outstanding math as /accounts/receivables. Rankings = customers whose overdue ₹ rose from first → last bucket.",
    links,
    empty,
    message: empty
      ? `No overdue receivables movement in ${window.label}.`
      : null,
  };

  return { ok: true, bundle };
}
