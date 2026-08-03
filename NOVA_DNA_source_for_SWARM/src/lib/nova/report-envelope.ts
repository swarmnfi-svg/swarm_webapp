/**
 * NOVA report security envelope + immutable snapshot metadata (NOVA plane only).
 * Downloads re-check RBAC; regenerate creates a new report id.
 */

import {
  NOVA_PACK_RESULT_SCHEMA_VERSION,
  NOVA_REPORT_ENVELOPE_SCHEMA_VERSION,
} from "@/lib/nova/invariants";
import type { NovaPackId, NovaPackResult, NovaPackWarning } from "@/lib/nova/pack-result";

export type NovaReportSensitivity = "standard" | "sensitive" | "restricted";

/**
 * Security + audit envelope on every saved report.
 * Stored in nova_system metadata; objects live under nova/ prefix.
 */
export type NovaReportSecurityEnvelope = {
  schemaVersion: typeof NOVA_REPORT_ENVELOPE_SCHEMA_VERSION;
  tenantId: string;
  ownerUserId: string;
  packId: NovaPackId;
  packVersion: string;
  /** NovaPackResult.schemaVersion at save time */
  packSchemaVersion: typeof NOVA_PACK_RESULT_SCHEMA_VERSION | number;
  /** metricId → contract version */
  metricVersions: Record<string, string>;
  sensitivity: NovaReportSensitivity;
  /** Permission keys checked when the pack ran (save-time audit; download re-checks current) */
  permissionsUsed: string[];
  dataAsOf: string;
  /** ISO expiry for retention */
  expiresAt: string;
  /** SHA-256 (hex) of canonical snapshot JSON body */
  checksum: string;
  /** Object storage keys under nova/reports/... */
  objectKeys: string[];
};

export type NovaReportSnapshotV1 = {
  envelope: NovaReportSecurityEnvelope;
  title: string;
  createdAt: string;
  /** Frozen pack result — answer artifact, not a ledger dump */
  pack: NovaPackResult;
  /** Narrative text as shown (already answer-guarded) */
  narrative: string;
  warnings: NovaPackWarning[];
  /** Immutable once saved; regenerate = new report row */
  immutable: true;
};

export function buildNovaReportSecurityEnvelope(
  input: Omit<NovaReportSecurityEnvelope, "schemaVersion"> & {
    schemaVersion?: number;
  }
): NovaReportSecurityEnvelope {
  return {
    ...input,
    schemaVersion: NOVA_REPORT_ENVELOPE_SCHEMA_VERSION,
    packSchemaVersion: input.packSchemaVersion ?? NOVA_PACK_RESULT_SCHEMA_VERSION,
    metricVersions: { ...input.metricVersions },
    permissionsUsed: [...input.permissionsUsed],
    objectKeys: [...input.objectKeys],
  };
}

/** Default retention: 90 days (sensitive may shorten at report-plane ship). */
export function defaultNovaReportExpiresAt(
  from = new Date(),
  retentionDays = 90
): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + retentionDays);
  return d.toISOString();
}

export function assertNovaReportEnvelope(
  envelope: NovaReportSecurityEnvelope
): string[] {
  const errors: string[] = [];
  if (!envelope.tenantId) errors.push("tenantId required");
  if (!envelope.ownerUserId) errors.push("ownerUserId required");
  if (!envelope.packVersion) errors.push("packVersion required");
  if (!envelope.dataAsOf) errors.push("dataAsOf required");
  if (!envelope.expiresAt) errors.push("expiresAt required");
  if (!envelope.checksum) errors.push("checksum required");
  if (!Array.isArray(envelope.objectKeys)) errors.push("objectKeys required");
  if (!Array.isArray(envelope.permissionsUsed)) {
    errors.push("permissionsUsed required");
  }
  return errors;
}
