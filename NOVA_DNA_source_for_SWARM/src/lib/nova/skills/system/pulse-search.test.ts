/**
 * NOVA Pulse skill — routing + RBAC goldens.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";
import type { Permission } from "@/lib/rbac";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    staffProfile: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    task: { findMany: vi.fn().mockResolvedValue([]) },
    document: { findMany: vi.fn().mockResolvedValue([]) },
    novaPulseEvent: { findMany: vi.fn().mockResolvedValue([]) },
    companyProfile: {
      findFirst: vi.fn().mockResolvedValue({
        name: "Test Co",
        brandName: "TestBrand",
        timezone: "Asia/Kolkata",
      }),
    },
    customer: { findMany: vi.fn().mockResolvedValue([]) },
    vendor: { findMany: vi.fn().mockResolvedValue([]) },
    project: { findMany: vi.fn().mockResolvedValue([]) },
    novaEntityAlias: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    novaPulseEvent: { findMany: vi.fn().mockResolvedValue([]) },
    task: { findMany: vi.fn().mockResolvedValue([]) },
    document: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("@/lib/ai/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/llm")>("@/lib/ai/llm");
  return { ...actual, novaChatCompletion: vi.fn() };
});

import { selectNovaTools } from "@/lib/ai/nova-tools";
import { novaCanRunTool } from "@/lib/ai/nova-suggest";
import { NOVA_TOOL_PERMISSIONS } from "@/lib/ai/nova-tool-permissions";
import { hasNovaSkill } from "@/lib/nova/skills/registry";
import { formatFactsDeterministic } from "@/lib/ai/nova-format";

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

describe("nova_pulse_search skill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers and routes change / upload phrases", () => {
    expect(hasNovaSkill("nova_pulse_search")).toBe(true);
    expect(selectNovaTools("any changes in tasks assigned by me")).toContain("nova_pulse_search");
    expect(selectNovaTools("Zeeshan task any files uploaded")).toContain("nova_pulse_search");
    expect(selectNovaTools("what changed on my tasks")).toContain("nova_pulse_search");
  });

  it("does not steal plain my tasks list", () => {
    expect(selectNovaTools("my tasks")).toContain("tasks_summary");
    expect(selectNovaTools("my tasks")).not.toContain("nova_pulse_search");
  });

  it("RBAC: STAFF with task.read.self can select Pulse; permissions registered", () => {
    expect(NOVA_TOOL_PERMISSIONS.nova_pulse_search).toEqual(
      expect.arrayContaining(["task.read.self", "documents.read"])
    );
    expect(
      novaCanRunTool(
        user({ role: "STAFF", grantedPermissions: ["ai.assistant.read"] }),
        "nova_pulse_search"
      )
    ).toBe(true);
  });

  it("formats pulse facts deterministically", () => {
    const text = formatFactsDeterministic("what changed", [
      {
        tool: "nova_pulse_search",
        ok: true,
        data: {
          matchCount: 1,
          lookbackDays: 90,
          events: [
            {
              summary: "File uploaded on TSK-1 “Demo”: report.pdf",
              action: "ATTACHMENT_ADDED",
              actorName: "Zeeshan",
              createdAt: "2026-07-13T10:00:00.000Z",
              href: "/tasks/t1",
            },
          ],
          disclaimer: "NOVA Pulse only reports recorded ERP change events.",
        },
      },
    ]);
    expect(text).toMatch(/NOVA Pulse/i);
    expect(text).toMatch(/report\.pdf|TSK-1|File uploaded/i);
    expect(text).not.toMatch(/receipts/i);
  });
});
