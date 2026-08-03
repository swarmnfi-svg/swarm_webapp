import { describe, expect, it } from "vitest";
import {
  collapseRelatedCustomerChildProjects,
  pickExactNamedProject,
  projectCodeBelongsToCustomer,
  projectBelongsToCustomer,
  normalizePartyHint,
} from "@/lib/nova/query-structure/party-hierarchy";
import { resolveNovaEntityHint } from "@/lib/ai/nova-tools";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/auth";
import { vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    vendor: { findMany: vi.fn() },
    project: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/nova/semantic/aliases", () => ({
  findConfirmedNovaAliases: vi.fn(async () => []),
}));

function admin(): SessionUser {
  return {
    id: "u1",
    role: "ADMIN",
    grantedPermissions: ["customer.read", "project.read", "vendor.read", "ai.assistant.read"],
  } as SessionUser;
}

describe("party hierarchy helpers", () => {
  it("detects C0026-P001 under C0026", () => {
    expect(projectCodeBelongsToCustomer("C0026-P001", "C0026")).toBe(true);
    expect(projectCodeBelongsToCustomer("C0027-P001", "C0026")).toBe(false);
  });

  it("collapses james school customer + child project → customer", () => {
    const hit = collapseRelatedCustomerChildProjects("james school", [
      {
        type: "customer",
        id: "cust1",
        code: "C0026",
        name: "James school",
      },
      {
        type: "project",
        id: "proj1",
        code: "C0026-P001",
        name: "James school 3 cum",
        customerDbId: "cust1",
      },
    ]);
    expect(hit?.type).toBe("customer");
    expect(hit?.code).toBe("C0026");
  });

  it("exact project name wins over parent customer soft match", () => {
    const hit = pickExactNamedProject("james school 3 cum", [
      {
        type: "customer",
        id: "cust1",
        code: "C0026",
        name: "James school",
      },
      {
        type: "project",
        id: "proj1",
        code: "C0026-P001",
        name: "James school 3 cum",
        customerDbId: "cust1",
      },
    ]);
    expect(hit?.type).toBe("project");
    expect(normalizePartyHint(hit!.name)).toBe("james school 3 cum");
  });

  it("does not collapse unrelated customer + foreign project", () => {
    expect(
      collapseRelatedCustomerChildProjects("tata", [
        { type: "customer", id: "c1", code: "C1", name: "Tata Power" },
        { type: "project", id: "p1", code: "C9-P001", name: "Tata Roadworks", customerDbId: "other" },
      ])
    ).toBeNull();
  });

  it("projectBelongsToCustomer via db id", () => {
    expect(
      projectBelongsToCustomer(
        { type: "project", id: "p", code: "X", name: "X", customerDbId: "c1" },
        { type: "customer", id: "c1", code: "C1", name: "Cust" }
      )
    ).toBe(true);
  });
});

describe("resolveNovaEntityHint hierarchical bind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("james school → customer not clarify vs child project", async () => {
    vi.mocked(prisma.customer.findMany).mockResolvedValue([
      {
        id: "cust1",
        customerId: "C0026",
        customerName: "James school",
        companyName: null,
      },
    ] as never);
    vi.mocked(prisma.vendor.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.project.findMany).mockResolvedValue([
      {
        id: "proj1",
        projectId: "C0026-P001",
        projectName: "James school 3 cum",
        customerId: "cust1",
      },
    ] as never);

    const r = await resolveNovaEntityHint("james school", admin());
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.entity.type).toBe("customer");
      expect(r.entity.code).toBe("C0026");
    }
  });
});
