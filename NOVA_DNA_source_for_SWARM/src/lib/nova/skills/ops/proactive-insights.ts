/**
 * Phase F — proactive insights (read-only queue).
 * Deterministic rules → Finding cards with provenance. No silent writes / NBA posts.
 */
import { can, canViewOrgFinanceAggregates } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { inr } from "@/lib/format";
import { novaTodayStart } from "@/lib/ai/nova-dates";
import { canViewBackupHistory } from "@/lib/backup/access";
import { novaOpenApprovalsWhere } from "@/lib/ai/nova-approvals";
import {
  buildNovaFinding,
  formatNovaFindings,
  type NovaFinding,
} from "@/lib/nova/recipes/finding";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";

const n = (v: unknown) => Number(v ?? 0);

export type NovaInsightCard = {
  id: string;
  title: string;
  finding: NovaFinding;
  /** Amounts omitted when money-hide applies */
  moneyHidden?: boolean;
};

async function insightOverdueCollections(
  ctx: NovaSkillHandlerContext
): Promise<NovaInsightCard | null> {
  const { user, tz } = ctx;
  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) return null;
  const today = novaTodayStart(new Date(), tz);
  const where = {
    OR: [
      { status: "OVERDUE" as const },
      { status: { in: ["SENT" as const, "PART_PAID" as const] }, dueDate: { lt: today } },
    ],
  };
  const [count, agg] = await Promise.all([
    prisma.salesInvoice.count({ where }),
    prisma.salesInvoice.aggregate({ where, _sum: { grandTotal: true } }),
  ]);
  if (count < 1) return null;
  const total = n(agg._sum.grandTotal);
  return {
    id: "overdue_collections",
    title: "Overdue collections",
    finding: buildNovaFinding({
      observation: `${count} overdue invoice(s) totalling ${inr(total)}.`,
      evidence: [
        {
          toolId: "overdue_invoices",
          summary: `${count} overdue · ${inr(total)}`,
        },
      ],
      contributors: [{ toolId: "overdue_invoices", role: "source" }],
      recommendation: { label: "Open billing", href: "/billing" },
      confidence: "fact",
    }),
  };
}

async function insightApprovalBottlenecks(
  ctx: NovaSkillHandlerContext
): Promise<NovaInsightCard | null> {
  const { user } = ctx;
  const where = novaOpenApprovalsWhere(user);
  if (!where) return null;
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const aged = await prisma.approvalRequest.count({
    where: { ...where, updatedAt: { lt: cutoff } },
  });
  if (aged < 1) return null;
  return {
    id: "approval_bottlenecks",
    title: "Approval bottlenecks",
    finding: buildNovaFinding({
      observation: `${aged} open approval(s) idle ≥ 3 days.`,
      evidence: [{ toolId: "approvals_summary", summary: `${aged} aged open approvals` }],
      contributors: [{ toolId: "approvals_summary", role: "source" }],
      recommendation: { label: "Open approvals", href: "/approvals" },
      confidence: "fact",
    }),
  };
}

async function insightPayrollBlockers(
  ctx: NovaSkillHandlerContext
): Promise<NovaInsightCard | null> {
  const { user } = ctx;
  if (
    !can(user, "hr.salary.read") &&
    !can(user, "hr.payslip.read") &&
    !can(user, "hr.attendance.read")
  ) {
    return null;
  }
  // Let count failures throw → outer runner omits this card (never invent 0 blockers).
  const openRuns = await prisma.hrPayrollRun.count({
    where: { status: { in: ["DRAFT", "PENDING_REVIEW"] } },
  });
  const pendingOt =
    can(user, "hr.overtime.approve") || can(user, "hr.overtime.read")
      ? await prisma.hrOvertimeRecord.count({ where: { status: "PENDING" } })
      : 0;
  const pendingReg =
    can(user, "hr.regularisation.approve") || can(user, "hr.regularisation.read")
      ? await prisma.hrRegularisationRequest.count({ where: { status: "PENDING" } })
      : 0;
  const blockers = openRuns + pendingOt + pendingReg;
  if (blockers < 1) return null;
  return {
    id: "payroll_blockers",
    title: "Payroll blockers",
    finding: buildNovaFinding({
      observation: `Payroll-related blockers: ${openRuns} open payroll run(s), ${pendingOt} OT pending, ${pendingReg} regularisation pending.`,
      evidence: [
        {
          toolId: "salary_summary",
          summary: `runs=${openRuns} ot=${pendingOt} reg=${pendingReg}`,
        },
      ],
      contributors: [{ toolId: "salary_summary", role: "source" }],
      recommendation: { label: "Open payroll", href: "/attendance-hr/payroll" },
      confidence: "fact",
    }),
  };
}

async function insightLowStock(ctx: NovaSkillHandlerContext): Promise<NovaInsightCard | null> {
  const { user } = ctx;
  if (!can(user, "stock.read")) return null;
  const items = await prisma.itemMaster.findMany({
    where: { active: true, minimumStock: { gt: 0 } },
    take: 80,
    select: { currentStock: true, minimumStock: true, name: true, itemCode: true },
  });
  const below = items.filter((i) => n(i.currentStock) <= n(i.minimumStock));
  if (below.length < 1) return null;
  const sample = below
    .slice(0, 3)
    .map((i) => i.itemCode || i.name)
    .join(", ");
  return {
    id: "low_stock",
    title: "Low stock",
    finding: buildNovaFinding({
      observation: `${below.length} item(s) at or below minimum stock` + (sample ? ` (e.g. ${sample})` : "") + ".",
      evidence: [{ toolId: "stock_summary", summary: `${below.length} below minimum` }],
      contributors: [{ toolId: "stock_summary", role: "source" }],
      recommendation: { label: "Open stock", href: "/stock" },
      confidence: "fact",
    }),
  };
}

