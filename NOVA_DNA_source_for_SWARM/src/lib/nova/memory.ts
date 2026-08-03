/**
 * Server-side NOVA conversation memory (lean).
 * Client sessionStorage remains the UI fallback; this persists redacted turns when practical.
 */

import { prisma } from "@/lib/prisma";
import { redactNovaHistoryText } from "@/lib/ai/nova-quota";
import {
  emptyNovaDialogState,
  parseNovaDialogState,
  type NovaDialogState,
} from "@/lib/nova/dialog-state";

const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_SENSITIVE_RETENTION_DAYS = 7;

const SENSITIVE_TOOLS = new Set([
  "salary_summary",
  "bank_accounts_summary",
  "bank_recon_summary",
  "vendor_bank_open",
  "staff_advances_summary",
  "staff_expense_summary",
  "incentives_summary",
  "profitability_summary",
  "customer_outstanding",
  "receivables_summary",
]);

export type NovaHistoryTurn = {
  role: "user" | "assistant";
  content: string;
  toolsUsed?: string[] | null;
};

export function novaConversationRetentionDays(): number {
  const raw = Number(process.env.NOVA_CONVERSATION_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_RETENTION_DAYS;
  return Math.min(Math.floor(raw), 365);
}

/** Salary / bank turns — shorter retention; never keep raw payslip forever. */
export function novaSensitiveMessageRetentionDays(): number {
  const raw = Number(
    process.env.NOVA_SENSITIVE_MESSAGE_RETENTION_DAYS || DEFAULT_SENSITIVE_RETENTION_DAYS
  );
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_SENSITIVE_RETENTION_DAYS;
  return Math.min(Math.floor(raw), novaConversationRetentionDays());
}

export function isNovaSensitiveTools(toolsUsed: string[] | undefined | null): boolean {
  if (!toolsUsed?.length) return false;
  return toolsUsed.some((t) => SENSITIVE_TOOLS.has(t));
}

/** Extra redaction for persisted memory — strip ₹ amounts on salary turns. */
export function redactNovaMessageForStore(
  text: string,
  opts?: { sensitive?: boolean }
): string {
  let out = redactNovaHistoryText(text);
  if (opts?.sensitive) {
    out = out
      .replace(/₹[\d,.]+/g, "[amount]")
      .replace(/\b(?:net|gross|basic)\s*(?:pay|salary)?\s*[:=]?\s*[\d,.]+/gi, "[pay]")
      .replace(/\b\d{1,3}(?:,\d{2}){2,}(?:\.\d+)?\b/g, "[amount]");
  }
  return out.slice(0, 800);
}

function toolsFromJson(toolsUsed: unknown): string[] {
  if (Array.isArray(toolsUsed)) return toolsUsed.map(String);
  if (typeof toolsUsed === "string") return [toolsUsed];
  return [];
}

function slotLabelFromTools(tools: string[]): string | null {
  const skip = new Set([
    "lexicon",
    "llm",
    "deterministic",
    "follow_up",
    "rbac_deny",
    "rbac_soft_deny",
    "llm_skipped",
    "llm_no_facts",
    "friendly_no_facts",
    "llm_fallback_facts",
    "llm_not_configured",
    "unmatched_review",
    "catalog_suggest",
  ]);
  const primary = tools.find((t) => !skip.has(t) && !t.startsWith("deny:") && !t.includes(":"));
  if (!primary) return null;
  return primary.replace(/_summary$/i, "").replace(/_open$/i, "").replace(/_/g, " ");
}

/**
 * Compress older turns into one slot-summary line so long threads keep recent
 * context without blowing the history window (NI memory polish).
 */
export function compressNovaHistoryWithSlotSummary(
  turns: NovaHistoryTurn[],
  keepRecent = 6
): { role: "user" | "assistant"; content: string }[] {
  const keep = Math.max(2, Math.min(keepRecent, 20));
  if (turns.length <= keep) {
    return turns.map((t) => ({ role: t.role, content: t.content }));
  }

  const older = turns.slice(0, -keep);
  const recent = turns.slice(-keep);
  const slots: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < older.length; i++) {
    const turn = older[i]!;
    if (turn.role !== "user") continue;
    const ask = turn.content.trim().replace(/\s+/g, " ").slice(0, 48);
    const next = older[i + 1];
    const toolLabel =
      next?.role === "assistant" ? slotLabelFromTools(next.toolsUsed ?? []) : null;
    const piece = toolLabel ? `“${ask}” → ${toolLabel}` : `“${ask}”`;
    const key = piece.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push(piece);
    if (slots.length >= 4) break;
  }

  const summary =
    slots.length > 0
      ? `Earlier in this chat (compressed): ${slots.join("; ")}.`
      : `Earlier in this chat: ${older.length} earlier turns compressed.`;

  return [
    { role: "assistant" as const, content: summary },
    ...recent.map((t) => ({ role: t.role, content: t.content })),
  ];
}

