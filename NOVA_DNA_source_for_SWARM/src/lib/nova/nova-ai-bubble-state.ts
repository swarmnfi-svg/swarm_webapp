/**
 * NOVA AI bubble open/minimize/hide preference — leaf module (no React UI imports).
 * Used by the floating bubble and page-top Assist “Open NOVA bubble” affordance.
 */

export const NOVA_AI_BUBBLE_STORAGE_KEY = "nova-ai-bubble-state";
export const NOVA_AI_BUBBLE_STATE_EVENT = "nova-ai-bubble-state";

export type NovaAiBubbleState = "open" | "minimized" | "hidden";

export function readNovaAiBubbleState(): NovaAiBubbleState {
  try {
    const raw = sessionStorage.getItem(NOVA_AI_BUBBLE_STORAGE_KEY);
    if (raw === "open" || raw === "minimized" || raw === "hidden") return raw;
  } catch {
    /* ignore */
  }
  return "minimized";
}

export function writeNovaAiBubbleState(state: NovaAiBubbleState) {
  try {
    sessionStorage.setItem(NOVA_AI_BUBBLE_STORAGE_KEY, state);
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(NOVA_AI_BUBBLE_STATE_EVENT, { detail: { state } }),
    );
  }
}

/** Clear session hide and show the launcher on other app pages. */
export function restoreNovaAiBubble(state: NovaAiBubbleState = "minimized") {
  writeNovaAiBubbleState(state);
}
