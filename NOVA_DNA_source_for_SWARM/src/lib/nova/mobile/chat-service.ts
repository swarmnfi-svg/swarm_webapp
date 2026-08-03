import type { ClientApiUser } from "@/lib/client-api/v1/auth";
import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { answerNovaQuery, type NovaChatTurn } from "@/lib/ai/nova";
import { getPlatformSettings } from "@/lib/platform-settings";
import {
  novaDailyQuotaLimit,
  novaQueryLogRetentionDays,
  redactNovaHistoryText,
  redactNovaQueryForLog,
  releaseNovaSlot,
  tryAcquireNovaSlot,
} from "@/lib/ai/nova-quota";
import {
  appendNovaConversationTurn,
  loadNovaConversationHistory,
  loadNovaDialogState,
  purgeNovaConversationMemory,
} from "@/lib/nova/memory";
import {
  buildNovaClarifyAct,
  emptyNovaDialogState,
  pushNovaClarifyAct,
} from "@/lib/nova/dialog-state";
import {
  classifyNovaLlmError,
  novaLlmErrorUserMessage,
  novaLlmSuggestedRetryMs,
} from "@/lib/ai/nova-llm-errors";
import type { AskNovaResult } from "@/app/(app)/ai-assistant/actions";

export type NovaMobileChatRequest = {
  message: string;
  history?: NovaChatTurn[];
  conversationId?: string | null;
};

export async function askNovaForMobileUser(
  user: ClientApiUser,
  input: NovaMobileChatRequest
): Promise<AskNovaResult> {
  if (!can(user, "ai.assistant.read")) {
    return {
      ok: false,
      error: "NOVA AI is not enabled for your account. Ask an admin to grant Use NOVA AI.",
    };
  }

  const settings = await getPlatformSettings();
  if (!settings.aiAssistantEnabled) {
    return {
      ok: false,
      error: "NOVA AI is turned off in System Tools. Ask an admin to enable the platform flag.",
    };
  }

  const trimmed = (input.message ?? "").trim().slice(0, 1000);
  if (!trimmed) return { ok: false, error: "Enter a question for NOVA AI." };

  let tz = process.env.APP_TIMEZONE?.trim() || "Asia/Kolkata";
  try {
    const { getAppTimezone } = await import("@/lib/datetime");
    tz = await getAppTimezone();
  } catch {
    /* keep default */
  }
  const { getDayBoundsInTimezone } = await import("@/lib/datetime-pure");
  const dayStart = getDayBoundsInTimezone(tz).start;
  const usedToday = await prisma.aiAssistantQueryLog.count({
    where: { userId: user.id, createdAt: { gte: dayStart } },
  });
  const quota = novaDailyQuotaLimit();
  if (usedToday >= quota) {
    return {
      ok: false,
      error: `Daily NOVA limit reached (${quota} queries). Try again tomorrow.`,
      errorKind: "rate_limited",
    };
  }

  if (!tryAcquireNovaSlot(user.id)) {
    return {
      ok: false,
      error: "NOVA is already answering another question for you. Wait a moment and try again.",
      errorKind: "unavailable",
    };
  }

  const conversationId = input.conversationId ?? null;
  const clientHistory = (input.history ?? [])
    .slice(-8)
    .filter(
      (h) => h && (h.role === "user" || h.role === "assistant") && typeof h.content === "string"
    )
    .map((h) => ({ role: h.role as "user" | "assistant", content: redactNovaHistoryText(h.content) }));

  let safeHistory = clientHistory;
  let dialogState = emptyNovaDialogState({ userId: user.id });
  if (conversationId) {
    try {
      const serverHistory = await loadNovaConversationHistory(user.id, conversationId, 8);
      if (serverHistory.length > 0) safeHistory = serverHistory;
      const loaded = await loadNovaDialogState(user.id, conversationId);
      if (loaded) dialogState = loaded;
    } catch {
      /* keep client history */
    }
  }

  try {
    const result = await answerNovaQuery(user as SessionUser, trimmed, safeHistory, { dialogState });

    let nextDialog = result.dialogState ?? dialogState;
    if (result.options?.length && !nextDialog.pendingClarify) {
      nextDialog = pushNovaClarifyAct(
        nextDialog,
        buildNovaClarifyAct({
          kind: result.clarifyKind ?? "generic",
          originalQuery: trimmed,
          options: result.options,
          resume: result.periodLabel
            ? {
                periodLabel: result.periodLabel,
                periodGrain: /today|yesterday|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(
                  result.periodLabel
                )
                  ? "day"
                  : null,
                periodSource: "follow_up",
                routingQuery: trimmed,
              }
            : undefined,
        })
      );
    }

    let persistedConversationId: string | undefined;
    try {
      const unmatched =
        result.toolsUsed.includes("search_entities") ||
        result.toolsUsed.includes("llm_no_facts") ||
        result.toolsUsed.includes("lexicon_stub") ||
        result.toolsUsed.includes("friendly_no_facts") ||
        result.toolsUsed.includes("catalog_suggest");
      await prisma.aiAssistantQueryLog.create({
        data: {
          userId: user.id,
          query: redactNovaQueryForLog(trimmed),
          responseSummary: redactNovaHistoryText(result.answer).slice(0, 500),
          toolsUsed: unmatched
            ? [...result.toolsUsed, "unmatched_review"]
            : result.toolsUsed,
          interpretedAs: result.interpretedAs?.slice(0, 8).join(", ") ?? null,
          primaryTool: result.primaryTool ?? result.toolsUsed[0] ?? null,
          periodLabel: result.periodLabel ?? null,
        },
      });

      const retentionDays = novaQueryLogRetentionDays();
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      await prisma.aiAssistantQueryLog
        .deleteMany({ where: { createdAt: { lt: cutoff } } })
        .catch(() => {});

      persistedConversationId = await appendNovaConversationTurn({
        userId: user.id,
        conversationId,
        userText: trimmed,
        assistantText: result.answer,
        toolsUsed: result.toolsUsed,
        dialogState: nextDialog,
      });
      await purgeNovaConversationMemory();
    } catch (err) {
      console.error("[nova-mobile-chat] log/memory failed", err instanceof Error ? err.message : "error");
    }

    return {
      ok: true,
      answer: result.answer,
      links: result.links,
      toolsUsed: result.toolsUsed,
      periodLabel: result.periodLabel ?? null,
      provenance: result.provenance,
      conversationId: persistedConversationId,
      pack: result.pack ?? null,
      options: result.options,
      clarifyKind: result.clarifyKind,
    };
  } catch (err) {
    console.error("[nova-mobile-chat]", err instanceof Error ? err.message : "error");
    const errorKind = classifyNovaLlmError(err);
    const retryAfterMs = novaLlmSuggestedRetryMs(errorKind);
    return {
      ok: false,
      error: novaLlmErrorUserMessage(err, { surface: "chat" }),
      errorKind,
      ...(retryAfterMs > 0 ? { retryAfterMs } : {}),
    };
  } finally {
    releaseNovaSlot(user.id);
  }
}
