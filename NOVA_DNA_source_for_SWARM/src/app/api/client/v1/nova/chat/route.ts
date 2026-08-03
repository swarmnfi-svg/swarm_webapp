import { NextResponse } from "next/server";
import { CLIENT_API_VERSION } from "@/lib/client-api/v1/types";
import { requireClientApiUser } from "@/lib/client-api/v1/auth";
import {
  clientApiPreflightResponse,
  withClientApiCors,
} from "@/lib/client-api/v1/cors";
import { askNovaForMobileUser } from "@/lib/nova/mobile/chat-service";
import type { NovaChatTurn } from "@/lib/ai/nova";

export const dynamic = "force-dynamic";

const METHODS = ["POST", "OPTIONS"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function OPTIONS(req: Request) {
  return clientApiPreflightResponse(req, METHODS);
}

/**
 * POST /api/client/v1/nova/chat — send a message and receive a NOVA reply.
 */
export async function POST(req: Request) {
  const auth = await requireClientApiUser("ai.assistant.read", req, METHODS);
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  if (!isRecord(body) || typeof body.message !== "string") {
    return withClientApiCors(
      NextResponse.json(
        {
          ok: false,
          error: "INVALID_REQUEST",
          code: "INVALID_REQUEST",
          message: "Expected { message: string, history?, conversationId? }.",
        },
        { status: 400 }
      ),
      req,
      METHODS
    );
  }

  const historyRaw = Array.isArray(body.history) ? body.history : [];
  const history = historyRaw.filter(
    (h): h is NovaChatTurn =>
      !!h &&
      typeof h === "object" &&
      (h as NovaChatTurn).role != null &&
      ((h as NovaChatTurn).role === "user" || (h as NovaChatTurn).role === "assistant") &&
      typeof (h as NovaChatTurn).content === "string"
  );

  const result = await askNovaForMobileUser(auth.user, {
    message: body.message,
    history,
    conversationId:
      typeof body.conversationId === "string" ? body.conversationId : null,
  });

  if (!result.ok) {
    const status =
      result.errorKind === "rate_limited"
        ? 429
        : result.errorKind === "unavailable"
          ? 429
          : 400;
    return withClientApiCors(
      NextResponse.json(
        {
          ok: false,
          apiVersion: CLIENT_API_VERSION,
          error: result.error,
          errorKind: result.errorKind,
          ...(result.retryAfterMs ? { retryAfterMs: result.retryAfterMs } : {}),
        },
        { status }
      ),
      req,
      METHODS
    );
  }

  const pack = result.pack ?? null;
  const canSaveReport = Boolean(pack?.packId && pack?.schemaVersion);

  return withClientApiCors(
    NextResponse.json({
      ok: true,
      apiVersion: CLIENT_API_VERSION,
      answer: result.answer,
      links: result.links,
      toolsUsed: result.toolsUsed,
      periodLabel: result.periodLabel ?? null,
      conversationId: result.conversationId,
      provenance: result.provenance,
      pack,
      canSaveReport,
      options: result.options ?? [],
      clarifyKind: result.clarifyKind ?? null,
    }),
    req,
    METHODS
  );
}
