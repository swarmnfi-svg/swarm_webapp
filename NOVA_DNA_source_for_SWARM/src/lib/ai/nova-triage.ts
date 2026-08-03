/**
 * Unmatched triage outcomes — ops learning loop (Gate D).
 * Suggestions / drafts ≠ auto-promote.
 */
export const NOVA_TRIAGE_OUTCOMES = [
  "alias",
  "synonym",
  "intent_example",
  "recipe",
  "skill_gap",
  "eval",
  "remain_denied",
] as const;

export type NovaTriageOutcome = (typeof NOVA_TRIAGE_OUTCOMES)[number];

export type NovaTriageDraft = {
  query: string;
  count: number;
  /** Suggested outcome — never auto-applied */
  suggestedOutcome: NovaTriageOutcome;
  /** Alias draft sketch when outcome=alias (confirm required) */
  aliasDraft?: {
    alias: string;
    entityTypeHint: "customer" | "vendor" | "project" | "employee" | null;
    note: string;
  };
  /** Synonym draft topic when outcome=synonym */
  synonymTopicId?: string | null;
  /** Human-readable ops note */
  note: string;
};

export function suggestNovaTriageOutcome(input: {
  query: string;
  count: number;
  suggestedTopicId?: string | null;
  looksLikeEntityName?: boolean;
}): NovaTriageDraft {
  const q = input.query.trim();
  const lower = q.toLowerCase();

  if (/\b(create|approve|pay|delete|post)\b/i.test(lower)) {
    return {
      query: q,
      count: input.count,
      suggestedOutcome: "remain_denied",
      note: "Looks like a write ask — keep read-only refuse; do not add synonym.",
    };
  }

  if (input.looksLikeEntityName || /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}$/.test(q)) {
    return {
      query: q,
      count: input.count,
      suggestedOutcome: "alias",
      aliasDraft: {
        alias: lower,
        entityTypeHint: null,
        note: "Draft alias only — ops must confirm target id before live resolve.",
      },
      note: "Likely party/project shorthand → alias draft (confirm required).",
    };
  }

  if (input.suggestedTopicId) {
    return {
      query: q,
      count: input.count,
      suggestedOutcome: "synonym",
      synonymTopicId: input.suggestedTopicId,
      note: `Near topic ${input.suggestedTopicId} — paste synonym after review.`,
    };
  }

  if (/\b(pipeline|health|risk|brief|attention)\b/i.test(lower)) {
    return {
      query: q,
      count: input.count,
      suggestedOutcome: "recipe",
      note: "May need a bounded recipe — only if facts exist; never invent.",
    };
  }

  if (input.count >= 5) {
    return {
      query: q,
      count: input.count,
      suggestedOutcome: "skill_gap",
      note: "Recurring miss with no topic — consider skill gap or new lexicon topic.",
    };
  }

  return {
    query: q,
    count: input.count,
    suggestedOutcome: "eval",
    note: "Add a Phase 0 / golden case once intended behaviour is clear.",
  };
}

export function formatNovaTriagePaste(drafts: NovaTriageDraft[]): string {
  if (drafts.length === 0) {
    return "// No triage drafts yet.";
  }
  return drafts
    .map((d) => {
      const lines = [
        `// ×${d.count} “${d.query}” → ${d.suggestedOutcome}`,
        `// ${d.note}`,
      ];
      if (d.aliasDraft) {
        lines.push(
          `// alias draft: "${d.aliasDraft.alias}" (${d.aliasDraft.entityTypeHint ?? "type?"}) — CONFIRM before live`
        );
      }
      if (d.synonymTopicId) {
        lines.push(`// synonym → topic "${d.synonymTopicId}": "${d.query.toLowerCase()}",`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
