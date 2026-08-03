/**
 * Unambiguous money pairs for NOVA facts + LLM guardrails.
 * Indian grouping (en-IN) confuses models — always ship raw number + preformatted Inr.
 */
import { inr } from "@/lib/format";
import type { NovaToolFact } from "@/lib/ai/nova-tools";

/** Raw number + en-IN currency string. */
export function novaMoney(amount: unknown): { value: number; valueInr: string } {
  const value = Number(amount ?? 0);
  const safe = Number.isFinite(value) ? value : 0;
  return { value: safe, valueInr: inr(safe) };
}

/** Digits-only compare key (strips ₹/Rs/INR, commas, trailing fractional .00). */
export function novaInrDigits(s: string): string {
  return String(s)
    .replace(/₹/g, "")
    .replace(/\b(?:Rs\.?|INR|inr)\s*/gi, "")
    .replace(/,/g, "")
    .trim()
    .replace(/\.00$/u, "")
    .replace(/[^\d.]/g, "")
    .replace(/\.$/, "");
}

/** Extract ₹ / Rs. / INR-formatted amounts from prose as digit tokens. */
export function extractInrDigitTokens(content: string): string[] {
  // Allow optional space after ₹ (models often write "₹ 1,84,24,601.00")
  const matches =
    content.match(/(?:₹\s*|Rs\.?\s*|INR\s*)[\d,]+(?:\.\d+)?/gi) ?? [];
  return matches.map((m) => novaInrDigits(m)).filter(Boolean);
}

/** Headline aggregates — must appear when present (LLM often omits taxable/GST). */
export const NOVA_HEADLINE_MONEY_INR_KEYS = [
  "grandTotalInr",
  "totalCollectedInr",
  "overdueTotalInr",
  "openInvoiceTotalInr",
  "totalInvoiceValueInr",
  "fyTargetInr",
  "orderBookValueInr",
  "bankBalanceInr",
  "fySalesInr",
  "fyCollectionInr",
  "receivablesTotalInr",
  "payablesTotalInr",
  "outstandingTotalInr",
  "totalOperationalBalanceInr",
  "totalBookBalanceInr",
  "totalActiveProjectValueInr",
  "netFundsAvailableInr",
  "paidTotalInr",
  "creditNoteTotalInr",
  // Reports / fund / GSTR headlines (nested or top-level)
  "salesTotalInr",
  "collectionsInr",
  "receivablesOutstandingInr",
  "payablesOutstandingInr",
  "gstr1TaxableInr",
  "gstr1TotalGstInr",
  "gstr3bOutputTaxInr",
  "gstr3bNetPayableInr",
  "operationalBankBalanceInr",
  // Nested director order-book / fund aliases
  "targetInr",
] as const;

/** All aggregate *Inr keys used for 10× misread detection. */
export const NOVA_PRIMARY_MONEY_INR_KEYS = [
  ...NOVA_HEADLINE_MONEY_INR_KEYS,
  "taxableTotalInr",
  "gstTotalInr",
  "totalPaidInr",
  "totalBalancePendingInr",
  "debitNoteTotalInr",
  "completedValueInr",
  "pendingOrderTotalInr",
  "periodSalesInr",
  "periodCollectionInr",
  "totalStatementBalanceInr",
  "netGstInr",
  "purchasesInr",
  "receivablesInr",
  "payablesInr",
  "cashInHandInr",
  "positiveBankInr",
  "bookBankInr",
  "odCcUtilisedInr",
  "odCcAvailableInr",
  "b0Inr",
  "b30Inr",
  "b60Inr",
  "b90Inr",
  "agingTotalInr",
  "totalInr",
  "invoicedInr",
  "receivedInr",
  "marginInr",
  "prevFyOrderBookInr",
  "prevFyCompletedInr",
  "todayInInr",
  "todayOutInr",
] as const;

/**
 * Walk nested fact objects (reportSummary, fundPosition, receivablesAging, gstr totals, …)
 * for registered *Inr keys. When `anyInr` is true, also collect any string key ending in `Inr`.
 */
