/**
 * Payment requests report pack — skill-level.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    paymentRequest: {
      count: vi.fn(),
      aggregate: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/payment-request-access", () => ({
  paymentRequestListWhereForUser: vi.fn(async () => ({})),
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runPaymentRequestsSummary } from "@/lib/nova/skills/finance/payment-requests";

function director(): SessionUser {
  return {
    id: "u1",
    role: "DIRECTOR",
    email: "d@test.com",
    name: "Director",
    grantedPermissions: ["ai.assistant.read", "paymentrequest.read"],
  } as SessionUser;
}

describe("payment_requests_summary report pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.paymentRequest.count).mockResolvedValue(3);
    vi.mocked(prisma.paymentRequest.aggregate).mockResolvedValue({
      _sum: { amount: 75000 },
    } as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([
      {
        id: "pr1",
        paymentRequestId: "PR-1",
        status: "SUBMITTED",
        amount: 50000,
        purpose: "Vendor advance",
        partyLabel: null,
        vendor: { vendorName: "Steel Co" },
      },
    ] as never);
  });

  it("chat-only without report intent", async () => {
    const res = await runPaymentRequestsSummary({
      user: director(),
      query: "payment requests pending",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    expect((res.fact.data as { pack?: unknown })?.pack).toBeUndefined();
  });

  it("builds payment_requests_report pack for report intent", async () => {
    const res = await runPaymentRequestsSummary({
      user: director(),
      query: "payment requests outstanding report",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as {
      reportIntent?: boolean;
      pack?: { packId?: string; charts?: unknown[]; tables?: { title: string }[] };
    };
    expect(data.reportIntent).toBe(true);
    expect(data.pack?.packId).toBe("payment_requests_report");
    expect(data.pack?.charts?.length).toBeGreaterThan(0);
    expect(data.pack?.tables?.[0]?.title).toMatch(/Awaiting/i);
  });
});
