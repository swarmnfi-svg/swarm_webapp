/**
 * Governed NOVA entity aliases — drafts never bind the resolver until confirmed.
 */
import { prisma } from "@/lib/prisma";
import type { NovaAliasEntityType, NovaAliasSource, NovaAliasStatus } from "@prisma/client";

export type NovaAliasHit = {
  id: string;
  alias: string;
  entityType: "customer" | "vendor" | "project" | "employee";
  targetId: string;
  targetCode: string | null;
  targetName: string | null;
  status: NovaAliasStatus;
  source: NovaAliasSource;
};

const TYPE_MAP: Record<NovaAliasEntityType, NovaAliasHit["entityType"]> = {
  CUSTOMER: "customer",
  VENDOR: "vendor",
  PROJECT: "project",
  EMPLOYEE: "employee",
};

const TYPE_TO_PRISMA: Record<NovaAliasHit["entityType"], NovaAliasEntityType> = {
  customer: "CUSTOMER",
  vendor: "VENDOR",
  project: "PROJECT",
  employee: "EMPLOYEE",
};

function normAlias(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Seed aliases used in tests / Gate A (confirmed). Not auto-written to DB. */
export const NOVA_SEED_CONFIRMED_ALIASES: ReadonlyArray<{
  alias: string;
  entityType: NovaAliasHit["entityType"];
  targetId: string;
  targetCode?: string;
  targetName?: string;
}> = [
  {
    alias: "tata plant",
    entityType: "project",
    targetId: "seed-project-tata-plant",
    targetCode: "PRJ-TATA",
    targetName: "Tata Plant CBG",
  },
  {
    alias: "miura",
    entityType: "customer",
    targetId: "seed-customer-miura",
    targetCode: "CUS-MIURA",
    targetName: "Miura Energy",
  },
];

export function matchSeedConfirmedAlias(hint: string): NovaAliasHit | null {
  // Seed aliases bind resolve only in tests / explicit opt-in — never production.
  const allowSeed =
    process.env.VITEST === "true" ||
    process.env.NODE_ENV === "test" ||
    process.env.NOVA_SEED_ALIASES === "1";
  if (!allowSeed) return null;
  const n = normAlias(hint);
  const hit = NOVA_SEED_CONFIRMED_ALIASES.find((a) => normAlias(a.alias) === n);
  if (!hit) return null;
  return {
    id: `seed:${hit.alias}`,
    alias: hit.alias,
    entityType: hit.entityType,
    targetId: hit.targetId,
    targetCode: hit.targetCode ?? null,
    targetName: hit.targetName ?? null,
    status: "CONFIRMED",
    source: "SEED",
  };
}

/** Look up CONFIRMED aliases only — drafts never resolve. */
export async function findConfirmedNovaAliases(
  hint: string,
  opts?: { companyId?: string | null; entityTypes?: NovaAliasHit["entityType"][] }
): Promise<NovaAliasHit[]> {
  const n = normAlias(hint);
  if (n.length < 2) return [];

  const seed = matchSeedConfirmedAlias(hint);
  const fromSeed = seed ? [seed] : [];

  try {
    const rows = await prisma.novaEntityAlias.findMany({
      where: {
        status: "CONFIRMED",
        alias: { equals: n, mode: "insensitive" },
        ...(opts?.companyId ? { OR: [{ companyId: opts.companyId }, { companyId: null }] } : {}),
        ...(opts?.entityTypes?.length
          ? { entityType: { in: opts.entityTypes.map((t) => TYPE_TO_PRISMA[t]) } }
          : {}),
      },
      take: 8,
    });
    const fromDb: NovaAliasHit[] = rows.map((r) => ({
      id: r.id,
      alias: r.alias,
      entityType: TYPE_MAP[r.entityType],
      targetId: r.targetId,
      targetCode: r.targetCode,
      targetName: r.targetName,
      status: r.status,
      source: r.source,
    }));
    // Prefer DB over seed when both present for same target
    const seen = new Set(fromDb.map((h) => `${h.entityType}:${h.targetId}`));
    return [...fromDb, ...fromSeed.filter((s) => !seen.has(`${s.entityType}:${s.targetId}`))];
  } catch {
    // Migration not applied yet — seed path still works for Gate A tests.
    return fromSeed;
  }
}

export type NovaAliasDraftInput = {
  alias: string;
  entityType: NovaAliasHit["entityType"];
  targetId: string;
  targetCode?: string | null;
  targetName?: string | null;
  companyId?: string | null;
  createdBy?: string | null;
  note?: string | null;
  source?: NovaAliasSource;
};

/** Create a DRAFT alias — does not bind resolver until confirmNovaAlias. */
export async function draftNovaEntityAlias(input: NovaAliasDraftInput) {
  const alias = normAlias(input.alias);
  if (alias.length < 2) throw new Error("Alias too short");
  return prisma.novaEntityAlias.create({
    data: {
      alias,
      entityType: TYPE_TO_PRISMA[input.entityType],
      targetId: input.targetId,
      targetCode: input.targetCode ?? null,
      targetName: input.targetName ?? null,
      companyId: input.companyId ?? null,
      createdBy: input.createdBy ?? null,
      note: input.note ?? null,
      source: input.source ?? "UNMATCHED_DRAFT",
      status: "DRAFT",
    },
  });
}

/** List DRAFT aliases for ops review (never bind resolve). */
export async function listDraftNovaAliases(take = 50) {
  return prisma.novaEntityAlias.findMany({
    where: { status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    take: Math.min(200, Math.max(take, 1)),
  });
}

/**
 * Verify targetId exists in ERP for the alias entity type.
 * Never invent IDs — returns null when the row is missing.
 */
export async function resolveNovaAliasTarget(opts: {
  entityType: NovaAliasHit["entityType"];
  targetId: string;
}): Promise<{ targetId: string; targetCode: string | null; targetName: string | null } | null> {
  const id = opts.targetId.trim();
  if (!id || id.startsWith("seed-")) return null;

  if (opts.entityType === "customer") {
    const row = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, customerId: true, customerName: true },
    });
    if (!row) return null;
    return { targetId: row.id, targetCode: row.customerId ?? null, targetName: row.customerName };
  }
  if (opts.entityType === "vendor") {
    const row = await prisma.vendor.findUnique({
      where: { id },
      select: { id: true, vendorId: true, vendorName: true },
    });
    if (!row) return null;
    return { targetId: row.id, targetCode: row.vendorId ?? null, targetName: row.vendorName };
  }
  if (opts.entityType === "project") {
    const row = await prisma.project.findUnique({
      where: { id },
      select: { id: true, projectId: true, projectName: true },
    });
    if (!row) return null;
    return { targetId: row.id, targetCode: row.projectId ?? null, targetName: row.projectName };
  }
  const row = await prisma.staffProfile.findUnique({
    where: { id },
    select: { id: true, staffCode: true, fullName: true },
  });
  if (!row) return null;
  return { targetId: row.id, targetCode: row.staffCode ?? null, targetName: row.fullName };
}

