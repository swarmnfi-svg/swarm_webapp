/**
 * Sprint 4 — NOVA_READONLY_DATABASE_URL cutover checklist + Prisma client usage map.
 *
 * Skills MUST import `@/lib/nova/prisma-readonly` (never `@/lib/prisma`).
 * NOVA plane writes (conversations, dialogState, aliases, reports) stay on `@/lib/prisma`.
 *
 * Merge gate: Sprint 3 report plane live — see SPRINT4_METRICS_HANDOFF.md.
 */

import { NOVA_READONLY_DATABASE_URL_ENV } from "@/lib/nova/invariants";

export type NovaPrismaClientLane = "skill_readonly" | "nova_plane_write" | "test_mock";

export type NovaPrismaUsageEntry = {
  path: string;
  lane: NovaPrismaClientLane;
  note: string;
};

/**
 * Authoritative map for Sprint 4 cutover review.
 * Architectural CI already forbids skills importing `@/lib/prisma`;
 * this list is the human + eval checklist.
 */
export const NOVA_PRISMA_USAGE_MAP: readonly NovaPrismaUsageEntry[] = [
  // --- Skill reads (must use prisma-readonly) ---
  { path: "src/lib/nova/skills/finance/*", lane: "skill_readonly", note: "All finance catalog skills" },
  { path: "src/lib/nova/skills/hr/*", lane: "skill_readonly", note: "All HR catalog skills" },
  { path: "src/lib/nova/skills/ops/*", lane: "skill_readonly", note: "All ops catalog skills" },
  {
    path: "src/lib/nova/skills/system/documents-search.ts",
    lane: "skill_readonly",
    note: "Document search reads",
  },
  {
    path: "src/lib/nova/skills/system/documents-open.ts",
    lane: "skill_readonly",
    note: "Document open reads",
  },
  {
    path: "src/lib/nova/skills/system/notifications-open.ts",
    lane: "skill_readonly",
    note: "Notification reads",
  },
  {
    path: "src/lib/nova/skills/system/settings-open.ts",
    lane: "skill_readonly",
    note: "Settings surface reads",
  },
  {
    path: "src/lib/nova/skills/system/vendor-bank-open.ts",
    lane: "skill_readonly",
    note: "Vendor bank reads",
  },
  // --- NOVA plane writes (app DATABASE_URL / @/lib/prisma) ---
  {
    path: "src/lib/nova/memory.ts",
    lane: "nova_plane_write",
    note: "Conversations / messages",
  },
  {
    path: "src/lib/nova/semantic/aliases.ts",
    lane: "nova_plane_write",
    note: "NovaEntityAlias CRUD",
  },
  {
    path: "src/lib/nova/reports/report-service.ts",
    lane: "nova_plane_write",
    note: "NovaReport save / regenerate metadata",
  },
  // --- Tests ---
  {
    path: "src/lib/nova/dialog-state.test.ts",
    lane: "test_mock",
    note: "Mocks @/lib/prisma for dialog persistence",
  },
  {
    path: "src/lib/nova/semantic/semantic.test.ts",
    lane: "test_mock",
    note: "Mocks @/lib/prisma for alias resolve",
  },
  {
    path: "src/lib/nova/skills/**/*.test.ts",
    lane: "test_mock",
    note: "Mocks @/lib/nova/prisma-readonly",
  },
] as const;

export type NovaReadonlyCutoverStep = {
  id: string;
  title: string;
  detail: string;
  /** When true, blocking for production cutover */
  required: boolean;
};

/** Ordered cutover checklist — implementer + DBA. */
export const NOVA_READONLY_CUTOVER_CHECKLIST: readonly NovaReadonlyCutoverStep[] = [
  {
    id: "gate_sprint3",
    title: "Confirm Sprint 3 report plane is live",
    detail:
      "Deployer health-match: save Month NovaPackResult → download ACL re-check → regenerate = new id. Do not merge Sprint 4 until this is green.",
    required: true,
  },
  {
    id: "dba_role",
    title: "Create Postgres role nova_readonly (SELECT-only)",
    detail:
      "Apply scripts/nova-readonly-role-scaffold.sql (reviewed). GRANT SELECT on operational tables; app role retains NOVA plane writes.",
    required: true,
  },
  {
    id: "env_url",
    title: `Set ${NOVA_READONLY_DATABASE_URL_ENV}`,
    detail:
      "Railway / prod: postgresql://nova_readonly:…@host:5432/db. Local/CI may omit and fall back to DATABASE_URL until require flag.",
    required: true,
  },
  {
    id: "skills_import",
    title: "Verify skills import prisma-readonly only",
    detail:
      "CI: nova-architecture.ci.test.ts — zero skill files import @/lib/prisma. Usage map above must stay accurate.",
    required: true,
  },
  {
    id: "smoke_reads",
    title: "Smoke skill reads under readonly role",
    detail:
      "Month pack + collection skills succeed; physical write/DDL deny via `npm run smoke:nova-readonly` (NOVA_READONLY_DATABASE_URL only) + grant-drift SQL in scripts/nova-readonly-role-smoke.sql / NOVA_OPS_CUTOVER.md §4.6.",
    required: true,
  },
  {
    id: "plane_writes",
    title: "Confirm NOVA plane writes still use app role",
    detail:
      "Conversations, aliases, NovaReport persist via @/lib/prisma (DATABASE_URL) — not the readonly client.",
    required: true,
  },
  {
    id: "require_flag",
    title: "Optional: NOVA_READONLY_REQUIRE=1 in production",
    detail:
      "Fails boot if dedicated URL missing. Enable after smoke; keep off in local/CI unless dedicated DB available.",
    required: false,
  },
  {
    id: "metrics_badges",
    title: "Surface certified metric badges from registry",
    detail:
      "Month pack metrics show certification + version from NOVA_CERTIFIED_MONTH_BINDINGS; Project/Collection remain draft until steward pass.",
    required: false,
  },
] as const;

export function listReadonlyCutoverSteps(): readonly NovaReadonlyCutoverStep[] {
  return NOVA_READONLY_CUTOVER_CHECKLIST;
}

export function listPrismaUsageMap(): readonly NovaPrismaUsageEntry[] {
  return NOVA_PRISMA_USAGE_MAP;
}

export function assertReadonlyCutoverChecklistShape(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const step of NOVA_READONLY_CUTOVER_CHECKLIST) {
    if (!step.id || !step.title || !step.detail) {
      errors.push(`Cutover step incomplete: ${step.id || "(no id)"}`);
    }
    if (ids.has(step.id)) errors.push(`Duplicate cutover step id: ${step.id}`);
    ids.add(step.id);
  }
  if (!ids.has("gate_sprint3")) {
    errors.push("Cutover checklist missing gate_sprint3");
  }
  return errors;
}
