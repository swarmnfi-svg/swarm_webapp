/**
 * Director Month Performance pack — NOVA 3.0 Sprint 2.
 * Bounded recipe → NovaPackResult (KPI + trend + ageing charts; ≤3 attentions).
 */

import { inr } from "@/lib/format";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolFact, NovaToolLink } from "@/lib/nova/core/tool-types";
import { buildNovaFinding, formatNovaFindings, type NovaFinding } from "@/lib/nova/recipes/finding";
import {
  assertRecipeContract,
  filterRecipeToolsForUser,
  type NovaRecipe,
} from "@/lib/nova/recipes/recipe-contract";
import {
  DAILY_BRIEF_FANOUT_CONCURRENCY,
  mapWithConcurrency,
} from "@/lib/nova/skills/ops/daily-brief";
import {
  buildNovaPackResult,
  selectNovaPackAttentions,
  type NovaPackChartDataset,
  type NovaPackMetricRef,
  type NovaPackResult,
  type NovaPackWarning,
} from "@/lib/nova/pack-result";
import { NOVA_MONTH_ATTENTION_PRIMARY_MAX } from "@/lib/nova/invariants";
import { getNovaMetric } from "@/lib/nova/semantic/metrics";
import { novaCurrentMonthRange } from "@/lib/ai/nova-dates";
import {
  buildNovaTrustWarnings,
  maxCacheAgeMsFromFacts,
  trustWarningsToPackWarnings,
} from "@/lib/nova/freshness-trust";

export const MONTH_PERFORMANCE_PACK_VERSION = "1.0.0";

export const MONTH_PERFORMANCE_RECIPE: NovaRecipe = {
  id: "month_performance",
  label: "Director Month Performance",
  description:
    "Period-explicit month summary: sales, collections, overdue, bank/director KPIs, project/CBG highlights — facts only.",
  toolIds: [
    "sales_summary",
    "receipts_summary",
    "overdue_invoices",
    "receivables_summary",
    "director_dashboard_summary",
    "bank_accounts_summary",
    "projects_summary",
    "cbg_quotations_summary",
  ],
  readOnly: true,
  maximumSteps: 8,
  examples: [
    "How is this month going?",
    "How is July going?",
    "Month performance",
    "Director brief for this month",
  ],
};

const MATERIAL_ATTENTION_TOOLS = new Set([
  "overdue_invoices",
  "receivables_summary",
  "projects_summary",
  "cbg_quotations_summary",
  "bank_accounts_summary",
]);

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function moneyDisplay(v: unknown): string {
  if (typeof v === "string" && v.trim()) {
    const trimmed = v.trim();
    if (/₹|Rs\.?/i.test(trimmed)) {
      // Already formatted — force exactly 2 decimal places.
      return trimmed.replace(/(₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)/gi, (_m, _s, num: string) => {
        const amount = Number(String(num).replace(/,/g, ""));
        return Number.isFinite(amount) ? inr(amount) : _m;
      });
    }
    const parsed = n(trimmed);
    if (trimmed !== "" && Number.isFinite(parsed)) return inr(parsed);
    return trimmed;
  }
  return inr(n(v));
}

function slimErrorNote(toolId: string, fact: NovaToolFact): string | null {
  if (fact.denied) return `Omitted ${toolId} (permission).`;
  if (!fact.ok) return `Omitted ${toolId} (${fact.error ?? "failed"}).`;
  return null;
}

function periodFromCtx(ctx: NovaSkillHandlerContext) {
  const range = ctx.range ?? novaCurrentMonthRange(new Date(), ctx.tz);
  const label = range.label || "this month";
  const grain =
    range.label?.toLowerCase().includes("fy") ? ("fy" as const) : ("month" as const);
  return {
    label,
    grain,
    calendarKind:
      grain === "fy"
        ? ("financial_year" as const)
        : ("calendar_month" as const),
    source: (ctx.range ? "explicit" : "default") as "explicit" | "default",
  };
}

function metricRef(metricId: string, value: number | string | null, display?: string, periodLabel?: string): NovaPackMetricRef {
  const def = getNovaMetric(metricId);
  return {
    metricId,
    version: def ? "1" : "0",
    certification: def ? "draft" : "draft",
    value,
    display,
    periodLabel,
  };
}

