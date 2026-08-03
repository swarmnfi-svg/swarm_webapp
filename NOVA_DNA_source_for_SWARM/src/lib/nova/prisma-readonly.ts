/**
 * Dedicated Prisma client for NOVA skill READS.
 *
 * Sprint 0 scaffold: prefers NOVA_READONLY_DATABASE_URL (Postgres role nova_readonly,
 * SELECT-only on operational tables). Falls back to DATABASE_URL until Sprint 4 cutover
 * so local/CI keep working — architectural CI still forbids skills importing @/lib/prisma.
 *
 * NOVA plane writes (conversations, dialogState, aliases, reports) stay on @/lib/prisma.
 */

import { PrismaClient } from "@prisma/client";
import { NOVA_READONLY_DATABASE_URL_ENV } from "@/lib/nova/invariants";

const globalForNovaReadonly = globalThis as unknown as {
  novaReadonlyPrisma?: PrismaClient;
};

function resolveNovaReadonlyDatasourceUrl(): {
  url: string | undefined;
  usingDedicatedReadonlyUrl: boolean;
} {
  const dedicated = process.env[NOVA_READONLY_DATABASE_URL_ENV]?.trim();
  if (dedicated) {
    return { url: dedicated, usingDedicatedReadonlyUrl: true };
  }
  return {
    url: process.env.DATABASE_URL?.trim() || undefined,
    usingDedicatedReadonlyUrl: false,
  };
}

function createNovaReadonlyPrisma(): PrismaClient {
  const { url, usingDedicatedReadonlyUrl } = resolveNovaReadonlyDatasourceUrl();
  if (
    process.env.NODE_ENV === "production" &&
    !usingDedicatedReadonlyUrl &&
    process.env.NOVA_READONLY_REQUIRE === "1"
  ) {
    throw new Error(
      `${NOVA_READONLY_DATABASE_URL_ENV} is required when NOVA_READONLY_REQUIRE=1`
    );
  }
  return new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Skill-plane Prisma client. Skills must import this — never `@/lib/prisma`.
 * Alias `prisma` kept for drop-in skill migration.
 */
export const novaReadonlyPrisma =
  globalForNovaReadonly.novaReadonlyPrisma ?? createNovaReadonlyPrisma();

export const prisma = novaReadonlyPrisma;

export function isNovaReadonlyUsingDedicatedUrl(): boolean {
  return Boolean(process.env[NOVA_READONLY_DATABASE_URL_ENV]?.trim());
}

if (process.env.NODE_ENV !== "production") {
  globalForNovaReadonly.novaReadonlyPrisma = novaReadonlyPrisma;
}