function extractInrByKeys(
  data: Record<string, unknown>,
  keys: readonly string[],
  opts?: { anyInr?: boolean }
): string[] {
  const keySet = new Set<string>(keys);
  const out: string[] = [];
  const walk = (obj: unknown, depth: number) => {
    if (!obj || typeof obj !== "object" || depth > 6) return;
    if (Array.isArray(obj)) {
      // Skip sample arrays — only walk named aggregate objects
      return;
    }
    const rec = obj as Record<string, unknown>;
    for (const [k, v] of Object.entries(rec)) {
      const isMoneyKey = keySet.has(k) || (opts?.anyInr === true && /Inr$/u.test(k));
      if (isMoneyKey && typeof v === "string" && v && v !== "hidden") {
        out.push(v);
      } else if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v, depth + 1);
      }
    }
  };
  walk(data, 0);
  return out;
}

export function extractPrimaryMoneyInr(facts: NovaToolFact[]): string[] {
  const out: string[] = [];
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    out.push(
      ...extractInrByKeys(f.data as Record<string, unknown>, NOVA_PRIMARY_MONEY_INR_KEYS, {
        anyInr: true,
      })
    );
  }
  return out;
}

function extractHeadlineMoneyInr(facts: NovaToolFact[]): string[] {
  const out: string[] = [];
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    out.push(...extractInrByKeys(f.data as Record<string, unknown>, NOVA_HEADLINE_MONEY_INR_KEYS));
  }
  return out;
}

/** True when facts include headline ₹ aggregates (sales/receipts/etc.) — not sample-only amounts. */
export function factsHaveHeadlineMoney(facts: NovaToolFact[]): boolean {
  return extractHeadlineMoneyInr(facts).some((r) => {
    const d = novaInrDigits(r);
    return Boolean(d && d !== "0");
  });
}

/**
 * Count / queue tools where deterministic format is clearer than LLM prose
 * (avoids money-guard false positives on “10 awaiting”).
 */
export const NOVA_COUNT_FIRST_TOOLS = new Set([
  "payment_requests_summary",
  "pending_workflow_counts",
  "customers_summary",
  "vendors_summary",
  "staff_summary",
  "approvals_summary",
  "purchase_requests_summary",
  "sales_orders_summary",
  "purchase_orders_summary",
  // Queues / registers — polished deterministic (hybrid tools live in nova-presentation).
  "leave_summary",
  "stock_summary",
  "overtime_summary",
  "regularisation_summary",
  "grn_summary",
  "incentives_summary",
]);

/**
 * Prefer polished deterministic presentation for pure count/queue packs (no headline money).
 * Hybrid overviews (attendance, tasks, packs, money) are resolved via resolveNovaPresentationMode.
 * Skill preferDeterministic still marks facts as ERP-truthful but no longer forces skip-LLM alone.
 */
export function packPrefersDeterministicCounts(
  facts: NovaToolFact[],
  prefersDeterministicTool?: (toolId: string) => boolean
): boolean {
  const ok = facts.filter((f) => f.ok && !f.denied && f.data);
  if (ok.length === 0) return false;
  if (factsHaveHeadlineMoney(ok)) return false;
  // Only queue/register COUNT_FIRST tools force polished (not every preferDeterministic skill).
  return ok.every(
    (f) =>
      NOVA_COUNT_FIRST_TOOLS.has(f.tool) ||
      f.tool.endsWith("_open") ||
      f.tool === "entity_resolve" ||
      f.tool === "person_resolve" ||
      // delivery stays polished when skill prefers deterministic
      (prefersDeterministicTool?.(f.tool) === true &&
        (f.tool === "delivery_summary" || f.tool === "daily_brief"))
  );
}

