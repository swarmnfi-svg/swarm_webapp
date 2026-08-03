/**
 * Ops helper: list recent NOVA queries tagged for synonym/routing review.
 * Run: npx tsx src/lib/ai/nova-unmatched-review.ts
 *
 * Tags are appended in askNovaAiAction as toolsUsed including "unmatched_review".
 *
 * ## Weekly ritual (ops)
 * 1. Open `/system/nova-unmatched` (or run this CLI) and skim the synonym-feed
 *    table (recurring phrases + suggested lexicon topic).
 * 2. For recurring phrases, add synonyms or PHRASE_EXPAND entries in `nova-lexicon.ts`
 *    (and Hinglish in `nova-normalize.ts` when needed).
 * 3. Ship a small PR; re-check that the same ask now hits a primary tool.
 * 4. Optional staging: set `NOVA_LLM_PLANNER=true` to let the allowlisted planner suggest
 *    topics — still validate against the lexicon; never enable write actions.
 */
import { prisma } from "@/lib/prisma";
import { aggregateNovaSynonymFeed, type NovaSynonymFeedRow } from "@/lib/ai/nova-catalog-suggest";
import {
  draftNovaLexiconSynonyms,
  formatNovaSynonymDraftPaste,
} from "@/lib/ai/nova-synonym-draft";
import {
  formatNovaTriagePaste,
  suggestNovaTriageOutcome,
  type NovaTriageDraft,
} from "@/lib/ai/nova-triage";
import { draftNovaEntityAlias } from "@/lib/nova/semantic/aliases";

export const NOVA_REVIEW_MARKERS = [
  "unmatched_review",
  "search_entities",
  "llm_no_facts",
  "lexicon_stub",
  "friendly_no_facts",
] as const;

export type NovaQueryLogRateSummary = {
  sampleSize: number;
  rbacDeny: number;
  rbacSoftDeny: number;
  llmFallbackFacts: number;
  llmNotConfigured: number;
  unmatchedReview: number;
};

/** Pure helper: count deny / fallback markers over in-memory tool arrays. */
export function summarizeNovaQueryLogRates(
  rows: { toolsUsed: string[] }[]
): NovaQueryLogRateSummary {
  const summary: NovaQueryLogRateSummary = {
    sampleSize: rows.length,
    rbacDeny: 0,
    rbacSoftDeny: 0,
    llmFallbackFacts: 0,
    llmNotConfigured: 0,
    unmatchedReview: 0,
  };
  for (const row of rows) {
    const tools = row.toolsUsed ?? [];
    if (tools.includes("rbac_deny")) summary.rbacDeny += 1;
    if (tools.includes("rbac_soft_deny")) summary.rbacSoftDeny += 1;
    if (tools.includes("llm_fallback_facts")) summary.llmFallbackFacts += 1;
    if (tools.includes("llm_not_configured")) summary.llmNotConfigured += 1;
    if (tools.includes("unmatched_review")) summary.unmatchedReview += 1;
  }
  return summary;
}

export type NovaUnmatchedRow = {
  id: string;
  createdAt: Date;
  query: string;
  responseSummary: string | null;
  toolsUsed: string[];
  interpretedAs: string | null;
  primaryTool: string | null;
  periodLabel: string | null;
  userEmail: string | null;
  userName: string | null;
};

function toolsFromLog(toolsUsed: unknown): string[] {
  if (Array.isArray(toolsUsed)) return toolsUsed.map(String);
  if (typeof toolsUsed === "string") return [toolsUsed];
  return [];
}

export async function listNovaUnmatchedQueries(limit = 50): Promise<NovaUnmatchedRow[]> {
  const rows = await prisma.aiAssistantQueryLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(500, Math.max(limit * 4, 100)),
    include: { user: { select: { name: true, email: true } } },
  });

  const filtered = rows
    .filter((r) => {
      const tools = toolsFromLog(r.toolsUsed);
      return tools.some((t) => (NOVA_REVIEW_MARKERS as readonly string[]).includes(t));
    })
    .slice(0, limit);

  return filtered.map((r) => {
    const tools = toolsFromLog(r.toolsUsed);
    return {
      id: r.id,
      createdAt: r.createdAt,
      query: r.query,
      responseSummary: r.responseSummary,
      toolsUsed: tools,
      interpretedAs: (r as { interpretedAs?: string | null }).interpretedAs ?? null,
      primaryTool: (r as { primaryTool?: string | null }).primaryTool ?? null,
      periodLabel: (r as { periodLabel?: string | null }).periodLabel ?? null,
      userEmail: r.user?.email ?? null,
      userName: r.user?.name ?? null,
    };
  });
}

