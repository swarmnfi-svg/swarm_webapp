import type { ClientApiUser } from "@/lib/client-api/v1/auth";
import { can } from "@/lib/rbac";
import { emptyNovaDialogState } from "@/lib/nova/dialog-state";
import { saveNovaDialogState } from "@/lib/nova/memory";

/**
 * Mobile wrapper for web clearNovaChatAction — resets DialogState only.
 */
export async function clearNovaChatForMobileUser(
  user: ClientApiUser,
  conversationId?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!can(user, "ai.assistant.read")) {
    return { ok: false, error: "NOVA AI is not enabled for your account." };
  }
  if (conversationId) {
    try {
      await saveNovaDialogState(
        user.id,
        conversationId,
        emptyNovaDialogState({ conversationId, userId: user.id })
      );
    } catch (err) {
      console.error(
        "[nova-mobile-clear]",
        err instanceof Error ? err.message : "error"
      );
      return { ok: false, error: "Could not clear chat state. Try again." };
    }
  }
  return { ok: true };
}
