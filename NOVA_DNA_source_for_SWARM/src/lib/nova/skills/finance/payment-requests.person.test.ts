/**
 * payment_requests_summary — personHint staff scope.
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

vi.mock("@/lib/ai/nova-tools", () => ({
  resolveNovaPersonHint: vi.fn(async () => ({
    kind: "ok",
    person: {
      name: "MD Arif Ansari",
      relation: "other",
      userId: "u-arif",
      staffId: "staff-arif",
      staffCode: "E001",
      resolved: true,
    },
  })),
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { resolveNovaPersonHint } from "@/lib/ai/nova-tools";
import { runPaymentRequestsSummary } from "@/lib/nova/skills/finance/payment-requests";

function admin(): SessionUser {
  return {
    id: "admin",
    role: "ADMIN",
    email: "a@test.com",
    name: "Admin",
    grantedPermissions: ["ai.assistant.read", "paymentrequest.read", "staff.read"],
  } as SessionUser;
}

describe("payment_requests_summary person filter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(resolveNovaPersonHint).mockResolvedValue({
      kind: "ok",
      person: {
        name: "MD Arif Ansari",
        relation: "other",
        userId: "u-arif",
        staffId: "staff-arif",
        staffCode: "E001",
        resolved: true,
      },
    });
    vi.mocked(prisma.paymentRequest.count).mockResolvedValue(3);
    vi.mocked(prisma.paymentRequest.aggregate).mockResolvedValue({
      _sum: { amount: 12000 },
    } as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([
      {
        id: "1",
        paymentRequestId: "PR-1",
        status: "SUBMITTED",
        amount: 4000,
        purpose: "Site travel",
        partyLabel: null,
        vendor: null,
        staff: { fullName: "MD Arif Ansari" },
      },
    ] as never);
  });

  it("scopes counts to resolved staff when personHint set", async () => {
    const res = await runPaymentRequestsSummary({
      user: admin(),
      query: "Arif payment requests pending list",
      tz: "Asia/Kolkata",
      range: null,
      personHint: "Arif",
    } as never);

    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as {
      awaitingActionCount: number;
      subject?: { name?: string };
      sources?: string[];
      listIntent?: boolean;
      samples?: { id?: string }[];
    };
    expect(data.awaitingActionCount).toBe(3);
    expect(data.subject?.name).toBe("MD Arif Ansari");
    expect(data.sources).toEqual(["payment_request"]);
    expect(data.listIntent).toBe(true);
    expect(data.samples?.[0]?.id).toBe("PR-1");
    expect(resolveNovaPersonHint).toHaveBeenCalledWith("Arif", expect.anything());

    const where = vi.mocked(prisma.paymentRequest.count).mock.calls[0]?.[0]?.where as {
      AND?: unknown[];
    };
    expect(JSON.stringify(where)).toMatch(/staff-arif|u-arif/);
    expect(JSON.stringify(where)).not.toMatch(/staff_advance/);
  });
});
