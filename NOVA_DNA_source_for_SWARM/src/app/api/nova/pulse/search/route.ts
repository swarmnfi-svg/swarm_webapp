import { NextResponse } from "next/server";
import { currentUser } from "@/auth";
import { can } from "@/lib/rbac";
import { parsePulseQueryHints, searchNovaPulseEvents } from "@/lib/nova-pulse/search";

/**
 * GET /api/nova/pulse/search?q=...&personUserId=...&limit=12
 * Read-only Pulse facts for the caller (RBAC re-checked).
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(user, "task.read.self") && !can(user, "documents.read") && !can(user, "task.admin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const personUserId = url.searchParams.get("personUserId") || undefined;
  const actorUserId = url.searchParams.get("actorUserId") || undefined;
  const limit = Number(url.searchParams.get("limit") || "12");
  const sinceRaw = url.searchParams.get("since");
  const untilRaw = url.searchParams.get("until");

  const hints = parsePulseQueryHints(q, {
    personUserId: personUserId ?? null,
    sessionUserId: user.id,
  });

  const textQuery = (hints.textHint ?? q).trim();
  const result = await searchNovaPulseEvents(user, {
    query: textQuery.length >= 2 ? textQuery : undefined,
    entityTypes: hints.entityTypes,
    actions: hints.actions,
    actorUserId: actorUserId ?? hints.actorUserId ?? undefined,
    relatedUserId: personUserId ?? hints.relatedUserId ?? undefined,
    since: sinceRaw ? new Date(sinceRaw) : null,
    until: untilRaw ? new Date(untilRaw) : null,
    limit: Number.isFinite(limit) ? limit : 12,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error ?? "Forbidden" },
      { status: result.denied ? 403 : 400 }
    );
  }

  return NextResponse.json({
    hits: result.hits,
    lookbackDays: result.lookbackDays,
    totalCandidates: result.totalCandidates,
  });
}
