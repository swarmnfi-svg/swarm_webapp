/**
 * Natural-language document / engineering-drawing jargon for NOVA.
 * Maps P&ID, GA, SLD, etc. onto documents_search with an optional party span.
 * Keep this deterministic — no Think invent.
 */

import {
  looksLikeHardPartyOrProjectName,
  looksLikePartyOrProjectName,
  looksLikeSingleTokenPartyLabel,
  normalizeNovaEntityLookupHint,
} from "@/lib/nova/party-name";

/** Canonical doc cue after normalize (search engine / lexicon). */
export const NOVA_DOC_CUE = "documents" as const;

/**
 * Drawing / file jargon → plain "documents" (entity span preserved separately).
 * Longer / more specific phrases first.
 */
const DOC_JARGON_TO_DOCUMENTS: [RegExp, string][] = [
  [/\bpiping\s*(?:&|and)?\s*instrument(?:ation)?\s*(?:diagrams?|dwgs?|drawings?)?\b/gi, NOVA_DOC_CUE],
  [/\bp\s*(?:&|and)\s*ids?\b/gi, NOVA_DOC_CUE],
  [/\bpnids?\b/gi, NOVA_DOC_CUE],
  [/\bp\s*ids?\b/gi, NOVA_DOC_CUE],
  [/\bsingle[\s-]?line\s+diagrams?\b/gi, NOVA_DOC_CUE],
  [/\bslds?\b/gi, NOVA_DOC_CUE],
  [/\bprocess\s+flow\s+diagrams?\b/gi, NOVA_DOC_CUE],
  [/\bpfds?\b/gi, NOVA_DOC_CUE],
  [/\bgeneral\s+arrangement(?:\s+drawings?)?\b/gi, NOVA_DOC_CUE],
  [/\bga\s+drawings?\b/gi, NOVA_DOC_CUE],
  [/\bisometrics?(?:\s+drawings?)?\b/gi, NOVA_DOC_CUE],
  [/\bdatasheets?\b/gi, NOVA_DOC_CUE],
  [/\blayouts?(?:\s+drawings?)?\b/gi, NOVA_DOC_CUE],
  [/\bschematics?\b/gi, NOVA_DOC_CUE],
  [/\bblueprints?\b/gi, NOVA_DOC_CUE],
  [/\bengineering\s+drawings?\b/gi, NOVA_DOC_CUE],
  [/\btechnical\s+drawings?\b/gi, NOVA_DOC_CUE],
  [/\bdrawings?\b/gi, NOVA_DOC_CUE],
];

/** Match party + document cue (either order). */
const PARTY_THEN_DOC =
  /^(?:(?:show|find|get|open|pull|fetch|list|see|check|where(?:'s| is)|do we have|have we|any)\s+(?:me\s+|us\s+|the\s+)?)?(.+?)\s+(documents?|photos?|pictures?|images?|files?|attachments?|drawings?|p\s*(?:&|and)\s*ids?|pnids?|p\s*ids?|slds?|pfds?|isometrics?|isos?|datasheets?|layouts?|schematics?|blueprints?)\s*$/i;

const DOC_THEN_PARTY =
  /^(?:(?:show|find|get|open|pull|fetch|list|see|check|where(?:'s| is)|do we have|have we|any)\s+(?:me\s+|us\s+|the\s+)?)?(documents?|photos?|pictures?|images?|files?|attachments?|drawings?|p\s*(?:&|and)\s*ids?|pnids?|p\s*ids?|slds?|pfds?|isometrics?|isos?|datasheets?|layouts?|schematics?|blueprints?|piping\s*(?:&|and)?\s*instrument(?:ation)?(?:\s+diagrams?)?)\s+(?:for|of|on|from|about|regarding)?\s+(.+?)\s*$/i;

const MODULE_NOISE =
  /^(tasks?|todos?|invoices?|billing|sales|receipts?|collections?|receivables?|outstanding|documents?|photos?|pictures?|images?|files?|attachments?|drawings?|approvals?|pending|open|overdue|purchase|orders?|pos?|sos?|expenses?|kharcha|payment|requests?|credit|debit|notes?|deliver(?:y|ies)|dispatch(?:es)?|grns?|goods|material|stock|bank|banking|cash)$/i;

function cleanPartySpan(raw: string): string | null {
  let h = normalizeNovaEntityLookupHint(raw.replace(/\s+/g, " ").trim());
  h = h
    .replace(
      /^(?:the|a|an|our|my|for|of|on|from|about|regarding)\s+/i,
      ""
    )
    .trim();
  if (!h || MODULE_NOISE.test(h)) return null;
  if (/^(?:why|what|who|how|when|where)\b/i.test(h)) return null;
  const ok =
    looksLikeHardPartyOrProjectName(h) ||
    looksLikePartyOrProjectName(h) ||
    looksLikeSingleTokenPartyLabel(h);
  return ok ? h : null;
}

export type NovaPartyDocumentAsk = {
  entityHint: string;
  /** Original matched cue (for provenance). */
  docCue: string;
};

/** Normalize drawing jargon in-place so later routers see "documents". */
export function normalizeNovaDocumentJargon(raw: string): string {
  let q = raw.trim().replace(/\s+/g, " ");
  if (!q) return q;
  for (const [re, rep] of DOC_JARGON_TO_DOCUMENTS) {
    q = q.replace(re, rep);
  }
  return q.replace(/\s+/g, " ").trim();
}

/**
 * Detect natural-language “party + drawing/document” asks (either order).
 * Call after light typo normalize; before or after lexicon expand is fine.
 */
export function matchNovaPartyDocumentAsk(
  query: string
): NovaPartyDocumentAsk | null {
  const q = query.trim().replace(/\s+/g, " ");
  if (!q) return null;

  let m = q.match(PARTY_THEN_DOC);
  if (m) {
    const entityHint = cleanPartySpan(m[1] ?? "");
    const docCue = (m[2] ?? "documents").trim();
    if (entityHint) return { entityHint, docCue };
  }

  m = q.match(DOC_THEN_PARTY);
  if (m) {
    const docCue = (m[1] ?? "documents").trim();
    const entityHint = cleanPartySpan(m[2] ?? "");
    if (entityHint) return { entityHint, docCue };
  }

  return null;
}

/**
 * True when catalog near-miss would be harmful: named party / drawing ask
 * should resolve entities or documents, not attendance/IRN chips.
 */
export function shouldSuppressCatalogNearMiss(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (matchNovaPartyDocumentAsk(q)) return true;
  if (matchNovaPartyDocumentAsk(normalizeNovaDocumentJargon(q))) return true;
  // Hard company/project labels (Tata Steels / James School) — not soft typos like "leave balans"
  if (looksLikeHardPartyOrProjectName(q)) return true;
  return false;
}
