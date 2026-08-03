import { NextResponse } from "next/server";
import { CLIENT_API_VERSION } from "@/lib/client-api/v1/types";
import { requireClientApiUser } from "@/lib/client-api/v1/auth";
import {
  clientApiPreflightResponse,
  withClientApiCors,
} from "@/lib/client-api/v1/cors";
import { clearNovaChatForMobileUser } from "@/lib/nova/mobile/clear-chat";

export const dynamic = "force-dynamic";

const METHODS = ["POST", "OPTIONS"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function OPTIONS(req: Request) {
  return clientApiPreflightResponse(req, METHODS);
}

/**
 * POST /api/client/v1/nova/chat/clear — reset DialogState for a conversation.
 * Does not delete conversation message rows (matches web clearNovaChatAction).
 */
export async function POST(req: Request) {
  const auth = await requireClientApiUser("ai.assistant.read", req, METHODS);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const conversationId =
    isRecord(body) && typeof body.conversationId === "string"
      ? body.conversationId
      : null;

  const result = await clearNovaChatForMobileUser(auth.user, conversationId);
  if (!result.ok) {
    return withClientApiCors(
      NextResponse.json(
        {
          ok: false,
          apiVersion: CLIENT_API_VERSION,
          error: result.error,
          code: "CLEAR_CHAT_FAILED",
        },
        { status: 400 }
      ),
      req,
      METHODS
    );
  }

  return withClientApiCors(
    NextResponse.json({
      ok: true,
      apiVersion: CLIENT_API_VERSION,
    }),
    req,
    METHODS
  );
}
