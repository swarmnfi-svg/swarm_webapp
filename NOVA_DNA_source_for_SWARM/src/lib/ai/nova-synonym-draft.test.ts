import { describe, expect, it } from "vitest";
import {
  draftNovaLexiconSynonyms,
  formatNovaSynonymDraftPaste,
} from "@/lib/ai/nova-synonym-draft";

describe("draftNovaLexiconSynonyms", () => {
  it("emits paste-ready synonym entries for topic hits", () => {
    const drafts = draftNovaLexiconSynonyms([
      {
        query: "Morning collections",
        count: 4,
        suggestedTopicId: "receipts",
        suggestedTopicLabel: "receipts",
        suggestedPhrase: "collections",
        lexiconHint: 'Add synonym under topic "receipts"',
      },
    ]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.synonymEntry).toBe('"morning collections",');
    expect(drafts[0]!.block).toContain('topic "receipts"');
    expect(drafts[0]!.phraseExpandHint).toBeNull();
  });

  it("skips below minCount and sketches PHRASE_EXPAND when no topic", () => {
    const drafts = draftNovaLexiconSynonyms(
      [
        {
          query: "once",
          count: 1,
          suggestedTopicId: null,
          suggestedTopicLabel: null,
          suggestedPhrase: null,
          lexiconHint: "No close catalog hit",
        },
        {
          query: "weird phrase xyz",
          count: 3,
          suggestedTopicId: null,
          suggestedTopicLabel: null,
          suggestedPhrase: null,
          lexiconHint: "No close catalog hit",
        },
      ],
      { minCount: 2 }
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.synonymEntry).toBeNull();
    expect(drafts[0]!.phraseExpandHint).toMatch(/PHRASE_EXPAND/);
  });
});

describe("formatNovaSynonymDraftPaste", () => {
  it("joins blocks", () => {
    const paste = formatNovaSynonymDraftPaste(
      draftNovaLexiconSynonyms([
        {
          query: "po pending",
          count: 2,
          suggestedTopicId: "purchase_orders",
          suggestedTopicLabel: "purchase orders",
          suggestedPhrase: "open po",
          lexiconHint: null,
        },
      ])
    );
    expect(paste).toContain('"po pending",');
  });
});
