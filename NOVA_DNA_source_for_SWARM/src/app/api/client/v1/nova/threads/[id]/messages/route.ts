import { NextResponse } from "next/server";
import { CLIENT_API_VERSION } from "@/lib/client-api/v1/types";
import { requireClientApiUser } from "@/lib/client-api/v1/auth";
import {
  clientApiPreflightResponse,
  withClientApiCors,
} from "@/lib/client-api/v1/cors";
import {
  listNovaMobileThreadMessages,
  type NovaMobileThreadId,
} from "@/lib/nova/mobile/threads-service";

export const dynamic = "force-dynamic";

const METHODS = ["GET", "OPTIONS"] as const;
const VALID_THREAD_IDS = new Set<NovaMobileThreadId>([
  "primary",
  "tasks",
  "approvals",
  "payments",
  "updates",
]);

export async function OPTIONS(req: Request) {
  return clientApiPreflightResponse(req, METHODS);
}

/**
 * GET /api/client/v1/nova/threads/[id]/messages — paginated thread messages.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireClientApiUser("ai.assistant.read", req, METHODS);
  if (auth.error) return auth.error;

  const threadId = params.id as NovaMobileThreadId;
  if (!VALID_THREAD_IDS.has(threadId)) {
    return withClientApiCors(
      NextResponse.json(
        {
          ok: false,
          apiVersion: CLIENT_API_VERSION,
          error: "INVALID_THREAD",
          code: "INVALID_THREAD",
          message: "Thread id must be primary, tasks, approvals, payments, or updates.",
        },
        { status: 404 }
      ),
      req,
      METHODS
    );
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  const result = await listNovaMobileThreadMessages(auth.user, threadId, {
    cursor,
    limit: Number.isFinite(limit) ? limit : undefined,
  });

  if (!result.ok) {
    return withClientApiCors(
      NextResponse.json(
        {
          ok: false,
          apiVersion: CLIENT_API_VERSION,
          error: result.error,
          code: result.code,
        },
        { status: 403 }
      ),
      req,
      METHODS
    );
  }

  return withClientApiCors(
    NextResponse.json({
      ok: true,
      apiVersion: CLIENT_API_VERSION,
      threadId: result.threadId,
      conversationId: result.conversationId ?? null,
      messages: result.messages,
      nextCursor: result.nextCursor ?? null,
    }),
    req,
    METHODS
  );
}
