/**
 * Bridge chat caption → shared query-structure entity kindHint.
 * Used when paperclip note says e.g. “for Avaada” / “Avaada project”.
 * Assistive only — never ledger writes.
 */

import {
  parseEntityModuleAsk,
  parseNovaEntityRoleSpan,
  type NovaEntityKindHint,
  type NovaModuleHint,
} from "@/lib/nova/query-structure";

export type NovaReaderOpenContext = {
  caption: string;
  entitySpan: string | null;
  entityKindHint: NovaEntityKindHint;
  moduleHint: NovaModuleHint;
  strippedRoleWords: string[];
};

export function emptyReaderOpenContext(caption = ""): NovaReaderOpenContext {
  return {
    caption: caption.trim(),
    entitySpan: null,
    entityKindHint: null,
    moduleHint: null,
    strippedRoleWords: [],
  };
}

/**
 * Parse optional Reader chat caption into entity/module open context.
 * Prefers shared `parseEntityModuleAsk` / role-span strip — no brand lists.
 */
export function parseReaderCaptionOpenContext(
  caption: string | null | undefined
): NovaReaderOpenContext {
  const raw = (caption ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return emptyReaderOpenContext("");

  // Strip leading attach/read glue so “attach for Avaada” → trailing-for parse works
  const scrubbed = raw
    .replace(/^(?:please\s+)?(?:attach|read|scan|upload|use)\s+(?:this\s+)?(?:for|as|on|to)\s+/i, "for ")
    .replace(/^(?:please\s+)?(?:attach|read|scan|upload)\s+/i, "")
    .trim();

  const parsed =
    parseEntityModuleAsk(scrubbed) ??
    parseEntityModuleAsk(raw) ??
    parseNovaEntityRoleSpan(scrubbed) ??
    parseNovaEntityRoleSpan(raw);

  if (!parsed?.entitySpan) {
    return emptyReaderOpenContext(raw);
  }

  return {
    caption: raw,
    entitySpan: parsed.entitySpan,
    entityKindHint: parsed.entityKindHint,
    moduleHint: parsed.moduleHint,
    strippedRoleWords: parsed.strippedRoleWords,
  };
}

/**
 * Soft party name from open context for draft matching when OCR party is empty.
 * Returns null when kindHint conflicts with the intended mapper side.
 */
export function captionPartyNameForSide(
  open: NovaReaderOpenContext,
  side: "customer" | "vendor"
): string | null {
  const span = open.entitySpan?.trim();
  if (!span) return null;
  if (side === "customer") {
    if (open.entityKindHint === "vendor") return null;
    return span;
  }
  // vendor
  if (open.entityKindHint === "customer" || open.entityKindHint === "project") {
    return null;
  }
  return span;
}
