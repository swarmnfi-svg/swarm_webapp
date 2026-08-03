/**
 * Phase G — collection delay estimate (labeled prediction only).
 * Interpretable heuristic from overdue age buckets — never ledger truth.
 * Honest empty when no overdue facts / finance permission.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { novaTodayStart } from "@/lib/ai/nova-dates";
import {
  buildNovaPredictionFinding,
  formatNovaFindings,
} from "@/lib/nova/recipes/finding";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000)));
}

/**
 * Simple interpretable delay band from mean days-past-due.
 * Not a trained ML model — labeled as heuristic prediction.
 */
export function estimateCollectionDelayBand(meanDaysPastDue: number): {
  band: string;
  confidenceNote: string;
} {
  if (meanDaysPastDue <= 7) {
    return { band: "likely within ~1–2 weeks", confidenceNote: "low–medium (thin overdue sample)" };
  }
  if (meanDaysPastDue <= 30) {
    return { band: "likely ~2–6 weeks further delay", confidenceNote: "medium (age-bucket heuristic)" };
  }
  return {
    band: "elevated delay risk (often 6+ weeks)",
    confidenceNote: "medium (long-overdue cohort heuristic)",
  };
}

export async function runCollectionDelayEstimate(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, tz, entityHint, entityFilterName } = ctx;
  const name = "collection_delay_estimate";
  const links: NovaToolLink[] = [];

  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) {
    return {
      fact: {
        tool: name,
        ok: false,
        denied: true,
        error: "Missing invoice.read and/or finance aggregates — prediction closed",
      },
    };
  }

  const today = novaTodayStart(new Date(), tz);
  const where = {
    OR: [
      { status: "OVERDUE" as const },
      { status: { in: ["SENT" as const, "PART_PAID" as const] }, dueDate: { lt: today } },
    ],
    ...(entityHint
      ? {
          customer: {
            customerName: { contains: entityFilterName, mode: "insensitive" as const },
          },
        }
      : {}),
  };

  const rows = await prisma.salesInvoice.findMany({
    where,
    orderBy: { dueDate: "asc" },
    take: 40,
    select: {
      id: true,
      invoiceNumber: true,
      dueDate: true,
      customer: { select: { id: true, customerName: true } },
    },
  });

  if (rows.length < 1) {
    return {
      fact: {
        tool: name,
        ok: true,
        data: withFactProvenance(
          {
            empty: true,
            predictionAvailable: false,
            note:
              "No overdue invoice facts to estimate from — prediction withheld (honest empty; not a guarantee of collections).",
          },
          { sources: ["overdue_invoices"] }
        ),
      },
      links: [{ title: "Billing", href: "/billing" }],
    };
  }

  const ages = rows
    .map((r) => (r.dueDate ? daysBetween(today, r.dueDate) : null))
    .filter((d): d is number => d != null);
  if (ages.length < 1) {
    return {
      fact: {
        tool: name,
        ok: true,
        data: withFactProvenance(
          {
            empty: true,
            predictionAvailable: false,
            note: "Overdue rows lack due dates — cannot estimate delay.",
          },
          { sources: ["overdue_invoices"] }
        ),
      },
      links: [{ title: "Billing", href: "/billing" }],
    };
  }

  const mean = ages.reduce((s, d) => s + d, 0) / ages.length;
  const { band, confidenceNote } = estimateCollectionDelayBand(mean);
  const finding = buildNovaPredictionFinding({
    observation: `Collection delay estimate for ${ages.length} overdue invoice(s): ${band}.`,
    evidence: [
      {
        toolId: "overdue_invoices",
        entityIds: rows.slice(0, 5).map((r) => r.id),
        summary: `n=${ages.length} · mean days past due=${mean.toFixed(1)}`,
      },
    ],
    contributors: [{ toolId: "overdue_invoices", role: "feature_source" }],
    features: [
      `overdue_count=${ages.length}`,
      `mean_days_past_due=${mean.toFixed(1)}`,
      `max_days_past_due=${Math.max(...ages)}`,
      entityFilterName ? `customer_filter=${entityFilterName}` : "customer_filter=none",
    ],
    estimateLabel: `${band} (${confidenceNote})`,
    impact: "Labeled heuristic only — not a cash forecast or ledger balance.",
    recommendation: { label: "Open billing", href: "/billing" },
  });

  links.push({ title: "Billing", href: "/billing" });

  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          empty: false,
          predictionAvailable: true,
          sampleSize: ages.length,
          meanDaysPastDue: Number(mean.toFixed(1)),
          estimateLabel: finding.estimateLabel,
          features: finding.features,
          findings: [finding],
          findingsFormatted: formatNovaFindings([finding]),
          note:
            "Prediction — not ledger truth. Do not treat this band as an invoice total or cash guarantee.",
        },
        { sources: ["overdue_invoices", "collection_delay_estimate"] }
      ),
    },
    links,
  };
}
