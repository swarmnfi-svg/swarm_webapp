/**
 * Receivables report pack — skill-level.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    salesInvoice: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runReceivablesSummary } from "@/lib/nova/skills/finance/receivables";

function director(): SessionUser {
  return {
    id: "u1",
    role: "DIRECTOR",
    email: "d@test.com",
    name: "Director",
    grantedPermissions: ["ai.assistant.read", "invoice.read", "accounts.reports.read"],
  } as SessionUser;
}

describe("receivables_summary report pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.salesInvoice.count).mockResolvedValue(2);
    vi.mocked(prisma.salesInvoice.aggregate).mockResolvedValue({
      _sum: { grandTotal: 100000 },
    } as never);
    vi.mocked(prisma.salesInvoice.findMany).mockResolvedValue([
      {
        id: "inv1",
        invoiceNumber: "INV-1",
        dueDate: new Date("2026-05-01"),
        grandTotal: 60000,
        status: "OVERDUE",
        customer: { customerName: "Acme Corp" },
      },
    ] as never);
  });

  it("chat-only without report intent", async () => {
    const res = await runReceivablesSummary({
      user: director(),
      query: "overdue invoices",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    expect((res.fact.data as { pack?: unknown })?.pack).toBeUndefined();
  });

  it("builds receivables_report pack for report intent", async () => {
    const res = await runReceivablesSummary({
      user: director(),
      query: "receivables report with charts",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as {
      reportIntent?: boolean;
      pack?: { packId?: string; charts?: unknown[]; tables?: { title: string }[] };
    };
    expect(data.reportIntent).toBe(true);
    expect(data.pack?.packId).toBe("receivables_report");
    expect(data.pack?.charts?.length).toBeGreaterThan(0);
    expect(data.pack?.tables?.[0]?.title).toMatch(/Overdue/i);
  });
});
