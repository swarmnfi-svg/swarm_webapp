/**
 * Collection Attention named pack — NOVA 3.0 Sprint 6.
 * Deepens the existing recipe; returns NovaPackResult with ≤3 attentions.
 */

import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import {
  runNovaRecipe,
  formatCollectionAttentionAnswer,
  type NovaRecipeRunResult,
} from "@/lib/nova/recipes/registry";
import {
  buildNovaPackResult,
  selectNovaPackAttentions,
  type NovaPackResult,
  type NovaPackWarning,
} from "@/lib/nova/pack-result";
import { NOVA_MONTH_ATTENTION_PRIMARY_MAX } from "@/lib/nova/invariants";
import type { NovaFinding } from "@/lib/nova/recipes/finding";
import {
  buildNovaTrustWarnings,
  maxCacheAgeMsFromFacts,
  trustWarningsToPackWarnings,
} from "@/lib/nova/freshness-trust";

export const COLLECTION_ATTENTION_PACK_VERSION = "1.0.0";

function isMaterial(f: NovaFinding): boolean {
  const o = f.observation.toLowerCase();
  if (/no open outstanding|no overdue|no receipts|no customers in master/i.test(o)) return false;
  // Customer master headcount alone is context, not a primary attention.
  if (/^customer master:/i.test(o) && !/overdue|outstanding/i.test(o)) return false;
  return /overdue|outstanding|collection attention|follow receivables/i.test(o);
}

export function collectionResultToPack(
  result: NovaRecipeRunResult,
  ctx: NovaSkillHandlerContext
): NovaPackResult {
  const material = result.findings.filter(isMaterial);
  const attentions = selectNovaPackAttentions(material, NOVA_MONTH_ATTENTION_PRIMARY_MAX);
  const warnings: NovaPackWarning[] = result.omittedNotes
    .filter((n) => /permission/i.test(n))
    .map((message) => ({
      code: "permission_omission" as const,
      message,
    }));
  if (result.facts.some((f) => !f.ok && !f.denied)) {
    warnings.push({
      code: "completeness",
      message: "One or more collection chapters failed to load.",
    });
  }
  const dataAsOf = new Date().toISOString();
  warnings.push(
    ...trustWarningsToPackWarnings(
      buildNovaTrustWarnings({
        dataAsOf,
        cacheAgeMs: maxCacheAgeMsFromFacts(result.facts),
        isLivePack: true,
        role: ctx.user.role,
      })
    )
  );

  return buildNovaPackResult({
    packId: "collection_attention",
    packVersion: COLLECTION_ATTENTION_PACK_VERSION,
    period: {
      label: ctx.range?.label ?? "open balances",
      grain: ctx.range ? "month" : "open",
      calendarKind: ctx.range ? "calendar_month" : "point_in_time",
      source: ctx.range ? "explicit" : "default",
    },
    dataAsOf,
    metrics: [
      {
        metricId: "customers.active_count",
        version: "1",
        certification: "draft",
      },
      {
        metricId: "customers.total_count",
        version: "1",
        certification: "draft",
      },
      {
        metricId: "ar.customer_outstanding",
        version: "1",
        certification: "draft",
      },
      {
        metricId: "ar.overdue_invoice_count",
        version: "1",
        certification: "draft",
      },
      {
        metricId: "receipts.period_collected",
        version: "1",
        certification: "draft",
      },
    ],
    facts: result.facts,
    findings: result.findings,
    attentions,
    charts: [
      {
        bindingId: "ageing_or_attention",
        metricIds: ["ar.overdue_invoice_count", "ar.customer_outstanding"],
        title: "Collection attention",
        points: attentions.primary.map((a, i) => ({
          label: `Attention ${i + 1}`,
          value: 1,
          unit: "count",
        })),
      },
    ],
    links: result.links,
    warnings,
    omittedNotes: result.omittedNotes,
    narrativeHints: [
      `Collection attention for ${ctx.entityFilterName ?? ctx.entityHint ?? "selected party"}.`,
      ...attentions.primary.map((a) => a.observation),
      ...(attentions.overflowCount > 0
        ? [`+${attentions.overflowCount} more attention(s).`]
        : attentions.primary.length === 0
          ? ["No material collection attentions."]
          : []),
    ],
  });
}

export async function runCollectionAttentionPackRecipe(
  ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const result = await runNovaRecipe("collection_attention", ctx);
  const pack = collectionResultToPack(result, ctx);
  const base = formatCollectionAttentionAnswer(result);
  const attentionBlock =
    pack.attentions.primary.length === 0
      ? "\n\n_No material attentions._"
      : `\n\n**Attentions (≤${NOVA_MONTH_ATTENTION_PRIMARY_MAX})**\n` +
        pack.attentions.primary.map((a) => `- ${a.observation}`).join("\n") +
        (pack.attentions.overflowCount
          ? `\n_…and ${pack.attentions.overflowCount} more._`
          : "");

  return {
    fact: {
      tool: "collection_attention",
      ok: true,
      data: {
        packId: pack.packId,
        packVersion: pack.packVersion,
        attentionCount: pack.attentions.primary.length,
        overflowCount: pack.attentions.overflowCount,
        narrative: base + attentionBlock,
        pack,
        findings: result.findings,
        omittedNotes: result.omittedNotes,
      },
    },
    links: result.links,
  };
}
