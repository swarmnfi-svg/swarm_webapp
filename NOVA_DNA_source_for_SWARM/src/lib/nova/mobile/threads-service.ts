import type { ClientApiUser } from "@/lib/client-api/v1/auth";
import type { SessionUser } from "@/auth";
import { can } from "@/lib/rbac";
import { canAccessTasksModule } from "@/lib/tasks/access";
import { getPlatformSettings } from "@/lib/platform-settings";
import { getNotificationFeed } from "@/lib/notification-feed";
import {
  countUnreadNotifications,
  listSyncedNotifications,
  syncNotificationsForUser,
} from "@/lib/notification-sync";
import { prisma } from "@/lib/prisma";
import type { NovaChatThreadRow, NovaSystemMessage } from "@/lib/nova-chat/types";

export type NovaMobileThreadId =
  | "primary"
  | "tasks"
  | "approvals"
  | "payments"
  | "updates";

type SyncedNotification = Awaited<ReturnType<typeof listSyncedNotifications>>[number];

export type NovaMobileThreadMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  at: string;
  href?: string;
  read?: boolean;
  title?: string;
  /** Human status label when known (e.g. SUBMITTED → Submitted). */
  status?: string;
  /** Formatted amount when present in the alert detail. */
  amountLabel?: string;
  /** Secondary line: vendor / project / ref. */
  meta?: string;
  priority?: "high" | "normal";
  sourceModule?: string;
};

function channelForModule(sourceModule?: string): Exclude<NovaMobileThreadId, "primary"> {
  if (sourceModule === "TASK") return "tasks";
  if (sourceModule === "APPROVAL") return "approvals";
  if (sourceModule === "PAYMENT_REQUEST") return "payments";
  return "updates";
}

function filterByChannel(
  items: SyncedNotification[],
  channel: Exclude<NovaMobileThreadId, "primary">
): SyncedNotification[] {
  return items.filter((item) => channelForModule(item.sourceModule) === channel);
}

/** Newest first — channel feeds always show latest on top. */
function sortNewestFirst(items: SyncedNotification[]): SyncedNotification[] {
  return [...items].sort((a, b) => b.at.getTime() - a.at.getTime());
}

function channelSubtitle(items: SyncedNotification[], emptyLabel: string): string {
  const ordered = sortNewestFirst(items);
  const unread = ordered.filter((i) => !i.read);
  const latest = unread[0] ?? ordered[0];
  if (latest) {
    const bits = [latest.title];
    if (latest.detail) bits.push(latest.detail);
    return bits.join(" — ").slice(0, 120);
  }
  return emptyLabel;
}

function channelUnread(items: SyncedNotification[]): number {
  return items.filter((i) => !i.read).length;
}

function extractAmountLabel(detail?: string): string | undefined {
  if (!detail) return undefined;
  const match = detail.match(/₹[\d,]+(?:\.\d+)?/);
  return match?.[0];
}

function extractStatusFromTitle(title: string): string | undefined {
  // e.g. "Payment MANAGER VERIFIED" / "Approval pending"
  const payment = /^Payment\s+(.+)$/i.exec(title);
  if (payment) return payment[1].trim();
  return undefined;
}

function toChannelMessage(item: SyncedNotification): NovaMobileThreadMessage {
  const detail = item.detail?.trim() || undefined;
  const amountLabel = extractAmountLabel(detail);
  const status = extractStatusFromTitle(item.title);
  const meta = detail;
  const body =
    detail && detail !== item.title
      ? detail
      : item.title;

  return {
    id: item.id,
    role: "system",
    content: body,
    at: item.at.toISOString(),
    href: item.href,
    read: item.read,
    title: item.title,
    status,
    amountLabel,
    meta,
    priority: item.priority,
    sourceModule: item.sourceModule,
  };
}

export async function listNovaMobileThreads(user: ClientApiUser): Promise<
  | { ok: true; threads: NovaChatThreadRow[]; totalUnread: number }
  | { ok: false; error: string; code?: string }
