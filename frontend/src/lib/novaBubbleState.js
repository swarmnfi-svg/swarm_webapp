export const NOVA_AI_BUBBLE_STORAGE_KEY = 'nova-ai-bubble-state';
export const NOVA_AI_BUBBLE_STATE_EVENT = 'nova-ai-bubble-state';

/** @typedef {'open' | 'minimized' | 'hidden'} NovaAiBubbleState */

/** @returns {NovaAiBubbleState} */
export function readNovaAiBubbleState() {
  try {
    const raw = sessionStorage.getItem(NOVA_AI_BUBBLE_STORAGE_KEY);
    if (raw === 'open' || raw === 'minimized' || raw === 'hidden') return raw;
  } catch {
    /* ignore */
  }
  return 'minimized';
}

/** @param {NovaAiBubbleState} state */
export function writeNovaAiBubbleState(state) {
  try {
    sessionStorage.setItem(NOVA_AI_BUBBLE_STORAGE_KEY, state);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOVA_AI_BUBBLE_STATE_EVENT, { detail: { state } }));
  }
}

/** @param {NovaAiBubbleState} [state] */
export function restoreNovaAiBubble(state = 'minimized') {
  writeNovaAiBubbleState(state);
}