export async function ensureNovaConversation(
  userId: string,
  conversationId?: string | null
): Promise<string> {
  if (conversationId) {
    const existing = await prisma.novaConversation.findFirst({
      where: { id: conversationId, userId },
      select: { id: true },
    });
    if (existing) return existing.id;
  }
  const created = await prisma.novaConversation.create({
    data: { userId },
    select: { id: true },
  });
  return created.id;
}

export async function appendNovaConversationTurn(opts: {
  userId: string;
  conversationId?: string | null;
  userText: string;
  assistantText: string;
  toolsUsed?: string[];
  dialogState?: NovaDialogState | null;
}): Promise<string> {
  const sensitive = isNovaSensitiveTools(opts.toolsUsed);
  const conversationId = await ensureNovaConversation(opts.userId, opts.conversationId);
  const userContent = redactNovaMessageForStore(opts.userText, { sensitive });
  const assistantContent = redactNovaMessageForStore(opts.assistantText, { sensitive });

  const dialogPayload =
    opts.dialogState === undefined
      ? undefined
      : opts.dialogState === null
        ? emptyNovaDialogState({ conversationId, userId: opts.userId })
        : {
            ...opts.dialogState,
            conversationId,
            userId: opts.userId,
            updatedAt: new Date().toISOString(),
          };

  await prisma.$transaction([
    prisma.novaMessage.create({
      data: {
        conversationId,
        role: "user",
        content: userContent,
        sensitive,
      },
    }),
    prisma.novaMessage.create({
      data: {
        conversationId,
        role: "assistant",
        content: assistantContent,
        toolsUsed: opts.toolsUsed?.slice(0, 24) ?? undefined,
        sensitive,
      },
    }),
    prisma.novaConversation.update({
      where: { id: conversationId },
      data: {
        updatedAt: new Date(),
        title: userContent.slice(0, 80) || undefined,
        ...(dialogPayload !== undefined ? { dialogState: dialogPayload as object } : {}),
      },
    }),
  ]);

  return conversationId;
}

/** Load pending ClarifyAct / bound slots for a conversation (RBAC-scoped by userId). */
export async function loadNovaDialogState(
  userId: string,
  conversationId: string
): Promise<NovaDialogState | null> {
  const row = await prisma.novaConversation.findFirst({
    where: { id: conversationId, userId },
    select: { dialogState: true },
  });
  if (!row?.dialogState) return null;
  return parseNovaDialogState(row.dialogState);
}

export async function saveNovaDialogState(
  userId: string,
  conversationId: string,
  state: NovaDialogState | null
): Promise<void> {
  const existing = await prisma.novaConversation.findFirst({
    where: { id: conversationId, userId },
    select: { id: true },
  });
  if (!existing) return;
  const payload = state
    ? { ...state, conversationId, userId, updatedAt: new Date().toISOString() }
    : emptyNovaDialogState({ conversationId, userId });
  await prisma.novaConversation.update({
    where: { id: conversationId },
    data: { dialogState: payload as object },
  });
}

/** Best-effort purge: normal window + shorter window for sensitive messages. */
export async function purgeNovaConversationMemory(): Promise<void> {
  const normalCutoff = new Date(
    Date.now() - novaConversationRetentionDays() * 24 * 60 * 60 * 1000
  );
  const sensitiveCutoff = new Date(
    Date.now() - novaSensitiveMessageRetentionDays() * 24 * 60 * 60 * 1000
  );

  await prisma.novaMessage
    .deleteMany({
      where: {
        OR: [
          { createdAt: { lt: normalCutoff } },
          { sensitive: true, createdAt: { lt: sensitiveCutoff } },
        ],
      },
    })
    .catch(() => {});

  // Drop empty / stale conversations
  await prisma.novaConversation
    .deleteMany({
      where: {
        OR: [
          { updatedAt: { lt: normalCutoff } },
          { messages: { none: {} } },
        ],
      },
    })
    .catch(() => {});
}

/**
 * Load recent redacted turns for server-side history (NOVA-07).
 * When a conversationId has memory, prefer this over client-sent turns.
 * Long threads get a compressed slot summary for older turns.
 */
export async function loadNovaConversationHistory(
  userId: string,
  conversationId: string,
  limit = 8
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const keep = Math.min(Math.max(limit, 1), 20);
  const fetchTake = Math.min(keep * 3, 40);
  const rows = await prisma.novaMessage.findMany({
    where: { conversationId, conversation: { userId } },
    orderBy: { createdAt: "desc" },
    take: fetchTake,
    select: { role: true, content: true, toolsUsed: true },
  });
  const chronological = rows
    .reverse()
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({
      role: r.role as "user" | "assistant",
      content: r.content,
      toolsUsed: toolsFromJson(r.toolsUsed),
    }));

  return compressNovaHistoryWithSlotSummary(chronological, keep);
}
