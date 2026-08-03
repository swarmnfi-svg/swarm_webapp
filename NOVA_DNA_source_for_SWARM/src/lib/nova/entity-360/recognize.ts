/**
 * Entity 360 identifier recognizer.
 *
 * Detects when a NOVA query names a *specific* ERP record by its human code, so
 * NOVA can produce a cross-module "entity 360" summary instead of a generic
 * search list. The recogniser is intentionally table-driven so new entity kinds
 * (project, customer, vendor, sales order, delivery, invoice, …) can be added
 * without touching the routing/skill wiring.
 *
 * Only payment-request codes are wired for 360 today (the first deliverable).
 * Other kinds resolve fine through the existing entity-resolve path, so we do
 * not hijack them here and risk regressions.
 */

export type Entity360Kind =
  | "payment_request"
  // Reserved extension points (recognised but 360 not yet built):
  | "project"
  | "customer"
  | "vendor"
  | "sales_order"
  | "invoice"
  | "purchase_bill"
  | "purchase_order"
  | "staff_advance";

export type Entity360Ref = {
  kind: Entity360Kind;
  /** Canonical (upper-cased) identifier as stored in the ERP. */
  id: string;
  /** The exact matched substring from the query. */
  raw: string;
};

type Entity360Pattern = {
  kind: Entity360Kind;
  /** Whether NOVA currently builds a 360 for this kind (routing gate). */
  supported: boolean;
  patterns: RegExp[];
};

/**
 * Payment-request IDs come in two shapes (see `src/lib/ids.ts`):
 *  1. Project-linked bank reference: `{projectRef}-{txnType}{seq}` e.g. `C0028-P001-E002`.
 *     txnType ∈ RefTxnType {R, VP, E, PO, TR, IN, SI}.
 *  2. Non-project series: `{PREFIX}/{FY}/{seq}` e.g. `OTH/26-27/0011`.
 *     PREFIX ∈ {ADV, EXP, REIM, SAL, SALPAY, TRF, DIR, OTH}.
 */
const PAYMENT_REQUEST_PROJECT_RE =
  /\bC\d{3,}-P\d{2,}-(?:VP|PO|TR|IN|SI|R|E)\d{2,}\b/i;

const PAYMENT_REQUEST_SERIES_RE =
  /\b(?:ADVRET|SALPAY|ADV|EXP|REIM|SAL|TRF|DIR|OTH|MEXP|SET)\/\d{2}-\d{2}\/\d{1,}\b/i;

/**
 * Recognition table. First matching pattern wins. Longer / more specific
 * formats are listed first so e.g. a project-scoped payment id is preferred
 * over any looser project-code interpretation.
 */
const ENTITY_360_PATTERNS: Entity360Pattern[] = [
  {
    kind: "payment_request",
    supported: true,
    patterns: [PAYMENT_REQUEST_PROJECT_RE, PAYMENT_REQUEST_SERIES_RE],
  },
];

/** True when NOVA can build a 360 for this recognised kind. */
export function entity360KindIsSupported(kind: Entity360Kind): boolean {
  return ENTITY_360_PATTERNS.some((p) => p.kind === kind && p.supported);
}

/** Global (all-occurrence) clone of a recogniser pattern. Patterns are linear
 * (no nested quantifiers) so scanning every occurrence is ReDoS-safe. */
function globalClone(re: RegExp): RegExp {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return new RegExp(re.source, flags);
}

/**
 * Find every recognised entity identifier in the query, de-duplicated and
 * ordered by first appearance (leftmost). This is deterministic regardless of
 * pattern-table order: two codes in one query always resolve to the same
 * leftmost id, and repeated / case-variant mentions collapse to one entry.
 */
export function recognizeAllEntity360Ids(query: string): Entity360Ref[] {
  const q = (query ?? "").trim();
  if (!q) return [];

  type Hit = { kind: Entity360Kind; index: number; raw: string };
  const hits: Hit[] = [];
  for (const row of ENTITY_360_PATTERNS) {
    if (!row.supported) continue;
    for (const re of row.patterns) {
      const g = globalClone(re);
      let m: RegExpExecArray | null;
      while ((m = g.exec(q)) !== null) {
        if (m[0]) hits.push({ kind: row.kind, index: m.index, raw: m[0] });
        // Guard against zero-length matches looping forever.
        if (m.index === g.lastIndex) g.lastIndex += 1;
      }
    }
  }

  // Leftmost first; on identical positions prefer the longer (more specific) match.
  hits.sort((a, b) => a.index - b.index || b.raw.length - a.raw.length);

  const seen = new Set<string>();
  const out: Entity360Ref[] = [];
  for (const h of hits) {
    const id = h.raw.toUpperCase();
    const key = `${h.kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: h.kind, id, raw: h.raw });
  }
  return out;
}

/**
 * Find the leftmost recognised entity identifier in the query.
 * Returns `null` when no supported identifier is present.
 */
export function recognizeEntity360Id(query: string): Entity360Ref | null {
  return recognizeAllEntity360Ids(query)[0] ?? null;
}

/** True when the query names a specific record NOVA can build a 360 for. */
export function queryNamesEntity360(query: string): boolean {
  return recognizeEntity360Id(query) !== null;
}
