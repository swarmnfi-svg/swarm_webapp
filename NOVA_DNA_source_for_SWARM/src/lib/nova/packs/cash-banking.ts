/**
 * Cash / Banking named pack — savable finance cash position (≤3 attentions).
 * Catalog skills only; never invent balances or ₹0 theatre when hidden.
 */

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
  type NovaPackMetricRef,
  type NovaPackResult,
  type NovaPackWarning,
} from "@/lib/nova/pack-result";
import { NOVA_MONTH_ATTENTION_PRIMARY_MAX } from "@/lib/nova/invariants";
import {
  CASH_BANKING_CHAPTER_TOOLS,
  CASH_BANKING_METRIC_IDS,
  CASH_BANKING_PACK_ID,
} from "@/lib/nova/packs/cash-banking-prep";
import {
  buildNovaTrustWarnings,
  maxCacheAgeMsFromFacts,
  trustWarningsToPackWarnings,
} from "@/lib/nova/freshness-trust";

export const CASH_BANKING_PACK_VERSION = "1.0.0";

export const CASH_BANKING_RECIPE: NovaRecipe = {
  id: CASH_BANKING_PACK_ID,
  label: "Cash / Banking",
  description:
    "Bank position + receipts + recon + payment requests — facts only; respects balance visibility RBAC.",
  toolIds: [...CASH_BANKING_CHAPTER_TOOLS],
  readOnly: true,
  maximumSteps: 4,
  examples: [
    "how is cash this week?",
    "cash and banking this month",
    "bank balances",
    "cash position",
  ],
};

function n(v: unknown): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function slimErrorNote(toolId: string, fact: NovaToolFact): string | null {
  if (fact.denied) return `Omitted ${toolId} (permission).`;
  if (!fact.ok) return `Omitted ${toolId} (${fact.error ?? "failed"}).`;
  return null;
}

function isMaterial(f: NovaFinding): boolean {
  const o = f.observation.toLowerCase();
  if (/no material cash|needs bank\.read|balances hidden/i.test(o)) {
    return /needs bank\.read/.test(o);
  }
  return /unreconciled|recon attention|payment requests awaiting|awaiting action/i.test(o);
}

function draftMetrics(
  periodLabel: string,
  values: Record<string, number | string | null>
): NovaPackMetricRef[] {
  return CASH_BANKING_METRIC_IDS.map((metricId) => ({
    metricId,
    version: "1",
    certification: "draft" as const,
    value: values[metricId] ?? null,
    display:
      values[metricId] == null
        ? undefined
        : typeof values[metricId] === "string"
          ? values[metricId]!
          : String(values[metricId]),
    periodLabel,
  }));
}

