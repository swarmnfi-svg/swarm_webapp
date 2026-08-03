/**
 * Finance skill — tally_status (extracted from nova-tools; behaviour identical).
 * Connection/sync status only — never invents TB or ledger balances.
 */
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/nova/prisma-readonly";
import { withFactProvenance } from "@/lib/nova/skills/provenance";
import { settlePromise } from "@/lib/nova/skills/settle";
import type { NovaSkillHandlerContext, NovaSkillHandlerResult } from "@/lib/nova/skills/skill-contract";
import type { NovaToolLink } from "@/lib/nova/core/tool-types";
import {
  buildSkillReportPack,
  resolveSkillReportIntent,
  reportCell,
  withSkillReportAttachment,
} from "@/lib/nova/reports/skill-report";

export async function runTallyStatus(
  _ctx: NovaSkillHandlerContext
): Promise<NovaSkillHandlerResult> {
  const { user, query, sampleLimit } = _ctx;
  const name = "tally_status";
  const links: NovaToolLink[] = [];

  if (!can(user, "tally.dashboard.view")) {
    return {
      fact: { tool: name, ok: false, denied: true, error: "Missing tally.dashboard.view" },
    };
  }

  const [connSettle, activeSettle, connectionRows, recentJobs] = await Promise.all([
    settlePromise(prisma.tallyConnection.count()),
    settlePromise(prisma.tallyConnection.count({ where: { active: true } })),
    settlePromise(
      prisma.tallyConnection.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: {
          name: true,
          active: true,
          lastSyncAt: true,
          lastSyncStatus: true,
          lastHeartbeatAt: true,
          syncDirection: true,
          mode: true,
        },
      })
    ),
    settlePromise(
      prisma.tallySyncJob.findMany({
        orderBy: { requestedAt: "desc" },
        take: 5,
        select: { id: true, status: true, direction: true, requestedAt: true, errorMessage: true },
      })
    ),
  ]);

  // Primary connection counts both failed → surface error, never invent 0 connections.
  if (!connSettle.ok && !activeSettle.ok) {
    return {
      fact: {
        tool: name,
        ok: false,
        error:
          "Tally connection lookup failed. Open /tally — do not treat as zero connections.",
      },
      links: [{ title: "Tally", href: "/tally" }],
    };
  }

  const connections = connSettle.ok ? connSettle.value : 0;
  const activeConnections = activeSettle.ok ? activeSettle.value : 0;
  const jobRows = recentJobs.ok && Array.isArray(recentJobs.value) ? recentJobs.value : [];
  const connRows =
    connectionRows.ok && Array.isArray(connectionRows.value) ? connectionRows.value : [];
  const related = [{ title: "Tally dashboard", href: "/tally" }];

  links.push({ title: "Tally", href: "/tally" });

  const data = withFactProvenance(
    {
      connectionCount: connSettle.ok ? connections : null,
      activeConnectionCount: activeSettle.ok ? activeConnections : null,
      connections: connRows.map((c) => ({
        name: c.name,
        active: c.active,
        mode: c.mode,
        syncDirection: c.syncDirection,
        lastSyncStatus: c.lastSyncStatus,
        lastSyncAt: c.lastSyncAt?.toISOString?.() ?? c.lastSyncAt ?? null,
        lastHeartbeatAt: c.lastHeartbeatAt?.toISOString?.() ?? c.lastHeartbeatAt ?? null,
      })),
      recentSyncJobs: jobRows.map((j) => ({
        status: j.status,
        direction: j.direction,
        requestedAt: j.requestedAt?.toISOString?.() ?? j.requestedAt,
        error: j.errorMessage,
      })),
      related,
      note:
        !connSettle.ok
          ? "Active connection count only (total count lookup failed). Open Tally for full sync status."
          : connections === 0
            ? "No Tally connections on file — open Tally to configure sync (NOVA does not invent ledger/TB figures)."
            : "Connection and recent sync status only — open Tally for full sync / mapping (no invented TB or ledger balances).",
    },
    { sources: ["tally_status"] }
  );

  const { reportMode, reportIntent } = resolveSkillReportIntent(query, sampleLimit);
  if (reportIntent) {
    const { attachment } = buildSkillReportPack({
      packId: "tally_summary_report",
      reportMode,
      title: "Tally connection status report",
      headline: `${connections} connection(s) · ${activeConnections} active · ${jobRows.length} recent sync job(s)`,
      period: {
        label: "point in time",
        grain: "latest",
        calendarKind: "point_in_time",
        source: "default",
      },
      metrics: [
        {
          metricId: "tally.connection_count",
          version: "1",
          certification: "draft",
          value: Number(connections),
          display: `${connections} connections`,
        },
        {
          metricId: "tally.active_connections",
          version: "1",
          certification: "draft",
          value: Number(activeConnections),
          display: `${activeConnections} active`,
        },
      ],
      charts: [
        {
          bindingId: "kpi_strip",
          metricIds: ["tally.connection_count"],
          title: "Connections active vs total",
          points: [
            { label: "Active", value: Number(activeConnections), unit: "count" },
            {
              label: "Inactive",
              value: Math.max(0, Number(connections) - Number(activeConnections)),
              unit: "count",
            },
          ],
        },
      ],
      tables: [
        {
          id: "tally_connections",
          title: "Connections",
          columns: ["Name", "Active", "Mode", "Last sync", "Status"],
          rows: connRows.map((c) => [
            reportCell(c.name),
            c.active ? "yes" : "no",
            reportCell(c.mode),
            reportCell(c.lastSyncAt?.toISOString?.()?.slice(0, 10) ?? c.lastSyncAt),
            reportCell(c.lastSyncStatus),
          ]),
        },
      ],
      facts: [{ tool: name, ok: true, data }],
      links,
      omittedNotes: [
        "Read-only connection/sync status — NOVA never invents TB or ledger balances.",
      ],
    });
    return {
      fact: {
        tool: name,
        ok: true,
        data: withSkillReportAttachment(data as Record<string, unknown>, attachment),
      },
      links,
    };
  }

  return {
    fact: {
      tool: name,
      ok: true,
      data,
    },
    links,
  };
}
