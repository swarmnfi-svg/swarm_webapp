import { NextResponse } from "next/server";
import { CLIENT_API_VERSION } from "@/lib/client-api/v1/types";
import { requireClientApiUser } from "@/lib/client-api/v1/auth";
import {
  clientApiPreflightResponse,
  withClientApiCors,
} from "@/lib/client-api/v1/cors";
import { listNovaMobileNotifications } from "@/lib/nova/mobile/threads-service";

export const dynamic = "force-dynamic";

const METHODS = ["GET", "OPTIONS"] as const;

export async function OPTIONS(req: Request) {
  return clientApiPreflightResponse(req, METHODS);
}

/**
 * GET /api/client/v1/nova/notifications — Updates channel from Notification table.
 */
export async function GET(req: Request) {
  const auth = await requireClientApiUser("ai.assistant.read", req, METHODS);
  if (auth.error) return auth.error;

  const result = await listNovaMobileNotifications(auth.user);
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
      messages: result.messages,
    }),
    req,
    METHODS
  );
}