function buildFindings(facts: NovaToolFact[], periodLabel: string): NovaFinding[] {
  const out: NovaFinding[] = [];
  const bank = facts.find((f) => f.tool === "bank_accounts_summary");
  const recon = facts.find((f) => f.tool === "bank_recon_summary" && f.ok);
  const receipts = facts.find((f) => f.tool === "receipts_summary" && f.ok);
  const pr = facts.find((f) => f.tool === "payment_requests_summary" && f.ok);

  if (!bank || bank.denied || !bank.ok) {
    out.push(
      buildNovaFinding({
        observation:
          "Cash / banking needs bank.read — I will not invent balances or recon counts.",
        evidence: [{ toolId: "bank_accounts_summary", summary: "missing or denied" }],
        contributors: [{ toolId: "bank_accounts_summary", role: "gap" }],
        recommendation: { label: "Bank accounts", href: "/bank-accounts" },
        confidence: "fact",
      })
    );
    return out;
  }

  const d = (bank.data ?? {}) as Record<string, unknown>;
  const accountCount = n(d.accountCount);
  const visible = Boolean(d.balancesVisible);

  if (visible) {
    out.push(
      buildNovaFinding({
        observation: `${accountCount} active bank account(s). Book ${String(d.totalBookBalanceInr ?? "—")}; operational ${String(d.totalOperationalBalanceInr ?? "—")}.`,
        evidence: [{ toolId: "bank_accounts_summary", summary: `accounts=${accountCount}` }],
        contributors: [{ toolId: "bank_accounts_summary", role: "bank position" }],
        recommendation: { label: "Bank accounts", href: "/bank-accounts" },
        confidence: "fact",
      })
    );
  } else {
    out.push(
      buildNovaFinding({
        observation: `${accountCount} active bank account(s); balances hidden (need bank.viewfullaccount / org finance).`,
        evidence: [{ toolId: "bank_accounts_summary", summary: "balancesVisible=false" }],
        contributors: [{ toolId: "bank_accounts_summary", role: "visibility" }],
        recommendation: { label: "Bank accounts", href: "/bank-accounts" },
        confidence: "fact",
      })
    );
  }

  if (receipts?.data) {
    const rd = receipts.data as Record<string, unknown>;
    out.push(
      buildNovaFinding({
        observation: `Receipts ${periodLabel}: ${String(rd.totalCollectedInr ?? rd.totalCollected ?? "—")}.`,
        evidence: [{ toolId: "receipts_summary", summary: "receipts chapter" }],
        contributors: [{ toolId: "receipts_summary", role: "receipts" }],
        recommendation: { label: "Receipts", href: "/receipts" },
        confidence: "fact",
      })
    );
  }

  if (recon?.data) {
    const rd = recon.data as Record<string, unknown>;
    const unrec = n(rd.unreconciledTotal ?? rd.unreconciledCount ?? rd.total);
    if (unrec > 0) {
      out.push(
        buildNovaFinding({
          observation: `Unreconciled / recon attention: ${unrec}.`,
          evidence: [{ toolId: "bank_recon_summary", summary: `unreconciled=${unrec}` }],
          contributors: [{ toolId: "bank_recon_summary", role: "recon" }],
          recommendation: { label: "Bank recon", href: "/reconciliation" },
          confidence: "fact",
        })
      );
    }
  }

  if (pr?.data) {
    const pd = pr.data as Record<string, unknown>;
    const awaiting = n(pd.awaitingActionCount ?? pd.pendingCount);
    if (awaiting > 0) {
      out.push(
        buildNovaFinding({
          observation: `Payment requests awaiting action: ${awaiting}.`,
          evidence: [{ toolId: "payment_requests_summary", summary: `awaiting=${awaiting}` }],
          contributors: [{ toolId: "payment_requests_summary", role: "payment requests" }],
          recommendation: { label: "Payment requests", href: "/payment-requests" },
          confidence: "fact",
        })
      );
    }
  }

  return out;
}

