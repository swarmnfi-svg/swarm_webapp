/**
 * Money / ops “late” (payment, invoice, collection, delivery) — not HR late-comers.
 * Shared by Analysis cues, Trend cues, and query-structure depth so “why late payment”
 * never becomes attendance Analysis depth.
 */

export function isNonAttendanceLateContext(query: string): boolean {
  if (
    /\b(late\s+(?:payment|fee|charge|invoices?)|(?:payment|fee|charge|invoices?)\s+late)\b/i.test(
      query
    )
  ) {
    return true;
  }
  return /\b(sales|revenue|receipts?|collections?|invoices?|billing|receivables?|outstanding|payables?|payments?|fees?|charges?|deliver(?:y|ies)|dispatch(?:es)?|challans?)\b/i.test(
    query
  );
}