/** Recurring unmatched phrases + nearest catalog topic for lexicon feed. */
export async function loadNovaSynonymFeed(limit = 25): Promise<NovaSynonymFeedRow[]> {
  const rows = await listNovaUnmatchedQueries(Math.min(200, Math.max(limit * 4, 80)));
  return aggregateNovaSynonymFeed(
    rows.map((r) => ({
      query: r.query,
      createdAt: r.createdAt,
      toolsUsed: r.toolsUsed,
    })),
    limit
  );
}

/** Recent log window (not only unmatched) for deny/fallback rate cards. */
export async function loadNovaQueryLogRateSummary(take = 200): Promise<NovaQueryLogRateSummary> {
  const rows = await prisma.aiAssistantQueryLog.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(500, Math.max(take, 50)),
    select: { toolsUsed: true },
  });
  return summarizeNovaQueryLogRates(
    rows.map((r) => ({
      toolsUsed: toolsFromLog(r.toolsUsed),
    }))
  );
}

/** Recurring feed (≥2) → paste-ready lexicon synonym / PHRASE_EXPAND drafts. */
export async function loadNovaSynonymDraftPaste(limit = 25): Promise<string> {
  const feed = await loadNovaSynonymFeed(limit);
  return formatNovaSynonymDraftPaste(draftNovaLexiconSynonyms(feed, { minCount: 2 }));
}

/** Unmatched feed → triage drafts (alias | synonym | …). Never auto-promotes. */
export async function loadNovaTriageDrafts(limit = 25): Promise<NovaTriageDraft[]> {
  const feed = await loadNovaSynonymFeed(limit);
  return feed
    .filter((r) => r.count >= 2)
    .map((r) =>
      suggestNovaTriageOutcome({
        query: r.query,
        count: r.count,
        suggestedTopicId: r.suggestedTopicId,
        looksLikeEntityName: /^[A-Za-z][A-Za-z0-9 .&'-]{1,40}$/.test(r.query.trim()),
      })
    );
}

export async function loadNovaTriageDraftPaste(limit = 25): Promise<string> {
  return formatNovaTriagePaste(await loadNovaTriageDrafts(limit));
}

/**
 * Create an alias DRAFT from triage — does not bind resolver until ops confirm.
 * Returns null when outcome is not alias.
 */
export async function createAliasDraftFromTriage(
  draft: NovaTriageDraft,
  opts: {
    targetId: string;
    entityType: "customer" | "vendor" | "project" | "employee";
    createdBy: string;
    targetCode?: string | null;
    targetName?: string | null;
  }
) {
  if (draft.suggestedOutcome !== "alias") return null;
  return draftNovaEntityAlias({
    alias: draft.aliasDraft?.alias ?? draft.query,
    entityType: opts.entityType,
    targetId: opts.targetId,
    targetCode: opts.targetCode,
    targetName: opts.targetName,
    createdBy: opts.createdBy,
    note: draft.note,
    source: "UNMATCHED_DRAFT",
  });
}

async function main() {
  const feed = await loadNovaSynonymFeed(30);
  console.log(`NOVA synonym feed (grouped): ${feed.length}\n`);
  for (const r of feed) {
    console.log("—".repeat(60));
    console.log(`×${r.count}`, r.lastAt.toISOString(), r.query);
    console.log("markers:", r.markers.join(", ") || "—");
    console.log("hint:", r.lexiconHint);
  }
  console.log("\n" + "=".repeat(60));
  console.log("Paste-ready lexicon drafts (count ≥ 2):\n");
  console.log(await loadNovaSynonymDraftPaste(30));
  const filtered = await listNovaUnmatchedQueries(20);
  console.log(`\nRecent unmatched rows: ${filtered.length}\n`);
  for (const r of filtered) {
    console.log("—".repeat(40));
    console.log(r.createdAt.toISOString(), r.userEmail ?? r.userName);
    console.log("Q:", r.query);
    console.log("tools:", r.toolsUsed.join(", "));
  }
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].includes("nova-unmatched-review");

if (isCli) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
