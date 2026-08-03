/**
 * Staff directory report pack — skill-level.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    staffProfile: {
      count: vi.fn(),
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { runStaffSummary } from "@/lib/nova/skills/hr/staff";

function director(): SessionUser {
  return {
    id: "u1",
    role: "DIRECTOR",
    email: "d@test.com",
    name: "Director",
    grantedPermissions: ["ai.assistant.read", "staff.read"],
  } as SessionUser;
}

describe("staff_summary report pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.staffProfile.count).mockResolvedValue(3);
    vi.mocked(prisma.staffProfile.groupBy).mockResolvedValue([
      { department: "Ops", _count: 2 },
      { department: "Accounts", _count: 1 },
    ] as never);
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      {
        staffCode: "S1",
        fullName: "Ravi",
        department: "Ops",
        designation: "Engineer",
      },
    ] as never);
  });

  it("chat-only without report intent", async () => {
    const res = await runStaffSummary({
      user: director(),
      query: "staff list",
      tz: "Asia/Kolkata",
    } as never);
    expect(res.fact.ok).toBe(true);
    expect((res.fact.data as { pack?: unknown })?.pack).toBeUndefined();
  });

  it("builds staff_directory_report pack for report intent", async () => {
    const res = await runStaffSummary({
      user: director(),
      query: "staff list report with charts",
      tz: "Asia/Kolkata",
    } as never);
    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as {
      reportIntent?: boolean;
      pack?: { packId?: string; charts?: unknown[]; tables?: { title: string }[] };
    };
    expect(data.reportIntent).toBe(true);
    expect(data.pack?.packId).toBe("staff_directory_report");
    expect(data.pack?.charts?.length).toBeGreaterThan(0);
    expect(data.pack?.tables?.[0]?.title).toMatch(/staff/i);
  });

  it("denies without staff.read", async () => {
    const res = await runStaffSummary({
      user: { ...director(), grantedPermissions: ["ai.assistant.read"] },
      query: "staff report",
      tz: "Asia/Kolkata",
    } as never);
    expect(res.fact.ok).toBe(false);
    expect(res.fact.denied).toBe(true);
  });
});
