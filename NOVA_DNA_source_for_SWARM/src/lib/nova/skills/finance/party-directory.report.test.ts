/**
 * Customers + vendors report packs — skill-level.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    customer: {
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    vendor: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runCustomersSummary } from "@/lib/nova/skills/finance/customers";
import { runVendorsSummary } from "@/lib/nova/skills/finance/vendors";

function director(): SessionUser {
  return {
    id: "u1",
    role: "DIRECTOR",
    email: "d@test.com",
    name: "Director",
    grantedPermissions: [
      "ai.assistant.read",
      "customer.read",
      "vendor.read",
      "accounts.reports.read",
    ],
  } as SessionUser;
}

describe("customers_summary / vendors_summary report packs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.customer.count).mockResolvedValue(2);
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "c1",
        customerId: "C001",
        customerName: "Acme",
        companyName: "Acme Pvt",
        active: true,
        billingState: "TN",
      },
    ] as never);
    vi.mocked(prisma.customer.groupBy).mockResolvedValue([
      { billingState: "TN", _count: { _all: 2 } },
    ] as never);
    vi.mocked(prisma.vendor.count).mockResolvedValue(1);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([
      { id: "v1", vendorId: "V001", vendorName: "Steel Co", active: true },
    ] as never);
  });

  it("builds customers_report for report intent", async () => {
    const res = await runCustomersSummary({
      user: director(),
      query: "customers report pdf",
      tz: "Asia/Kolkata",
    } as never);
    const data = res.fact.data as { pack?: { packId?: string } };
    expect(data.pack?.packId).toBe("customers_report");
  });

  it("builds vendors_report for report intent", async () => {
    const res = await runVendorsSummary({
      user: director(),
      query: "vendors export with charts",
      tz: "Asia/Kolkata",
    } as never);
    const data = res.fact.data as { pack?: { packId?: string } };
    expect(data.pack?.packId).toBe("vendors_report");
  });

  it("stays chat-only without report intent", async () => {
    const res = await runCustomersSummary({
      user: director(),
      query: "how many customers",
      tz: "Asia/Kolkata",
    } as never);
    expect((res.fact.data as { pack?: unknown })?.pack).toBeUndefined();
  });
});