> {
  if (!can(user, "ai.assistant.read")) {
    return {
      ok: false,
      error: "NOVA Chat is not enabled for your account.",
      code: "FORBIDDEN",
    };
  }

  const settings = await getPlatformSettings();
  if (!settings.aiAssistantEnabled) {
    return {
      ok: false,
      error: "NOVA AI is turned off in System Tools.",
      code: "AI_ASSISTANT_DISABLED",
    };
  }

  const { items } = await getNotificationFeed(user as SessionUser);
  await syncNotificationsForUser(user.id, items);
  const synced = await listSyncedNotifications(user.id);
  const totalUnread = await countUnreadNotifications(user.id);

  const taskItems = filterByChannel(synced, "tasks");
  const approvalItems = filterByChannel(synced, "approvals");
  const paymentItems = filterByChannel(synced, "payments");
  const updateItems = filterByChannel(synced, "updates");

  const threads: NovaChatThreadRow[] = [
    {
      id: "primary",
      kind: "primary",
      title: "NOVA",
      subtitle: "Ask anything about your work",
      href: "/nova/chat",
      unread: 0,
      pinned: true,
    },
  ];

  const showTasks = canAccessTasksModule(user);
  if (showTasks) {
    threads.push({
      id: "tasks",
      kind: "tasks",
      title: "Tasks",
      subtitle: channelSubtitle(taskItems, "No task alerts — you're caught up"),
      href: "/nova/threads/tasks",
      unread: channelUnread(taskItems),
    });
  }

  const showApprovals =
    can(user, "approval.approve") ||
    can(user, "approval.read.team") ||
    can(user, "approval.read.all");
  if (showApprovals) {
    threads.push({
      id: "approvals",
      kind: "approvals",
      title: "Approvals",
      subtitle: channelSubtitle(approvalItems, "No approvals waiting on you"),
      href: "/nova/threads/approvals",
      unread: channelUnread(approvalItems),
    });
  }

  // Same RBAC gate as the payment-request notification feed.
  const showPayments = can(user, "paymentrequest.read");
  if (showPayments) {
    threads.push({
      id: "payments",
      kind: "payments",
      title: "Payments",
      subtitle: channelSubtitle(paymentItems, "No payment requests waiting"),
      href: "/nova/threads/payments",
      unread: channelUnread(paymentItems),
    });
  }

  threads.push({
    id: "updates",
    kind: "updates",
    title: "Updates",
    subtitle: channelSubtitle(updateItems, "You're caught up — no new alerts"),
    href: "/nova/updates",
    unread: channelUnread(updateItems),
  });

  return { ok: true, threads, totalUnread };
}

export async function listNovaMobileThreadMessages(
  user: ClientApiUser,
  threadId: NovaMobileThreadId,
  opts?: { cursor?: string | null; limit?: number }
): Promise<
  | {
      ok: true;
      threadId: NovaMobileThreadId;
      messages: NovaMobileThreadMessage[];
      conversationId?: string | null;
      nextCursor?: string | null;
    }
  | { ok: false; error: string; code?: string }
> {
  if (!can(user, "ai.assistant.read")) {
    return { ok: false, error: "NOVA Chat is not enabled for your account.", code: "FORBIDDEN" };
  }

  const settings = await getPlatformSettings();
  if (!settings.aiAssistantEnabled) {
    return { ok: false, error: "NOVA AI is turned off in System Tools.", code: "AI_ASSISTANT_DISABLED" };
  }

  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);

  if (
    threadId === "tasks" ||
    threadId === "approvals" ||
    threadId === "payments" ||
    threadId === "updates"
  ) {
    if (threadId === "tasks" && !canAccessTasksModule(user)) {
      return { ok: false, error: "Tasks are not available for your account.", code: "FORBIDDEN" };
    }
    if (
      threadId === "approvals" &&
      !(
        can(user, "approval.approve") ||
        can(user, "approval.read.team") ||
        can(user, "approval.read.all")
      )
    ) {
      return { ok: false, error: "Approvals are not available for your account.", code: "FORBIDDEN" };
    }
    if (threadId === "payments" && !can(user, "paymentrequest.read")) {
      return {
        ok: false,
        error: "Payment requests are not available for your account.",
        code: "FORBIDDEN",
      };
    }

    const { items } = await getNotificationFeed(user as SessionUser);
    await syncNotificationsForUser(user.id, items);
    const resolved = await listSyncedNotifications(user.id);
    const channelItems = sortNewestFirst(filterByChannel(resolved, threadId));
    const messages = channelItems.map(toChannelMessage).slice(0, limit);
    return { ok: true, threadId, messages, nextCursor: null };
  }

  const conversation = await prisma.novaConversation.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });

  if (!conversation) {
    return { ok: true, threadId, messages: [], conversationId: null, nextCursor: null };
  }

  const cursorDate = opts?.cursor ? new Date(opts.cursor) : null;
  const rows = await prisma.novaMessage.findMany({
    where: {
      conversationId: conversation.id,
      ...(cursorDate && !Number.isNaN(cursorDate.getTime())
        ? { createdAt: { lt: cursorDate } }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: { id: true, role: true, content: true, createdAt: true },
  });

  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).reverse();
  const nextCursor = hasMore ? page[0]?.createdAt.toISOString() ?? null : null;

  return {
    ok: true,
    threadId,
    conversationId: conversation.id,
    messages: page.map((row) => ({
      id: row.id,
      role: row.role === "assistant" ? "assistant" : "user",
      content: row.content,
      at: row.createdAt.toISOString(),
    })),
    nextCursor,
  };
}

export async function listNovaMobileNotifications(user: ClientApiUser): Promise<
  | { ok: true; messages: NovaSystemMessage[] }
  | { ok: false; error: string; code?: string }
> {
  if (!can(user, "ai.assistant.read")) {
    return { ok: false, error: "NOVA Chat is not enabled for your account.", code: "FORBIDDEN" };
  }

  const { items } = await getNotificationFeed(user as SessionUser);
  await syncNotificationsForUser(user.id, items);
  const synced = await listSyncedNotifications(user.id);

  return {
    ok: true,
    messages: synced.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      href: item.href,
      read: item.read,
      at: item.at.toISOString(),
      priority: item.priority,
      sourceModule: item.sourceModule,
    })),
  };
}
