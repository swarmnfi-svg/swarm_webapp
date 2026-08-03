/**
 * Shared party/project name heuristic — used by SearchEngine + person-hint gate.
 * Multi-word / digits / company tokens → project/party, not a person.
 *
 * Personal-domain person-hint extraction should use
 * {@link looksLikeHardPartyOrProjectName} so “Arif Ansari” / “MD Arif Ansari”
 * still bind for KPI / leave / tasks.
 */

/** Trailing type/module nouns often glued onto a party label (“Avaada project task”). */
const TRAILING_ENTITY_TYPE_NOISE =
  /\s+(?:projects?|tasks?|todos?|jobs?|works?|details?|info(?:rmation)?)\s*$/i;

/** Digit / company / org-token shapes — never a person. */
export function looksLikeHardPartyOrProjectName(hint: string): boolean {
  const h = hint.trim();
  if (!h) return false;
  if (/\d/.test(h)) return true;
  return /\b(steels?|steel|energy|power|plant|solar|infra|school|college|hospital|limited|ltd|pvt|private|corp|industries|biogas|facility|project)\b/i.test(
    h
  );
}

export function looksLikePartyOrProjectName(hint: string): boolean {
  const h = hint.trim();
  if (!h) return false;
  if (looksLikeHardPartyOrProjectName(h)) return true;
  const words = h.split(/\s+/).filter(Boolean);
  return words.length >= 2;
}

/**
 * Strip trailing “project” / “task(s)” / … before DB lookup or slot bind.
 * “Avaada project” → “Avaada”; multi-word labels kept intact.
 */
export function normalizeNovaEntityLookupHint(hint: string): string {
  let h = hint.trim().replace(/\s+/g, " ");
  // Repeat once so “Avaada project tasks” → “Avaada”
  for (let i = 0; i < 2; i++) {
    const next = h.replace(TRAILING_ENTITY_TYPE_NOISE, "").trim();
    if (next === h) break;
    h = next;
  }
  return h;
}

/**
 * Single-token brand labels (Avaada) — allowed for money/docs and for
 * project/task scopes so “tasks in avaada” / “avaada tasks” bind the party.
 * Never use for person-steal of “aalok tasks” (caller must gate on module family).
 */
export function looksLikeSingleTokenPartyLabel(hint: string): boolean {
  const h = normalizeNovaEntityLookupHint(hint).trim();
  if (!h) return false;
  return /^[A-Za-z][A-Za-z0-9&.-]{1,40}$/.test(h);
}
