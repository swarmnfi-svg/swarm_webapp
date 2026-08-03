/**
 * Optional desktop-shell NOVA bridge hook for production web chat.
 * When `window.__EMPOWER_NOVA_BRIDGE__` is injected by the native shell,
 * consult it before calling server NOVA so local-final answers can short-circuit.
 */

export type EmpowerNovaBridgeEnhanceRequest = {
  taskClass: string;
  prompt: string;
  sensitivity: string;
  cacheState?: string;
  containsRedactedContent?: boolean;
};

export type EmpowerNovaBridgeEnhanceResult = {
  source: string;
  serverActionRequired: boolean;
  localDraft?: string;
};

export type EmpowerNovaBridge = {
  enhance: (
    request: EmpowerNovaBridgeEnhanceRequest
  ) => Promise<EmpowerNovaBridgeEnhanceResult>;
};

declare global {
  interface Window {
    __EMPOWER_NOVA_BRIDGE__?: EmpowerNovaBridge;
  }
}

/** Resolve the injected bridge, if any (browser only). */
export function getEmpowerNovaBridge(): EmpowerNovaBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = window.__EMPOWER_NOVA_BRIDGE__;
  if (!bridge || typeof bridge.enhance !== "function") return null;
  return bridge;
}

/**
 * Ask the desktop bridge for a local-final answer.
 * Returns local text only when source is local-final and server is not required.
 * Any error / missing bridge → null (caller falls through to server NOVA).
 */
export async function tryNovaBridgeLocalFinal(
  prompt: string
): Promise<string | null> {
  const bridge = getEmpowerNovaBridge();
  if (!bridge) return null;
  try {
    const result = await bridge.enhance({
      taskClass: "drafting",
      prompt,
      sensitivity: "internal",
      cacheState: "fresh",
      containsRedactedContent: false,
    });
    if (
      result?.source === "local-final" &&
      result.serverActionRequired === false &&
      typeof result.localDraft === "string" &&
      result.localDraft.trim()
    ) {
      return result.localDraft.trim();
    }
  } catch {
    /* transparent fallback to server NOVA */
  }
  return null;
}
