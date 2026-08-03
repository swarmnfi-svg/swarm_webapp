/**
 * Attendance late Trend — person ACL parity with attendance_late_summary.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    hrAttendanceDaily: { findMany: vi.fn().mockResolvedValue([]) },
    staffProfile: { findMany: vi.fn(), findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/rbac", () => ({
  can: vi.fn(),
}));

vi.mock("@/lib/hr/team-scope", () => ({
  hrTeamStaffIdsForUser: vi.fn(),
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import { can } from "@/lib/rbac";
import { hrTeamStaffIdsForUser } from "@/lib/hr/team-scope";
import { loadAttendanceLateTrend } from "@/lib/nova/trend/adapters/attendance-late";

function staffSelfOnly(): SessionUser {
  return {
    id: "u-self",
    name: "Self Staff",
    email: "self@example.com",
    role: "STAFF",
    canApprove: false,
    canSeeVendorBank: false,
    canSeeSalaryInfo: false,
    canSeeProjectValue: false,
    canEditProjectValue: false,
    canSeeProjectBudget: false,
    canEditProjectBudget: false,
    canSeeProjectInvoiced: false,
    canEditProjectInvoiced: false,
    canSeeCustomerCredit: false,
    canEditCustomerCredit: false,
    grantedPermissions: ["ai.assistant.read", "hr.punch.self"],
  } as SessionUser;
}

function teamLead(): SessionUser {
  return {
    ...staffSelfOnly(),
    id: "u-lead",
    name: "Team Lead",
    role: "MANAGER",
    grantedPermissions: ["ai.assistant.read", "hr.attendance.team", "hr.punch.self"],
  } as SessionUser;
}

describe("attendance late trend person ACL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("denies self-only staff named-peer late trends", async () => {
    vi.mocked(can).mockImplementation((_u, perm) => perm === "hr.punch.self");
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      {
        id: "staff-peer",
        fullName: "Arif Ansari",
        staffCode: "ARIF01",
        userId: "u-peer",
      },
    ] as never);

    const outcome = await loadAttendanceLateTrend({
      user: staffSelfOnly(),
      query: "Arif late punch trend last 30 days",
      tz: "Asia/Kolkata",
      range: null,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: "Arif Ansari",
      sampleLimit: 6,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok && "denied" in outcome) {
      expect(outcome.denied).toBe(true);
      expect(outcome.error).toMatch(/own attendance/i);
    }
    expect(prisma.hrAttendanceDaily.findMany).not.toHaveBeenCalled();
  });

  it("denies team lead for peer outside team scope", async () => {
    vi.mocked(can).mockImplementation(
      (_u, perm) => perm === "hr.attendance.team" || perm === "hr.punch.self"
    );
    vi.mocked(prisma.staffProfile.findMany).mockResolvedValue([
      {
        id: "staff-out",
        fullName: "Outside Peer",
        staffCode: "OUT01",
        userId: "u-out",
      },
    ] as never);
    vi.mocked(hrTeamStaffIdsForUser).mockResolvedValue(["staff-in-team"]);

    const outcome = await loadAttendanceLateTrend({
      user: teamLead(),
      query: "Outside Peer late trend",
      tz: "Asia/Kolkata",
      range: null,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: "Outside Peer",
      sampleLimit: 6,
    });

    expect(outcome.ok).toBe(false);
    if (!outcome.ok && "denied" in outcome) {
      expect(outcome.denied).toBe(true);
      expect(outcome.error).toMatch(/outside your team/i);
    }
  });
});
