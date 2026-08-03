/**
 * Entity-type conflict policy — mixed Customer/Project/Vendor/Staff → clarify.
 */

export type NovaConflictPartyType = "customer" | "vendor" | "project" | "staff";

/**
 * Always clarify when soft-resolve spans more than one party type
 * (or party + staff). Kind hint may narrow preferTypes upstream; never silent-pick.
 */
export function shouldClarifyMixedEntityTypes(
  partyTypes: Iterable<NovaConflictPartyType>,
  opts?: { staffCandidateCount?: number }
): boolean {
  const types = new Set(partyTypes);
  if (types.size > 1) return true;
  if (types.size >= 1 && (opts?.staffCandidateCount ?? 0) > 0) return true;
  return false;
}

/** Clarify copy for ambiguous customer vs project same token. */
export function mixedEntityClarifyMessage(hint: string): string {
  return `I found more than one match for “${hint}”. Pick the **customer**, **project**, or **vendor** — I won’t guess.`;
}
