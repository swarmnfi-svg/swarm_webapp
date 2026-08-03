/**
 * Presentation mode contract — single source of truth lives in `@/lib/ai/nova-presentation`.
 * This module re-exports + keeps PREP-named aliases for non-attendance formatters.
 */

export type {
  NovaPresentationMode,
} from "@/lib/ai/nova-presentation";

export {
  NOVA_DETERMINISTIC_POLISHED_TOOLS,
  NOVA_HYBRID_GUARDED_TOOLS,
  formatNovaScopeLabel,
  presentationModeToolTag,
  resolveNovaPresentationMode,
} from "@/lib/ai/nova-presentation";

import {
  NOVA_DETERMINISTIC_POLISHED_TOOLS,
  NOVA_HYBRID_GUARDED_TOOLS,
  resolveNovaPresentationMode,
  type NovaPresentationMode,
} from "@/lib/ai/nova-presentation";

/** @deprecated Prefer NOVA_DETERMINISTIC_POLISHED_TOOLS — PREP alias. */
export const PREP_DETERMINISTIC_POLISHED_TOOLS = [
  ...NOVA_DETERMINISTIC_POLISHED_TOOLS,
] as const;

/** @deprecated Prefer NOVA_HYBRID_GUARDED_TOOLS — PREP alias. */
export const PREP_HYBRID_GUARDED_TOOLS = [...NOVA_HYBRID_GUARDED_TOOLS] as const;

/** Expected mode for a single tool (pack-level resolution uses resolveNovaPresentationMode). */
export function prepPresentationModeForTool(tool: string): NovaPresentationMode {
  if (NOVA_DETERMINISTIC_POLISHED_TOOLS.has(tool)) return "deterministic_polished";
  if (NOVA_HYBRID_GUARDED_TOOLS.has(tool)) return "hybrid_guarded";
  if (tool.endsWith("_summary") || tool.includes("pack")) return "hybrid_guarded";
  return "deterministic_polished";
}

export const PRESENTATION_POLISH_PREP_VERSION = "0.1.0";

/** Pack-level resolve — same as core. */
export { resolveNovaPresentationMode as resolvePrepPresentationMode };