function buildMonthCharts(facts: NovaToolFact[], periodLabel: string): NovaPackChartDataset[] {
  const sales = facts.find((f) => f.tool === "sales_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;
  const receipts = facts.find((f) => f.tool === "receipts_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;
  const overdue = facts.find((f) => f.tool === "overdue_invoices" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;
  const recv = facts.find((f) => f.tool === "receivables_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;

  const salesVal = n(sales?.grandTotal ?? sales?.total ?? 0);
  const receiptsVal = n(receipts?.totalCollected ?? receipts?.total ?? 0);
  const overdueCount = n(overdue?.count ?? 0);
  const overdueAmt = n(overdue?.totalBalance ?? overdue?.balanceAmount ?? overdue?.total ?? 0);
  const openAr = n(recv?.outstandingTotal ?? recv?.total ?? 0);

  const charts: NovaPackChartDataset[] = [
    {
      bindingId: "kpi_strip",
      metricIds: ["sales.period_total", "receipts.period_collected", "ar.overdue_invoice_count"],
      title: `KPI — ${periodLabel}`,
      points: [
        { label: "Sales", value: salesVal, unit: "inr" },
        { label: "Collections", value: receiptsVal, unit: "inr" },
        { label: "Overdue invoices", value: overdueCount, unit: "count" },
      ],
    },
    {
      bindingId: "period_trend",
      metricIds: ["sales.period_total", "receipts.period_collected"],
      title: `Sales vs collections — ${periodLabel}`,
      points: [
        { label: "Sales", value: salesVal, unit: "inr" },
        { label: "Collections", value: receiptsVal, unit: "inr" },
      ],
    },
    {
      bindingId: "ageing_or_attention",
      metricIds: ["ar.overdue_invoice_count", "ar.receivables_open"],
      title: "Receivables attention",
      points: [
        { label: "Open AR", value: openAr, unit: "inr" },
        { label: "Overdue ₹", value: overdueAmt, unit: "inr" },
        { label: "Overdue count", value: overdueCount, unit: "count" },
      ],
    },
  ];
  return charts;
}

function isMaterialFinding(f: NovaFinding): boolean {
  const o = f.observation.toLowerCase();
  if (/no overdue|no open|no receipts|nothing material|unavailable|omitted/i.test(o)) {
    return false;
  }
  if (/\b0 overdue\b|\b0 invoice/.test(o)) return false;
  return (
    /overdue|attention|behind|slip|risk|open tasks|pipeline|unreconciled|negative|shortfall/i.test(
      o
    ) || f.confidence === "supported_inference"
  );
}

function buildMonthFindings(facts: NovaToolFact[], periodLabel: string): NovaFinding[] {
  const out: NovaFinding[] = [];
  const sales = facts.find((f) => f.tool === "sales_summary" && f.ok);
  const receipts = facts.find((f) => f.tool === "receipts_summary" && f.ok);
  const overdue = facts.find((f) => f.tool === "overdue_invoices" && f.ok);
  const projects = facts.find((f) => f.tool === "projects_summary" && f.ok);
  const cbg = facts.find((f) => f.tool === "cbg_quotations_summary" && f.ok);
  const bank = facts.find((f) => f.tool === "bank_accounts_summary" && f.ok);
  const director = facts.find((f) => f.tool === "director_dashboard_summary" && f.ok);

  if (sales?.data) {
    const d = sales.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Sales for ${periodLabel}: ${moneyDisplay(d.grandTotalInr ?? d.grandTotal)} (${n(d.invoiceCount ?? d.count)} invoice(s)).`,
        evidence: [{ toolId: "sales_summary", summary: `period=${periodLabel}` }],
        contributors: [{ toolId: "sales_summary", role: "sales" }],
        recommendation: { label: "Sales invoices", href: "/billing" },
        confidence: "fact",
      })
    );
  }

  if (receipts?.data) {
    const d = receipts.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Collections for ${periodLabel}: ${moneyDisplay(d.totalCollectedInr ?? d.totalCollected)} (${n(d.receiptCount ?? d.count)} receipt(s)).`,
        evidence: [{ toolId: "receipts_summary", summary: `period=${periodLabel}` }],
        contributors: [{ toolId: "receipts_summary", role: "collections" }],
        recommendation: { label: "Receipts", href: "/receipts" },
        confidence: "fact",
      })
    );
  }

  if (overdue?.data) {
    const d = overdue.data as Record<string, unknown>;
    const count = n(d.count);
    if (count > 0) {
      out.push(
        buildNovaFinding({
          observation: `${count} overdue invoice(s) totaling ${moneyDisplay(d.totalBalanceInr ?? d.totalBalance ?? d.balanceAmount)} — collection attention.`,
          evidence: [{ toolId: "overdue_invoices", summary: `count=${count}` }],
          contributors: [{ toolId: "overdue_invoices", role: "overdue" }],
          recommendation: { label: "Overdue / billing", href: "/billing" },
          confidence: "fact",
        })
      );
    }
  }

  if (projects?.data) {
    const d = projects.data as Record<string, unknown>;
    const active = n(d.activeCount ?? d.count);
    const openTasks = n(d.openTaskCount ?? d.taskOpen);
    if (openTasks > 0 || active > 0) {
      out.push(
        buildNovaFinding({
          observation:
            openTasks > 0
              ? `Projects: ${active} active with ${openTasks} open task(s) needing attention.`
              : `Projects: ${active} active in scope.`,
          evidence: [{ toolId: "projects_summary", summary: `active=${active}; openTasks=${openTasks}` }],
          contributors: [{ toolId: "projects_summary", role: "projects" }],
          recommendation: { label: "Projects", href: "/projects" },
          confidence: openTasks > 0 ? "supported_inference" : "fact",
        })
      );
    }
  }

  if (cbg?.data) {
    const d = cbg.data as Record<string, unknown>;
    const count = n(d.quotationCount ?? d.count);
    if (count > 0) {
      out.push(
        buildNovaFinding({
          observation: `CBG section: ${count} quotation(s) in period — see pipeline funnel.`,
          evidence: [{ toolId: "cbg_quotations_summary", summary: `quotationCount=${count}` }],
          contributors: [{ toolId: "cbg_quotations_summary", role: "CBG section" }],
          recommendation: { label: "CBG quotations", href: "/cbg-quotations" },
          confidence: "fact",
        })
      );
    }
  }

  if (bank?.data) {
    const d = bank.data as Record<string, unknown>;
    const acctCount = n(d.accountCount ?? d.count);
    if (acctCount > 0) {
      out.push(
        buildNovaFinding({
          observation: `Bank: ${acctCount} account(s) visible for today in/out when permitted.`,
          evidence: [{ toolId: "bank_accounts_summary", summary: `accounts=${acctCount}` }],
          contributors: [{ toolId: "bank_accounts_summary", role: "bank" }],
          recommendation: { label: "Bank accounts", href: "/finance/accounts" },
          confidence: "fact",
        })
      );
    }
  }

  if (director?.data) {
    const d = director.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Director dashboard FY snapshot available (${String(d.fy ?? d.periodLabel ?? "FY")}).`,
        evidence: [{ toolId: "director_dashboard_summary", summary: "director pack chapter" }],
        contributors: [{ toolId: "director_dashboard_summary", role: "director KPIs" }],
        recommendation: { label: "Director", href: "/director" },
        confidence: "fact",
      })
    );
  }

  return out;
}

function buildWarnings(
  facts: NovaToolFact[],
  omittedNotes: string[],
  opts: { dataAsOf: string; role?: string | null }
): NovaPackWarning[] {
  const warnings: NovaPackWarning[] = [];
  for (const note of omittedNotes) {
    if (/permission/i.test(note)) {
      warnings.push({
        code: "permission_omission",
        message: note,
        source: note.match(/Omitted (\S+)/)?.[1],
      });
    } else if (/failed|error/i.test(note)) {
      warnings.push({ code: "completeness", message: note });
    }
  }
  const okCount = facts.filter((f) => f.ok).length;
  if (facts.length > 0 && okCount < facts.length) {
    warnings.push({
      code: "completeness",
      message: `${facts.length - okCount} of ${facts.length} chapters incomplete.`,
    });
  }
  warnings.push(
    ...trustWarningsToPackWarnings(
      buildNovaTrustWarnings({
        dataAsOf: opts.dataAsOf,
        cacheAgeMs: maxCacheAgeMsFromFacts(facts),
        isLivePack: true,
        role: opts.role,
      })
    )
  );
  return warnings;
}

export async function runMonthPerformancePack(
  ctx: NovaSkillHandlerContext
): Promise<{ pack: NovaPackResult; recipeId: string }> {
  const errors = assertRecipeContract(MONTH_PERFORMANCE_RECIPE);
  if (errors.length) {
    throw new Error(`month_performance contract: ${errors.join("; ")}`);
  }

  const runnable = filterRecipeToolsForUser(ctx.user, MONTH_PERFORMANCE_RECIPE);
  const allTools = MONTH_PERFORMANCE_RECIPE.toolIds;
  const omittedNotes: string[] = [];
  for (const t of allTools) {
    if (!runnable.includes(t)) {
      omittedNotes.push(`Omitted ${t} (permission).`);
    }
  }

  const period = periodFromCtx(ctx);
  const dataAsOf = new Date().toISOString();

  const facts: NovaToolFact[] = [];
  const links: NovaToolLink[] = [];

  const results = await mapWithConcurrency(
    runnable,
    DAILY_BRIEF_FANOUT_CONCURRENCY,
    async (toolId) => {
      const { dispatchNovaSkill } = await import("@/lib/nova/skills/registry");
      return dispatchNovaSkill(toolId, ctx);
    }
  );

  for (let i = 0; i < runnable.length; i++) {
    const toolId = runnable[i];
    const res = results[i];
    if (!res) {
      omittedNotes.push(`Omitted ${toolId} (dispatch failed).`);
      continue;
    }
    facts.push(res.fact);
    if (res.links?.length) links.push(...res.links);
    const note = slimErrorNote(toolId, res.fact);
    if (note) omittedNotes.push(note);
  }

  const findings = buildMonthFindings(facts, period.label);
  const material = findings.filter(isMaterialFinding);
  const attentions = selectNovaPackAttentions(material, NOVA_MONTH_ATTENTION_PRIMARY_MAX);
  const charts = buildMonthCharts(facts, period.label);
  const warnings = buildWarnings(facts, omittedNotes, {
    dataAsOf,
    role: ctx.user.role,
  });

  const metrics: NovaPackMetricRef[] = [];
  const sales = facts.find((f) => f.tool === "sales_summary" && f.ok)?.data as Record<string, unknown> | undefined;
  const receipts = facts.find((f) => f.tool === "receipts_summary" && f.ok)?.data as Record<string, unknown> | undefined;
  const overdue = facts.find((f) => f.tool === "overdue_invoices" && f.ok)?.data as Record<string, unknown> | undefined;
  if (sales) {
    metrics.push(
      metricRef(
        "sales.period_total",
        n(sales.grandTotal),
        moneyDisplay(sales.grandTotalInr ?? sales.grandTotal),
        period.label
      )
    );
  }
  if (receipts) {
    metrics.push(
      metricRef(
        "receipts.period_collected",
        n(receipts.totalCollected),
        moneyDisplay(receipts.totalCollectedInr ?? receipts.totalCollected),
        period.label
      )
    );
  }
  if (overdue) {
    metrics.push(
      metricRef("ar.overdue_invoice_count", n(overdue.count), String(n(overdue.count)), period.label)
    );
  }

  const narrativeHints: string[] = [
    `Period: ${period.label} (${period.calendarKind.replace(/_/g, " ")}).`,
  ];
  if (attentions.primary.length === 0) {
    narrativeHints.push("No material attentions for this period.");
  } else {
    narrativeHints.push(
      `${attentions.primary.length} primary attention(s)` +
        (attentions.overflowCount > 0 ? ` (+${attentions.overflowCount} more).` : ".")
    );
  }
  for (const a of attentions.primary) {
    narrativeHints.push(`Attention: ${a.observation}`);
  }

  // Mark unused for lint — attention tools tracked for evals
  void MATERIAL_ATTENTION_TOOLS;

  const pack = buildNovaPackResult({
    packId: "month_performance",
    packVersion: MONTH_PERFORMANCE_PACK_VERSION,
    period,
    dataAsOf,
    metrics,
    facts,
    findings,
    attentions,
    charts,
    links,
    warnings,
    omittedNotes,
    narrativeHints,
  });

  return { pack, recipeId: "month_performance" };
}

export function formatMonthPerformanceAnswer(pack: NovaPackResult): string {
  const parts: string[] = [
    `**Month performance — ${pack.period.label}** (${pack.period.calendarKind.replace(/_/g, " ")})`,
  ];
  for (const hint of pack.narrativeHints.slice(0, 8)) {
    parts.push(hint);
  }
  const findingsText = formatNovaFindings(pack.findings);
  if (findingsText) parts.push(findingsText);
  if (pack.attentions.primary.length) {
    parts.push("**Attentions**");
    for (const a of pack.attentions.primary) {
      parts.push(`- ${a.observation}`);
    }
    if (pack.attentions.overflowCount > 0) {
      parts.push(`_…and ${pack.attentions.overflowCount} more._`);
    }
  } else {
    parts.push("_No material attentions._");
  }
  if (pack.omittedNotes.length) {
    parts.push("_Notes:_ " + pack.omittedNotes.join(" "));
  }
  parts.push("_Save as report_ from NOVA AI when you want an immutable snapshot.");
  return parts.join("\n\n");
}

export async function runMonthPerformanceRecipe(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { pack } = await runMonthPerformancePack(ctx);
  return {
    fact: {
      tool: "month_performance",
      ok: true,
      data: {
        packId: pack.packId,
        packVersion: pack.packVersion,
        schemaVersion: pack.schemaVersion,
        periodLabel: pack.period.label,
        calendarKind: pack.period.calendarKind,
        attentionCount: pack.attentions.primary.length,
        overflowCount: pack.attentions.overflowCount,
        chartBindings: pack.charts.map((c) => c.bindingId),
        warningCodes: pack.warnings.map((w) => w.code),
        narrative: formatMonthPerformanceAnswer(pack),
        pack,
      },
    },
    links: pack.links.slice(0, 12),
  };
}
