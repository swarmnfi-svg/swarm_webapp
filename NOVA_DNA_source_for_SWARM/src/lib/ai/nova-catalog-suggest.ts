/**
 * Near-miss catalog phrases for unmatched NOVA queries.
 * Used in user answers ("Did you mean…") and `/system/nova-unmatched` synonym feed.
 * No Think invents — fuzzy lexicon + curated typo aliases only.
 */
import type { SessionUser } from "@/auth";
import { NOVA_LEXICON, type NovaLexiconTopic } from "@/lib/ai/nova-lexicon";
import { novaCanRunTool } from "@/lib/ai/nova-suggest";
import { shouldSuppressCatalogNearMiss } from "@/lib/nova/nlp-document-jargon";

export type NovaCatalogPhraseHit = {
  phrase: string;
  topicId: string;
  topicLabel: string;
  score: number;
  tools: string[];
  href?: string;
};

/**
 * High-traffic unmatched typos / Hinglish soft forms → canonical catalog phrase.
 * Expand from `/system/nova-unmatched` synonym feed (ops paste), not invent tools.
 */
export const NOVA_CATALOG_NEAR_MISS_ALIASES: ReadonlyArray<{
  pattern: RegExp;
  phrase: string;
  topicId: string;
}> = [
  { pattern: /\bleave\s+balan[sc]e?\b/i, phrase: "leave balance", topicId: "leave" },
  { pattern: /\bbalan[sc]e?\s+(leave|my\s+leave)\b/i, phrase: "my leave balance", topicId: "leave" },
  { pattern: /\brecie?ipts?\b/i, phrase: "receipts", topicId: "receipts" },
  { pattern: /\btoday\s+recie?ipts?\b/i, phrase: "today receipts", topicId: "receipts" },
  { pattern: /\baprov+[ae]?ls?\b|\bapprovls?\b/i, phrase: "pending approvals", topicId: "approvals" },
  { pattern: /\bappro?val\s+queu?e\b/i, phrase: "approval queue", topicId: "approvals" },
  { pattern: /\batt?end[ae]nce\b|\battenden[sc]e\b/i, phrase: "attendance", topicId: "attendance" },
  { pattern: /\blate\s*comm?ers?\b|\blatecomers?\b/i, phrase: "late comers", topicId: "attendance" },
  { pattern: /\boutstand+ing\b|\boutstandng\b/i, phrase: "outstanding", topicId: "receivables" },
  { pattern: /\bpurch[ae]?se\s+ord+ers?\b|\bopn\s+po\b/i, phrase: "open purchase orders", topicId: "purchase_orders" },
  { pattern: /\bsalery\b|\bpayslip\s+this\s+month\b/i, phrase: "salary this month", topicId: "salary" },
  { pattern: /\binventry\b|\blow\s+inventry\b/i, phrase: "low stock", topicId: "stock" },
  { pattern: /\boverdeu\s+tasks?\b|\boverdue\s+todos?\b/i, phrase: "overdue tasks", topicId: "tasks" },
  { pattern: /\bkarcha\b|\bkharcha\s+aaj\b/i, phrase: "expenses today", topicId: "staff_expenses" },
  { pattern: /\bhows?\s+biz\b|\bhow\s+is\s+biz\b/i, phrase: "how is business", topicId: "month_performance" },
  { pattern: /\brecien?vables?\b|\breceivabls?\b/i, phrase: "receivables", topicId: "receivables" },
];

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Dice coefficient on character bigrams — cheap fuzzy for short typos. */
function diceBigrams(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2);
      m.set(bg, (m.get(bg) ?? 0) + 1);
    }
    return m;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [k, v] of A) {
    const w = B.get(k) ?? 0;
    overlap += Math.min(v, w);
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

function scorePhrase(query: string, phrase: string): number {
  const q = query.trim().toLowerCase();
  const p = phrase.trim().toLowerCase();
  if (!q || !p) return 0;
  if (q === p) return 1;
  if (p.includes(q) || q.includes(p)) return 0.92;

  const qt = tokenize(q);
  const pt = tokenize(p);
  if (qt.length === 0 || pt.length === 0) return diceBigrams(q, p) * 0.7;

  const qSet = new Set(qt);
  const pSet = new Set(pt);
  let inter = 0;
  for (const t of qSet) if (pSet.has(t)) inter += 1;
  const jaccard = inter / (qSet.size + pSet.size - inter);

  // Per-token fuzzy: mean of best matches (catches multi-word typos better than max-only)
  let fuzzySum = 0;
  let fuzzyMax = 0;
  for (const a of qt) {
    let best = 0;
    for (const b of pt) best = Math.max(best, diceBigrams(a, b));
    fuzzySum += best;
    fuzzyMax = Math.max(fuzzyMax, best);
  }
  const fuzzyMean = fuzzySum / qt.length;

  // Prefer phrases that cover most query tokens at ≥0.7 dice
  let covered = 0;
  for (const a of qt) {
    let best = 0;
    for (const b of pt) best = Math.max(best, diceBigrams(a, b));
    if (best >= 0.7) covered += 1;
  }
  const coverage = covered / qt.length;

  return Math.max(
    jaccard,
    fuzzyMax * 0.85,
    fuzzyMean * 0.9,
    coverage * 0.88,
    diceBigrams(q, p) * 0.6
  );
}

function catalogPhrases(topic: NovaLexiconTopic): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [topic.label, ...topic.synonyms]) {
    const t = s.trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    // Prefer multi-word / specific prompts over ultra-short tokens for suggestions
    if (t.length < 3 && !t.includes(" ")) continue;
    seen.add(t);
    out.push(s.trim());
  }
  return out;
}