async function insightProjectDelays(ctx: NovaSkillHandlerContext): Promise<NovaInsightCard | null> {
  const { user } = ctx;
  if (!can(user, "project.read")) return null;
  const today = new Date();
  const delayed = await prisma.project.count({
    where: {
      status: { notIn: ["CLOSED", "CANCELLED"] },
      expectedCompletionDate: { lt: today },
    },
  });
  if (delayed < 1) return null;
  return {
    id: "project_delays",
    title: "Project delays",
    finding: buildNovaFinding({
      observation: `${delayed} active project(s) past expected completion.`,
      evidence: [{ toolId: "projects_summary", summary: `${delayed} past expected completion` }],
      contributors: [{ toolId: "projects_summary", role: "source" }],
      recommendation: { label: "Open projects", href: "/projects" },
      confidence: "fact",
    }),
  };
}

async function insightGstExceptions(ctx: NovaSkillHandlerContext): Promise<NovaInsightCard | null> {
  const { user } = ctx;
  if (!can(user, "invoice.read") || !canViewOrgFinanceAggregates(user)) return null;
  const failed = await prisma.eInvoiceRecord.count({
    where: { status: { in: ["FAILED", "CANCELLED"] } },
  });
  if (failed < 1) return null;
  return {
    id: "gst_exceptions",
    title: "GST exceptions",
    finding: buildNovaFinding({
      observation: `${failed} e-invoice record(s) in failed/cancelled status.`,
      evidence: [{ toolId: "gst_docs_summary", summary: `${failed} exception statuses` }],
      contributors: [{ toolId: "gst_docs_summary", role: "source" }],
      recommendation: { label: "GST summary", href: "/accounts/gst-summary" },
      confidence: "fact",
    }),
  };
}

async function insightBackupConnector(
  ctx: NovaSkillHandlerContext
): Promise<NovaInsightCard | null> {
  const { user } = ctx;
  const cards: string[] = [];
  const evidence: NovaFinding["evidence"] = [];

  if (canViewBackupHistory(user)) {
    const failedBackup = await prisma.backupRecord.count({ where: { status: "FAILED" } });
    if (failedBackup > 0) {
      cards.push(`${failedBackup} failed backup record(s)`);
      evidence.push({ toolId: "backup_open", summary: `${failedBackup} FAILED backups` });
    }
  }

  if (can(user, "tally.dashboard.view")) {
    const staleCutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const stale = await prisma.tallyConnection.count({
      where: {
        active: true,
        OR: [
          { lastSyncStatus: { in: ["FAILED"] } },
          { lastSyncAt: { lt: staleCutoff } },
          { lastSyncAt: null },
        ],
      },
    });
    if (stale > 0) {
      cards.push(`${stale} Tally connection(s) failed or stale`);
      evidence.push({ toolId: "tally_status", summary: `${stale} stale/failed connections` });
    }
  }

  if (!cards.length || !evidence.length) return null;
  return {
    id: "backup_connector_failures",
    title: "Backup / connector failures",
    finding: buildNovaFinding({
      observation: cards.join("; ") + ".",
      evidence,
      contributors: evidence.map((e) => ({ toolId: e.toolId, role: "source" })),
      recommendation: { label: "System tools", href: "/system/tools" },
      confidence: "fact",
    }),
  };
}

export async function runProactiveInsights(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const name = "proactive_insights";
  const links: NovaToolLink[] = [];
  const runners = [
    insightOverdueCollections,
    insightApprovalBottlenecks,
    insightPayrollBlockers,
    insightLowStock,
    insightProjectDelays,
    insightGstExceptions,
    insightBackupConnector,
  ];

  const insights: NovaInsightCard[] = [];
  let runnerFailures = 0;
  for (const run of runners) {
    try {
      const card = await run(ctx);
      if (card) insights.push(card);
    } catch {
      // Partial failure → omit rule; never invent zeros
      runnerFailures += 1;
    }
  }

  // Every insight rule threw → soft-fail (do not present as trusted empty).
  if (insights.length === 0 && runnerFailures === runners.length) {
    return {
      fact: {
        tool: name,
        ok: false,
        error:
          "Proactive insight lookups failed. Try again or open module screens — do not treat as zero alerts.",
      },
      links: [],
    };
  }

  const findings = insights.map((i) => i.finding);
  for (const i of insights) {
    if (i.finding.recommendation) {
      links.push({
        title: i.finding.recommendation.label,
        href: i.finding.recommendation.href,
      });
    }
  }

  const formatted = formatNovaFindings(findings);
  return {
    fact: {
      tool: name,
      ok: true,
      data: withFactProvenance(
        {
          insightCount: insights.length,
          insights: insights.map((i) => ({
            id: i.id,
            title: i.title,
            observation: i.finding.observation,
            confidence: i.finding.confidence,
            evidence: i.finding.evidence,
            recommendation: i.finding.recommendation ?? null,
          })),
          findingsFormatted: formatted || null,
          empty: insights.length === 0,
          partialLookupFailures: runnerFailures > 0 ? runnerFailures : undefined,
          note:
            insights.length === 0
              ? "No proactive insights matched your permissions and current ERP facts."
              : `${insights.length} read-only insight(s). Deep links only — NOVA does not create tasks or approvals.`,
        },
        { sources: insights.map((i) => i.id) }
      ),
    },
    links,
  };
}
