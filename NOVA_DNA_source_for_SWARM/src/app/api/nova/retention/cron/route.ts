import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { novaQueryLogRetentionDays } from "@/lib/ai/nova-quota";
import { purgeNovaConversationMemory } from "@/lib/nova/memory";
import { purgeExpiredNovaReports } from "@/lib/nova/reports/retention";
import { purgeExpiredNovaPulseEvents } from "@/lib/nova-pulse/retention";

/**
 * POST /api/nova/retention/cron
 *
 * Purges NOVA-plane retention only (Pulse events, reports, chat memory, query logs).
 * Never deletes ERP business tables.
 *
 * Auth: x-backup-cron-secret / x-nova-reports-cron-secret, or HMAC.
 */
function cronSecret(): string | undefined {
  return (
    process.env.NOVA_REPORTS_CRON_SECRET?.trim() ||
    process.env.BACKUP_CRON_SECRET?.trim() ||
    undefined
  );
}

export async function POST(req: Request) {
  const secret = cronSecret();
  if (
    !secret ||
    !authorizeCronRequest({
      req,
      secret,
      secretHeaders: ["x-nova-reports-cron-secret", "x-backup-cron-secret"],
    })
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pulse = await purgeExpiredNovaPulseEvents({ limit: 3000 });
    const reports = await purgeExpiredNovaReports({ limit: 200 });
    await purgeNovaConversationMemory();

    const queryLogDays = novaQueryLogRetentionDays();
    const queryCutoff = new Date(Date.now() - queryLogDays * 24 * 60 * 60 * 1000);
    const queryLogs = await prisma.aiAssistantQueryLog.deleteMany({
      where: { createdAt: { lt: queryCutoff } },
    });

    return NextResponse.json({
      ok: true,
      pulse,
      reports,
      queryLogsDeleted: queryLogs.count,
      queryLogRetentionDays: queryLogDays,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "retention failed";
    console.error("[nova-retention-cron]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