function lookupAliasHits(query: string): NovaCatalogPhraseHit[] {
  const q = query.trim();
  if (!q) return [];
  const hits: NovaCatalogPhraseHit[] = [];
  for (const alias of NOVA_CATALOG_NEAR_MISS_ALIASES) {
    if (!alias.pattern.test(q)) continue;
    const topic = NOVA_LEXICON.find((t) => t.id === alias.topicId);
    if (!topic || topic.tools.length === 0) continue;
    hits.push({
      phrase: alias.phrase,
      topicId: topic.id,
      topicLabel: topic.label,
      score: 0.97,
      tools: topic.tools,
      href: topic.href,
    });
  }
  return hits;
}

/**
 * Rank lexicon phrases near the query. Prefer tooled topics for user-facing hints.
 */
export function suggestNovaCatalogPhrases(
  query: string,
  opts?: { limit?: number; tooledOnly?: boolean; minScore?: number }
): NovaCatalogPhraseHit[] {
  const limit = opts?.limit ?? 4;
  const minScore = opts?.minScore ?? 0.32;
  const tooledOnly = opts?.tooledOnly ?? true;
  const q = query.trim();
  if (!q) return [];

  const hits: NovaCatalogPhraseHit[] = [...lookupAliasHits(q)];
  for (const topic of NOVA_LEXICON) {
    if (tooledOnly && topic.tools.length === 0) continue;
    for (const phrase of catalogPhrases(topic)) {
      const score = scorePhrase(q, phrase);
      if (score < minScore) continue;
      hits.push({
        phrase,
        topicId: topic.id,
        topicLabel: topic.label,
        score,
        tools: topic.tools,
        href: topic.href,
      });
    }
  }

  hits.sort(
    (a, b) =>
      b.score - a.score ||
      // Prefer multi-word actionable phrases when scores are close
      b.phrase.split(/\s+/).length - a.phrase.split(/\s+/).length ||
      a.phrase.length - b.phrase.length
  );
  const out: NovaCatalogPhraseHit[] = [];
  const seenPhrase = new Set<string>();
  const seenTopic = new Set<string>();
  for (const h of hits) {
    const key = h.phrase.toLowerCase();
    if (seenPhrase.has(key)) continue;
    // Cap one strong phrase per topic so suggestions stay diverse
    if (seenTopic.has(h.topicId) && h.score < 0.9) continue;
    seenPhrase.add(key);
    seenTopic.add(h.topicId);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/** Permission-filter catalog hits so we never suggest phrases the user cannot run. */
export function suggestNovaCatalogPhrasesForUser(
  user: SessionUser,
  query: string,
  limit = 4
): NovaCatalogPhraseHit[] {
  const q = query.trim();
  // Named party / drawing asks must not get attendance/IRN catalog walls
  if (shouldSuppressCatalogNearMiss(q)) {
    return [];
  }
  // Person / who-is unmatched — bias to staff/customer/vendor lookup, not “who owes”
  const whoIs =
    /^(?:who\s+(?:is|are)|who's)\s+/i.test(q) ||
    (/^[A-Za-z][A-Za-z'.-]{1,40}$/.test(q) && !/\b(sales|receipts?|outstanding|late)\b/i.test(q));
  const preferTopicIds = whoIs
    ? new Set(["staff", "customers", "vendors", "projects", "tasks"])
    : null;

  const ranked = suggestNovaCatalogPhrases(query, {
    limit: limit * 4,
    tooledOnly: true,
    minScore: whoIs ? 0.2 : 0.32,
  }).filter((h) => h.tools.some((t) => novaCanRunTool(user, t)));

  if (!preferTopicIds) return ranked.slice(0, limit);

  const preferred = ranked.filter((h) => preferTopicIds.has(h.topicId));
  const rest = ranked.filter((h) => !preferTopicIds.has(h.topicId));
  // Seed sensible identity phrases when fuzzy catalog is weak
  const seeds: NovaCatalogPhraseHit[] = [
    {
      phrase: "staff list",
      topicId: "staff",
      topicLabel: "staff",
      score: 0.5,
      tools: ["staff_summary"],
      href: "/staff",
    },
    {
      phrase: "find customer",
      topicId: "customers",
      topicLabel: "customers",
      score: 0.45,
      tools: ["customers_summary"],
      href: "/customers",
    },
    {
      phrase: "find project",
      topicId: "projects",
      topicLabel: "projects",
      score: 0.4,
      tools: ["projects_summary"],
      href: "/projects",
    },
  ].filter((h) => h.tools.some((t) => novaCanRunTool(user, t)));

  const merged = [...preferred, ...seeds, ...rest];
  const out: NovaCatalogPhraseHit[] = [];
  const seen = new Set<string>();
  for (const h of merged) {
    const key = h.phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
    if (out.length >= limit) break;
  }
  return out;
}

/** Legacy one-liner (search empty path). Prefer formatNovaCatalogDidYouMean for unmatched. */
export function formatNovaCatalogTryLine(hits: NovaCatalogPhraseHit[]): string | null {
  if (hits.length === 0) return null;
  const listed = hits.map((h) => `“${h.phrase}”`).join(", ");
  return `Closer catalog phrases: try ${listed}.`;
}

/**
 * Numbered “Did you mean” prose — same shape as clarify cards so chips parse.
 */
export function formatNovaCatalogDidYouMean(
  query: string,
  hits: NovaCatalogPhraseHit[]
): string | null {
  if (hits.length === 0) return null;
  const hint = query.trim().slice(0, 48);
  const lines = [
    hint ? `Did you mean one of these for “${hint}”?` : "Did you mean one of these?",
    "",
    ...hits.map((h, i) => `${i + 1}. **${h.phrase}**`),
    "",
    "Reply with the number or the phrase — or try **help**.",
  ];
  return lines.join("\n");
}

/** Chip-shaped options for UI / ClarifyAct (metric type → resume runs the phrase). */
export function catalogHitsToClarifyOptions(
  hits: NovaCatalogPhraseHit[]
): {
  id: string;
  label: string;
  type: "metric";
  code: null;
}[] {
  return hits.slice(0, 6).map((h) => ({
    id: h.topicId,
    label: h.phrase,
    type: "metric" as const,
    code: null,
  }));
}

export type NovaSynonymFeedRow = {
  query: string;
  count: number;
  lastAt: Date;
  markers: string[];
  suggestedTopicId: string | null;
  suggestedTopicLabel: string | null;
  suggestedPhrase: string | null;
  /** Copy-ready hint for nova-lexicon synonyms */
  lexiconHint: string | null;
};

/** Group unmatched log rows for the ops synonym-feed ritual. */
export function aggregateNovaSynonymFeed(
  rows: { query: string; createdAt: Date; toolsUsed: string[] }[],
  limit = 25
): NovaSynonymFeedRow[] {
  const map = new Map<
    string,
    { query: string; count: number; lastAt: Date; markers: Set<string> }
  >();

  for (const r of rows) {
    const key = r.query.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    const cur = map.get(key);
    const markers = (r.toolsUsed ?? []).filter((t) =>
      ["unmatched_review", "search_entities", "llm_no_facts", "lexicon_stub", "friendly_no_facts"].includes(
        t
      )
    );
    if (!cur) {
      map.set(key, {
        query: r.query.trim(),
        count: 1,
        lastAt: r.createdAt,
        markers: new Set(markers),
      });
    } else {
      cur.count += 1;
      if (r.createdAt > cur.lastAt) {
        cur.lastAt = r.createdAt;
        cur.query = r.query.trim();
      }
      for (const m of markers) cur.markers.add(m);
    }
  }

  const ranked = [...map.values()].sort(
    (a, b) => b.count - a.count || b.lastAt.getTime() - a.lastAt.getTime()
  );

  return ranked.slice(0, limit).map((g) => {
    const near = suggestNovaCatalogPhrases(g.query, {
      limit: 1,
      tooledOnly: false,
      minScore: 0.28,
    })[0];
    const lexiconHint = near
      ? `Add synonym under topic "${near.topicId}" (${near.topicLabel}): "${g.query}" → near "${near.phrase}"`
      : `No close catalog hit — consider a new synonym or PHRASE_EXPAND for “${g.query}”`;
    return {
      query: g.query,
      count: g.count,
      lastAt: g.lastAt,
      markers: [...g.markers],
      suggestedTopicId: near?.topicId ?? null,
      suggestedTopicLabel: near?.topicLabel ?? null,
      suggestedPhrase: near?.phrase ?? null,
      lexiconHint,
    };
  });
}