/** Ops confirm — only CONFIRMED rows are live for resolve. */
export async function confirmNovaAlias(id: string, confirmedBy: string) {
  return prisma.novaEntityAlias.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedBy,
      confirmedAt: new Date(),
    },
  });
}

/**
 * Confirm only after the target still exists in ERP.
 * Refuses fictional/seed ids and missing rows — ops must look up real ids.
 */
export async function confirmNovaAliasWithTargetCheck(id: string, confirmedBy: string) {
  const row = await prisma.novaEntityAlias.findUnique({ where: { id } });
  if (!row) throw new Error("Alias draft not found");
  if (row.status !== "DRAFT") throw new Error("Only DRAFT aliases can be confirmed");

  const entityType = TYPE_MAP[row.entityType];
  const target = await resolveNovaAliasTarget({ entityType, targetId: row.targetId });
  if (!target) {
    throw new Error(
      `Target ${entityType} id “${row.targetId}” not found in ERP — look up a real id before confirm.`
    );
  }

  return prisma.novaEntityAlias.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedBy,
      confirmedAt: new Date(),
      targetCode: target.targetCode ?? row.targetCode,
      targetName: target.targetName ?? row.targetName,
    },
  });
}

/**
 * Create DRAFT only when targetId exists. Never invents parties.
 * Returns null when the ERP target is missing.
 */
export async function draftNovaEntityAliasIfTargetExists(input: NovaAliasDraftInput) {
  const target = await resolveNovaAliasTarget({
    entityType: input.entityType,
    targetId: input.targetId,
  });
  if (!target) return null;
  return draftNovaEntityAlias({
    ...input,
    targetId: target.targetId,
    targetCode: input.targetCode ?? target.targetCode,
    targetName: input.targetName ?? target.targetName,
  });
}

export async function rejectNovaAlias(id: string, rejectedBy: string) {
  return prisma.novaEntityAlias.update({
    where: { id },
    data: {
      status: "REJECTED",
      confirmedBy: rejectedBy,
      confirmedAt: new Date(),
    },
  });
}

/** True when a draft must not affect live resolve. */
export function novaAliasIsLive(status: NovaAliasStatus): boolean {
  return status === "CONFIRMED";
}
