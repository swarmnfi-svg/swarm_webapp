/**
 * Phase E — documents_search goldens (RBAC deny + citation path).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    document: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
    customer: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    vendor: { findMany: vi.fn().mockResolvedValue([]) },
    project: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    novaEntityAlias: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/ai/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/llm")>("@/lib/ai/llm");
  return { ...actual, novaChatCompletion: vi.fn() };
});

import { prisma } from "@/lib/nova/prisma-readonly";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { novaCanRunTool } from "@/lib/ai/nova-suggest";
import { formatFactsDeterministic } from "@/lib/ai/nova-format";
import { hasNovaSkill } from "@/lib/nova/skills/registry";
import { runDocumentsSearch } from "@/lib/nova/skills/system/documents-search";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";
import { answerNovaQuery } from "@/lib/ai/nova";

function user(partial: Partial<SessionUser> & { grantedPermissions?: Permission[] }): SessionUser {
  return {
    id: "u1",
    email: "t@test.com",
    name: "Tester",
    role: "STAFF",
    permissions: [],
    ...partial,
  } as SessionUser;
}

describe("Phase E documents_search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers skill and routes search phrases", () => {
    expect(hasNovaSkill("documents_search")).toBe(true);
    expect(selectNovaTools("search documents contract")).toContain("documents_search");
    expect(selectNovaTools("find pdf Avaada")).toContain("documents_search");
  });

  it("RBAC deny without documents.read", async () => {
    expect(novaCanRunTool(user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }), "documents_search")).toBe(
      false
    );
    const res = await answerNovaQuery(
      user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
      "search documents contract"
    );
    expect(res.toolsUsed ?? []).not.toContain("documents_search");
    expect(res.answer).toMatch(/document|permission|access|vault/i);
  });

  it("returns citations when granted; never invents money", async () => {
    vi.mocked(prisma.document.count).mockResolvedValue(12);
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: "doc-1",
        module: "CUSTOMER",
        recordId: "cust-1",
        fileName: "Avaada-contract.pdf",
        fileType: "application/pdf",
        uploadedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ] as never);

    const res = await runDocumentsSearch({
      user: user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "documents.read", "customer.read"],
      }),
      query: "search documents Avaada-contract",
      tz: "Asia/Kolkata",
      range: null,
      entityHint: null,
      entityFilterName: undefined,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 8,
    });
    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as Record<string, unknown>;
    expect(data.matchCount).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(data)).toMatch(/Avaada-contract/i);
    expect(JSON.stringify(data)).toMatch(/never authors|finance skills/i);
    expect(JSON.stringify(data)).not.toMatch(/₹\s*\d{2,}/);
  });

  it("formatter cites sources from fact pack", () => {
    const text = formatFactsDeterministic("search documents", [
      {
        tool: "documents_search",
        ok: true,
        data: {
          matchCount: 1,
          searchHint: "contract",
          citations: [
            {
              fileName: "PO-scan.pdf",
              module: "PURCHASE_BILL",
              href: "/purchase-bills/x",
              citation: "PO-scan.pdf (PURCHASE_BILL)",
            },
          ],
          moneyDisclaimer: "Document search never authors invoice totals.",
        },
      },
    ]);
    expect(text).toMatch(/PO-scan\.pdf/);
    expect(text).toMatch(/never authors/i);
  });

  it("MM-D2: customer-bound search uses CUSTOMER recordId, not filename-only", async () => {
    const q = "tata steel documents";
    const slots = runNovaSearchEngine(q);
    expect(slots.tools).toEqual(["documents_search"]);
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steel/);

    vi.mocked(prisma.project.findMany).mockResolvedValue([{ id: "proj-db-1" }] as never);
    vi.mocked(prisma.document.count).mockResolvedValue(3);
    vi.mocked(prisma.document.findMany).mockResolvedValue([
      {
        id: "doc-c1",
        module: "CUSTOMER",
        recordId: "cust-db-1",
        fileName: "msa.pdf",
        fileType: "application/pdf",
        uploadedAt: new Date("2026-07-01T00:00:00Z"),
      },
    ] as never);

    const res = await runDocumentsSearch({
      user: user({
        role: "STAFF",
        grantedPermissions: ["ai.assistant.read", "documents.read", "customer.read", "project.read"],
      }),
      query: q,
      tz: "Asia/Kolkata",
      range: null,
      entityHint: "Tata Steel",
      entityFilterName: "Tata Steel",
      resolvedEntityType: "customer",
      resolvedEntityDbId: "cust-db-1",
      personHint: null,
      sampleLimit: 8,
    });

    expect(res.fact.ok).toBe(true);
    const where = vi.mocked(prisma.document.findMany).mock.calls[0]![0]!.where as {
      OR: unknown[];
    };
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { module: "CUSTOMER", recordId: "cust-db-1" },
        { module: "PROJECT", recordId: { in: ["proj-db-1"] } },
        { fileName: { contains: "Tata Steel", mode: "insensitive" } },
      ])
    );
    expect(JSON.stringify(where.OR)).toMatch(/CUSTOMER/);
    expect((res.fact.data as Record<string, unknown>).recordScoped).toBe(true);
  });
});