function isTenXMisread(tokenDigits: string, truthDigits: string): boolean {
  if (!tokenDigits || !truthDigits || tokenDigits === truthDigits) return false;
  const t = tokenDigits.replace(/\./g, "");
  const r = truthDigits.replace(/\./g, "");
  if (!/^\d+$/.test(t) || !/^\d+$/.test(r)) return false;
  return t === r + "0" || r === t + "0" || t === r + "00" || r === t + "00";
}

function moneyStringAppearsInContent(
  content: string,
  moneyInr: string,
  tokens: Set<string>
): boolean {
  if (content.includes(moneyInr)) return true;
  const withoutPaise = moneyInr.replace(/\.00$/, "");
  if (withoutPaise !== moneyInr && content.includes(withoutPaise)) return true;
  const digits = novaInrDigits(moneyInr);
  return Boolean(digits && tokens.has(digits));
}

/**
 * True when the LLM answer still contains the primary money string(s) from facts.
 * Catches Indian-comma misreads (6,37,000 → 63,70,000) and invented 10× totals.
 * Uses exact digit-token match (not substring) so 637000 ≠ 6370000.
 * Requires at least one headline amount when headlines exist (not all of them —
 * bank / fund answers often lead with operational and correctly omit book).
 * Also fails if any stated ₹ amount is a 10× of a known fact.
 * Fail closed: if the answer states ₹ amounts but facts have no money headlines → reject
 * (blocks copying prior-turn totals when current tools are search-only).
 */
export function llmPreservesPrimaryMoney(content: string, facts: NovaToolFact[]): boolean {
  const headlines = extractHeadlineMoneyInr(facts);
  const allPrimary = extractPrimaryMoneyInr(facts);
  const tokenList = extractInrDigitTokens(content);
  const tokens = new Set(tokenList);
  const answerHasMoney = tokens.size > 0 || /₹|rs\.?\s*\d/i.test(content);

  // No money in facts but answer invents amounts (history bleed / hallucination)
  if (headlines.length === 0 && allPrimary.length === 0) {
    return !answerHasMoney;
  }

  const seenDigits = new Set<string>();
  const check: string[] = [];
  for (const r of headlines) {
    const digits = novaInrDigits(r);
    if (!digits || digits === "0" || seenDigits.has(digits)) continue;
    seenDigits.add(digits);
    check.push(r);
    if (check.length >= 2) break;
  }

  // At least one headline must appear — requiring every collected headline caused
  // false “inconsistently” banners when narration correctly led with one total.
  const headlinesOk =
    check.length === 0 ||
    check.some((r) => moneyStringAppearsInContent(content, r, tokens));
  if (!headlinesOk) return false;

  // Any stated amount that is a classic 10×/0.1× of a known primary → reject
  const truthDigits = allPrimary.map(novaInrDigits).filter((d) => d && d !== "0");
  for (const tok of tokens) {
    for (const truth of truthDigits) {
      if (isTenXMisread(tok, truth)) return false;
    }
  }
  return true;
}

/**
 * When facts include customerFilter / entityFilter, the answer must not attribute
 * money to a different party name from the query (entity fidelity).
 */
export function llmPreservesEntityFilter(
  content: string,
  facts: NovaToolFact[],
  query: string
): boolean {
  const filters: string[] = [];
  for (const f of facts) {
    if (!f.ok || f.denied || !f.data) continue;
    const cf = f.data.customerFilter ?? f.data.entityFilter;
    if (typeof cf === "string" && cf.trim().length >= 2) filters.push(cf.trim());
  }
  if (filters.length === 0) return true;

  // If answer names a different known prior party while filter is set — soft check:
  // require at least one filter token to appear when money is stated
  const answerHasMoney = /₹|rs\.?\s*\d/i.test(content) || extractInrDigitTokens(content).length > 0;
  if (!answerHasMoney) return true;

  const lower = content.toLowerCase();
  const qLower = query.toLowerCase();
  for (const f of filters) {
    const first = f.trim().split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 3 && (lower.includes(first) || qLower.includes(first))) {
      return true;
    }
  }
  // Filter set + money stated but none of the filter tokens appear → fail
  return false;
}