export async function runCashBankingPack(
  ctx: NovaSkillHandlerContext
): Promise<{ pack: NovaPackResult }> {
  const errors = assertRecipeContract(CASH_BANKING_RECIPE);
  if (errors.length) throw new Error(errors.join("; "));

  const periodLabel = ctx.range?.label ?? "this period";
  const runnable = filterRecipeToolsForUser(ctx.user, CASH_BANKING_RECIPE);
  const omittedNotes: string[] = [];
  for (const t of CASH_BANKING_RECIPE.toolIds) {
    if (!runnable.includes(t)) omittedNotes.push(`Omitted ${t} (permission).`);
  }

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
    const res = results[i];
    if (!res) {
      omittedNotes.push(`Omitted ${runnable[i]} (dispatch failed).`);
      continue;
    }
    facts.push(res.fact);
    if (res.links) links.push(...res.links);
    const note = slimErrorNote(runnable[i], res.fact);
    if (note) omittedNotes.push(note);
  }

  const findings = buildFindings(facts, periodLabel);
  const attentions = selectNovaPackAttentions(
    findings.filter(isMaterial),
    NOVA_MONTH_ATTENTION_PRIMARY_MAX
  );
  const warnings: NovaPackWarning[] = omittedNotes
    .filter((n) => /permission/i.test(n))
    .map((message) => ({ code: "permission_omission" as const, message }));
  const dataAsOf = new Date().toISOString();
  warnings.push(
    ...trustWarningsToPackWarnings(
      buildNovaTrustWarnings({
        dataAsOf,
        cacheAgeMs: maxCacheAgeMsFromFacts(facts),
        isLivePack: true,
        role: ctx.user.role,
      })
    )
  );

  const bank = facts.find((f) => f.tool === "bank_accounts_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;
  const visible = Boolean(bank?.balancesVisible);
  const receipts = facts.find((f) => f.tool === "receipts_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;
  const recon = facts.find((f) => f.tool === "bank_recon_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;
  const pr = facts.find((f) => f.tool === "payment_requests_summary" && f.ok)?.data as
    | Record<string, unknown>
    | undefined;

  const metrics = draftMetrics(periodLabel, {
    "bank.accounts_count": bank ? n(bank.accountCount) : null,
    "bank.book_balance": visible ? n(bank?.totalBookBalance) : null,
    "bank.statement_balance": visible ? n(bank?.totalStatementBalance) : null,
    "bank.operational_balance": visible ? n(bank?.totalOperationalBalance) : null,
    "receipts.period_collected": receipts
      ? n(receipts.totalCollected ?? receipts.grandTotal)
      : null,
    "bank_recon.summary": recon ? n(recon.unreconciledTotal) : null,
    "pr.awaiting_action": pr ? n(pr.awaitingActionCount) : null,
    "cash.period_position": visible
      ? String(bank?.totalOperationalBalanceInr ?? bank?.totalBookBalanceInr ?? null)
      : "hidden",
  });

  const pack = buildNovaPackResult({
    packId: CASH_BANKING_PACK_ID,
    packVersion: CASH_BANKING_PACK_VERSION,
    period: {
      label: periodLabel,
      grain: ctx.range ? "month" : "latest",
      calendarKind: ctx.range ? "calendar_month" : "point_in_time",
      source: ctx.range ? "explicit" : "default",
    },
    dataAsOf,
    metrics,
    facts,
    findings,
    attentions,
    charts: [
      {
        bindingId: "kpi_strip",
        metricIds: [
          "bank.book_balance",
          "bank.operational_balance",
          "receipts.period_collected",
        ],
        title: `Cash position — ${periodLabel}`,
        points: visible
          ? [
              { label: "Book", value: n(bank?.totalBookBalance), unit: "inr" },
              { label: "Operational", value: n(bank?.totalOperationalBalance), unit: "inr" },
              {
                label: "Receipts",
                value: n(receipts?.totalCollected ?? receipts?.grandTotal),
                unit: "inr",
              },
            ]
          : [{ label: "Accounts", value: n(bank?.accountCount), unit: "count" }],
      },
      {
        bindingId: "ageing_or_attention",
        metricIds: ["bank_recon.summary", "pr.awaiting_action"],
        title: "Cash attention",
        points: attentions.primary.map((a, i) => ({
          label: `Attention ${i + 1}`,
          value: 1,
          unit: "count",
        })),
      },
    ],
    links,
    warnings,
    omittedNotes,
    narrativeHints: [
      `Cash / Banking for ${periodLabel}.`,
      ...attentions.primary.map((a) => a.observation),
      ...(attentions.primary.length === 0
        ? ["No material cash / banking attentions for this period."]
        : []),
    ],
  });
  return { pack };
}

export function formatCashBankingAnswer(pack: NovaPackResult): string {
  const parts = ["**Cash / Banking**", ...pack.narrativeHints];
  const f = formatNovaFindings(pack.findings);
  if (f) parts.push(f);
  if (pack.attentions.overflowCount > 0) {
    parts.push(`_…and ${pack.attentions.overflowCount} more attentions._`);
  }
  if (pack.omittedNotes.length) parts.push("_Notes:_ " + pack.omittedNotes.join(" "));
  return parts.join("\n\n");
}

export async function runCashBankingRecipe(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { pack } = await runCashBankingPack(ctx);
  return {
    fact: {
      tool: CASH_BANKING_PACK_ID,
      ok: true,
      data: {
        packId: pack.packId,
        packVersion: pack.packVersion,
        attentionCount: pack.attentions.primary.length,
        overflowCount: pack.attentions.overflowCount,
        narrative: formatCashBankingAnswer(pack),
        pack,
      },
    },
    links: pack.links.slice(0, 12),
  };
}
