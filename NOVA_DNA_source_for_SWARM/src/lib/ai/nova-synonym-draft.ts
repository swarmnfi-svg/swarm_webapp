/**
 * Copy-ready lexicon synonym drafts from the unmatched synonym feed.
 * Does not mutate nova-lexicon — ops paste into a small PR after review.
 */
import type { NovaSynonymFeedRow } from "@/lib/ai/nova-catalog-suggest";

export type NovaSynonymDraftLine = {
  query: string;
  count: number;
  topicId: string | null;
  /** One-line paste into a topic's `synonyms: [...]` array. */
  synonymEntry: string | null;
  /** Optional PHRASE_EXPAND sketch when no topic match. */
  phraseExpandHint: string | null;
  /** Full comment block for weekly ritual paste. */
  block: string;
};

function escapeForTsString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Build paste-ready synonym / PHRASE_EXPAND drafts from feed rows. */
export function draftNovaLexiconSynonyms(
  rows: Pick<
    NovaSynonymFeedRow,
    "query" | "count" | "suggestedTopicId" | "suggestedTopicLabel" | "suggestedPhrase" | "lexiconHint"
  >[],
  opts?: { minCount?: number }
): NovaSynonymDraftLine[] {
  const minCount = Math.max(1, opts?.minCount ?? 1);
  return rows
    .filter((r) => r.count >= minCount && r.query.trim())
    .map((r) => {
      const q = r.query.trim();
      const topicId = r.suggestedTopicId;
      const synonymEntry = topicId ? `"${escapeForTsString(q.toLowerCase())}",` : null;
      const phraseExpandHint = topicId
        ? null
        : `// Consider PHRASE_EXPAND: [/${escapeRegexSketch(q)}/gi, "…canonical…"]`;
      const header = topicId
        ? `// ×${r.count} → topic "${topicId}"${r.suggestedTopicLabel ? ` (${r.suggestedTopicLabel})` : ""}${
            r.suggestedPhrase ? ` near “${r.suggestedPhrase}”` : ""
          }`
        : `// ×${r.count} → no close topic — new synonym or PHRASE_EXPAND`;
      const body = synonymEntry
        ? `// synonyms: [ … ${synonymEntry} … ]`
        : phraseExpandHint ?? `// ${r.lexiconHint ?? q}`;
      return {
        query: q,
        count: r.count,
        topicId,
        synonymEntry,
        phraseExpandHint,
        block: `${header}\n${body}`,
      };
    });
}

function escapeRegexSketch(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
}

/** Join draft blocks for the unmatched page / CLI paste box. */
export function formatNovaSynonymDraftPaste(drafts: NovaSynonymDraftLine[]): string {
  if (drafts.length === 0) {
    return "// No synonym draft candidates yet — wait for recurring unmatched phrases.";
  }
  return drafts.map((d) => d.block).join("\n\n");
}
