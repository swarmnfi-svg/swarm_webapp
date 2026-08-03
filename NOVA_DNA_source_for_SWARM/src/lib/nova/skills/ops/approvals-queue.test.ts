/**
 * MM — entity-scoped approvals queue + RBAC still gates floor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    approvalRequest: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    project: { findUnique: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    customer: { findUnique: vi.fn() },
    purchaseOrder: { findMany: vi.fn().mockResolvedValue([]) },
    purchaseRequest: { findMany: vi.fn().mockResolvedValue([]) },
    purchaseBill: { findMany: vi.fn().mockResolvedValue([]) },
    paymentRequest: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import {
  novaApprovalsEntityScopeWhere,
  novaOpenApprovalsWhere,
} from "@/lib/ai/nova-approvals";
import { runApprovalsSummary } from "@/lib/nova/skills/ops/approvals-queue";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";
import { selectNovaTools } from "@/lib/ai/nova-tools";

function user(partial: Partial<SessionUser> & { grantedPermissions?: Permission[] }): SessionUser {
  return {
    id: "u1",
    email: "t@test.com",
    name: "Tester",
    role: "ADMIN",
    permissions: [],
    ...partial,
  } as SessionUser;
}

describe("MM approvals entity scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("MM-A1: tata steel approvals → approvals_summary + entity hint", () => {
    const q = "tata steel approvals";
    const slots = runNovaSearchEngine(q);
    expect(slots.tools).toEqual(["approvals_summary"]);
    expect(slots.entityHint?.toLowerCase()).toMatch(/tata steel/);
    expect(slots.intent).toBe("approvals_for_entity");
    expect(selectNovaTools(q)).toEqual(["approvals_summary"]);
  });

  it("novaOpenApprovalsWhere RBAC intact for team vs all", () => {
    const team = novaOpenApprovalsWhere(
      user({ role: "MANAGER", grantedPermissions: ["approval.read.team"] })
    );
    expect(JSON.stringify(team)).toMatch(/submittedByUserId|currentApproverUserId/);
    const all = novaOpenApprovalsWhere(
      user({ role: "ADMIN", grantedPermissions: ["approval.read.all"] })
    );
    expect(all).toEqual({
      status: { in: ["PENDING_APPROVAL", "SUBMITTED", "ESCALATED"] },
    });
  });

  it("project-bound scope uses source records + projectRef metadata", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      projectId: "C0014-P001",
      projectName: "Tata Steel 800",
    } as never);
    vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([{ id: "po-1" }] as never);
    vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.purchaseBill.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([{ id: "pay-1" }] as never);

    const scope = await novaApprovalsEntityScopeWhere({
      resolvedEntityType: "project",
      resolvedEntityDbId: "proj-db-1",
      entityFilterName: "Tata Steel 800",
    });
    expect(scope).toBeTruthy();
    const or = (scope as { OR: unknown[] }).OR;
    expect(or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceModule: "PURCHASE_ORDER",
          sourceRecordId: { in: ["po-1"] },
        }),
        expect.objectContaining({
          sourceModule: "PAYMENT_REQUEST",
          sourceRecordId: { in: ["pay-1"] },
        }),
        expect.objectContaining({
          metadata: { path: ["projectRef"], equals: "C0014-P001" },
        }),
        expect.objectContaining({
          title: { contains: "C0014-P001", mode: "insensitive" },
        }),
      ])
    );
  });

  it("customer-bound scope fans out via customer projects", async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({
      customerId: "C0014",
      customerName: "Tata Steel",
      projects: [{ projectId: "C0014-P001" }, { projectId: "C0014-P002" }],
    } as never);
    vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([{ id: "po-2" }] as never);
    vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.purchaseBill.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([] as never);

    const scope = await novaApprovalsEntityScopeWhere({
      resolvedEntityType: "customer",
      resolvedEntityDbId: "cust-db-1",
      entityFilterName: "Tata Steel",
    });
    expect(scope).toBeTruthy();
    const poCall = vi.mocked(prisma.purchaseOrder.findMany).mock.calls[0]![0]!;
    expect(poCall.where).toEqual({
      projectRef: { in: ["C0014-P001", "C0014-P002"] },
    });
    const or = (scope as { OR: unknown[] }).OR;
    expect(or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: { contains: "Tata Steel", mode: "insensitive" },
        }),
        expect.objectContaining({
          metadata: { path: ["projectRef"], equals: "C0014-P001" },
        }),
      ])
    );
  });

  it("runApprovalsSummary ANDs entity scope under RBAC floor", async () => {
    vi.mocked(prisma.project.findUnique).mockResolvedValue({
      projectId: "C0001-P001",
      projectName: "Acme Plant",
    } as never);
    vi.mocked(prisma.purchaseOrder.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.purchaseRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.purchaseBill.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.paymentRequest.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.approvalRequest.count).mockResolvedValue(1);
    vi.mocked(prisma.approvalRequest.findMany).mockResolvedValue([
      {
        id: "apr-1",
        requestNo: "APR-2026-1",
        title: "PO for Acme Plant",
        module: "PURCHASE",
        status: "PENDING_APPROVAL",
        amount: 1000,
        currentApproverUser: { name: "Boss" },
      },
    ] as never);

    const res = await runApprovalsSummary({
      user: user({ role: "ADMIN", grantedPermissions: ["approval.read.all"] }),
      query: "Acme Plant approvals",
      tz: "Asia/Kolkata",
      range: null,
      entityHint: "Acme Plant",
      entityFilterName: "Acme Plant",
      resolvedEntityType: "project",
      resolvedEntityDbId: "proj-1",
      personHint: null,
      sampleLimit: 8,
    });

    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as Record<string, unknown>;
    expect(data.entityScoped).toBe(true);
    expect(data.openCount).toBe(1);

    const where = vi.mocked(prisma.approvalRequest.count).mock.calls[0]![0]!.where as {
      AND: unknown[];
    };
    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toEqual({
      status: { in: ["PENDING_APPROVAL", "SUBMITTED", "ESCALATED"] },
    });
    expect(where.AND[1]).toEqual(expect.objectContaining({ OR: expect.any(Array) }));
  });

  it("RBAC deny still blocks without approval.read", async () => {
    const rbac = await import("@/lib/rbac");
    const spy = vi.spyOn(rbac, "can").mockImplementation((_u, perm) => {
      return perm === "ai.assistant.read";
    });
    try {
      const res = await runApprovalsSummary({
        user: user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
        query: "approvals",
        tz: "Asia/Kolkata",
        range: null,
        entityHint: null,
        resolvedEntityType: null,
        resolvedEntityDbId: null,
        personHint: null,
        sampleLimit: 8,
      });
      expect(res.fact.ok).toBe(false);
      expect(res.fact.denied).toBe(true);
      expect(prisma.approvalRequest.count).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
