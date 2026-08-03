import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESENT_REGISTER_STATUSES } from "@/lib/hr/attendance-status";
import { STALE_LATE_MINUTES } from "@/lib/hr/register-recalc";
import { prismaDateFromCalendar } from "@/lib/datetime-pure";
import { parseNovaDateRange } from "@/lib/ai/nova-dates";
import { formatFactsDeterministic } from "@/lib/ai/nova-format";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/nova/prisma-readonly", () => ({
  prisma: {
    hrAttendanceDaily: { findMany: vi.fn().mockResolvedValue([]) },
    staffProfile: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/nova/prisma-readonly";
import {
  isNovaAbsentAttendanceStatus,
  isNovaCredibleLateDay,
  isNovaPresentAttendanceStatus,
  runAttendanceLateSummary,
} from "./attendance";

function admin(): SessionUser {
  return {
    id: "u-admin",
    name: "Super Admin",
    email: "admin@example.com",
    role: "ADMIN",
    canApprove: true,
    canSeeVendorBank: true,
    canSeeSalaryInfo: true,
    canSeeProjectValue: true,
    canEditProjectValue: true,
    canSeeProjectBudget: true,
    canEditProjectBudget: true,
    canSeeProjectInvoiced: true,
    canEditProjectInvoiced: true,
    canSeeCustomerCredit: true,
    canEditCustomerCredit: true,
    grantedPermissions: ["ai.assistant.read", "hr.attendance.read", "hr.attendance.team"],
  } as SessionUser;
}

describe("NOVA attendance aggregation guards", () => {
  it("aligns present with PRESENT_REGISTER_STATUSES (incl. open MPO + geo / worked offs)", () => {
    for (const s of PRESENT_REGISTER_STATUSES) {
      expect(isNovaPresentAttendanceStatus(s), s).toBe(true);
    }
    expect(PRESENT_REGISTER_STATUSES).toContain("MISSING_PUNCH_OUT");
    expect(isNovaPresentAttendanceStatus("HALF_DAY")).toBe(false);
    expect(isNovaPresentAttendanceStatus("MISSING_PUNCH_OUT")).toBe(true);
    expect(isNovaPresentAttendanceStatus("MISSING_PUNCH_IN")).toBe(false);
  });

  it("treats MISSING_PUNCH_IN as absent, not ABSENT-only invent", () => {
    expect(isNovaAbsentAttendanceStatus("MISSING_PUNCH_IN")).toBe(true);
    expect(isNovaAbsentAttendanceStatus("UNPAID_LEAVE")).toBe(true);
    expect(isNovaAbsentAttendanceStatus("ABSENT")).toBe(true);
    expect(isNovaAbsentAttendanceStatus("LATE")).toBe(false);
  });

  it("counts open MPO late minutes as late comers (mid-day register truth)", () => {
    expect(isNovaCredibleLateDay("HALF_DAY", 45)).toBe(false);
    expect(isNovaCredibleLateDay("MISSING_PUNCH_OUT", 120)).toBe(true);
    expect(isNovaCredibleLateDay("MISSING_PUNCH_OUT", 1)).toBe(true);
    expect(isNovaCredibleLateDay("LATE", 45)).toBe(true);
    expect(isNovaCredibleLateDay("GEO_EXCEPTION", 20)).toBe(true);
    expect(isNovaCredibleLateDay("PRESENT", 0)).toBe(false);
    expect(isNovaCredibleLateDay("MISSING_PUNCH_OUT", 0)).toBe(false);
  });

  it("caps nonsense lateMinutes above STALE_LATE_MINUTES (8h)", () => {
    expect(STALE_LATE_MINUTES).toBe(8 * 60);
    expect(isNovaCredibleLateDay("LATE", STALE_LATE_MINUTES)).toBe(true);
    expect(isNovaCredibleLateDay("LATE", STALE_LATE_MINUTES + 1)).toBe(false);
    expect(isNovaCredibleLateDay("MISSING_PUNCH_OUT", STALE_LATE_MINUTES + 1)).toBe(false);
    expect(isNovaCredibleLateDay("LATE", 1468)).toBe(false);
    expect(isNovaCredibleLateDay("LATE", 832)).toBe(false);
  });

  it("keeps late ⊆ present so monthly headlines stay coherent", () => {
    const sample = [
      { status: "LATE", lateMinutes: 30 },
      { status: "HALF_DAY", lateMinutes: 90 },
      { status: "MISSING_PUNCH_OUT", lateMinutes: 200 },
      { status: "LATE", lateMinutes: 900 },
      { status: "GEO_EXCEPTION", lateMinutes: 15 },
      { status: "MISSING_PUNCH_IN", lateMinutes: 0 },
    ];
    const present = sample.filter((r) => isNovaPresentAttendanceStatus(r.status));
    const late = sample.filter((r) => isNovaCredibleLateDay(r.status, r.lateMinutes));
    expect(present).toHaveLength(4); // LATE, MPO, LATE(stale), GEO
    expect(late).toHaveLength(3); // LATE 30 + MPO 200 + GEO 15
    expect(late.every((r) => isNovaPresentAttendanceStatus(r.status))).toBe(true);
    expect(late.length).toBeLessThanOrEqual(present.length);
  });
});

describe("runAttendanceLateSummary — mid-day open MPO register regression", () => {
  const tz = "Asia/Kolkata";
  const now = new Date("2026-07-13T12:00:00+05:30");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockReset().mockResolvedValue([]);
    vi.mocked(prisma.staffProfile.findMany).mockReset().mockResolvedValue([]);
  });

  function mpoRows() {
    const day = prismaDateFromCalendar({ year: 2026, month: 7, day: 13 });
    const staff = (name: string, code: string) => ({
      staffCode: code,
      fullName: name,
      department: null,
    });
    return [
      {
        staffId: "a",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:27:00.000Z"),
        punchOutTime: null,
        staff: staff("Aalok Jha", "STF0008"),
      },
      {
        staffId: "b",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 91,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T06:00:00.000Z"),
        punchOutTime: null,
        staff: staff("Arun C Michael", "STF0003"),
      },
      {
        staffId: "c",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 1,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:31:00.000Z"),
        punchOutTime: null,
        staff: staff("Faiyaz Khan", "STF0009"),
      },
      {
        staffId: "d",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 5,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:34:00.000Z"),
        punchOutTime: null,
        staff: staff("Kokila G", "STF0006"),
      },
      {
        staffId: "e",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T04:29:00.000Z"),
        punchOutTime: null,
        staff: staff("Madhu M", "STF0010"),
      },
      {
        staffId: "f",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 34,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T05:03:00.000Z"),
        punchOutTime: null,
        staff: staff("MD Arif Ansari", "STF0007"),
      },
      {
        staffId: "g",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 51,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-13T05:21:00.000Z"),
        punchOutTime: null,
        staff: staff("MD Shahzada Shah", "STF0005"),
      },
    ];
  }

  async function run(query: string) {
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue(mpoRows() as never);
    const range = parseNovaDateRange("today", now, tz)!;
    return runAttendanceLateSummary({
      user: admin(),
      query,
      tz,
      range,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 50,
    });
  }

  it("who was late today lists MPO late people with punch times (not zeros)", async () => {
    const result = await run("who was late today");
    expect(result.fact.ok).toBe(true);
    const d = result.fact.data!;
    expect(d.focus).toBe("late");
    expect(d.latePeopleCount).toBe(5);
    expect(d.peopleWithLate).toBe(5);
    expect(d.presentPunchDays).toBe(7);
    const top = d.topLateComers as { name: string; totalLateMinutes: number; punchInLabel?: string }[];
    expect(top.map((p) => p.name)).toEqual(
      expect.arrayContaining([
        "Arun C Michael",
        "MD Shahzada Shah",
        "MD Arif Ansari",
        "Kokila G",
        "Faiyaz Khan",
      ])
    );
    expect(top.find((p) => p.name === "Arun C Michael")?.totalLateMinutes).toBe(91);
    expect(top.every((p) => p.punchInLabel)).toBe(true);

    const text = formatFactsDeterministic("who was late today", [result.fact]);
    expect(text).toMatch(/Here’s the late list/i);
    expect(text).toMatch(/\*\*5\*\* people late/);
    expect(text).toMatch(/Arun C Michael/);
    expect(text).not.toMatch(/No one was late/);
    expect(text).not.toMatch(/\*\*0\*\* people late/);
  });

  it("who punched in today lists all open visits with times (not late-zeros copy)", async () => {
    const result = await run("who punched in today");
    expect(result.fact.ok).toBe(true);
    const d = result.fact.data!;
    expect(d.focus).toBe("present");
    expect(d.presentPunchDays).toBe(7);
    const top = d.topPresent as {
      name: string;
      punchInLabel?: string | null;
      status?: string;
    }[];
    expect(top).toHaveLength(7);
    expect(top.every((p) => p.status === "MISSING_PUNCH_OUT")).toBe(true);
    expect(top.every((p) => Boolean(p.punchInLabel))).toBe(true);
    expect(top.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Aalok Jha", "Madhu M", "Arun C Michael"])
    );

    const text = formatFactsDeterministic("who punched in today", [result.fact]);
    expect(text).toMatch(/Here’s who was present/i);
    expect(text).toMatch(/\*\*7\*\* people punched in/);
    expect(text).toMatch(/Punched in/);
    expect(text).toMatch(/9:57|11:30|10:51/);
    expect(text).not.toMatch(/Here’s the late list/i);
    expect(text).not.toMatch(/No one was late/);
  });

  it("punch in times routes to present focus with punch labels", async () => {
    const result = await run("punch in times");
    expect(result.fact.ok).toBe(true);
    expect(result.fact.data!.focus).toBe("present");
    const text = formatFactsDeterministic("punch in times", [result.fact]);
    expect(text).toMatch(/Punched in|Here’s who was present/i);
    expect(text).toMatch(/Arun C Michael/);
    expect(text).not.toMatch(/\*\*0\*\* people late/);
  });

  it("punch out time of all staffs lists out times / no punch out yet (not late)", async () => {
    const result = await run("Punch out time of all staffs");
    expect(result.fact.ok).toBe(true);
    const d = result.fact.data!;
    expect(d.focus).toBe("punch_out");
    expect(d.presentPunchDays).toBe(7);
    const top = d.topPresent as {
      name: string;
      punchInLabel?: string | null;
      punchOutLabel?: string | null;
      status?: string;
    }[];
    expect(top).toHaveLength(7);
    expect(top.every((p) => p.status === "MISSING_PUNCH_OUT")).toBe(true);
    expect(top.every((p) => Boolean(p.punchInLabel))).toBe(true);
    expect(top.every((p) => p.punchOutLabel == null)).toBe(true);

    const text = formatFactsDeterministic("Punch out time of all staffs", [result.fact]);
    expect(text).toMatch(/Here’s the punch-out list/i);
    expect(text).toMatch(/Out times/i);
    expect(text).toMatch(/no punch out yet/i);
    expect(text).toMatch(/IN 9:57|IN 11:30|IN 10:51/i);
    expect(text).toMatch(/Aalok Jha|Arun C Michael/);
    expect(text).not.toMatch(/Here’s the late list/i);
    expect(text).not.toMatch(/min late/i);
    expect(text).not.toMatch(/Here’s who was present/i);
  });

  it("completed day punch-out shows OUT timestamps", async () => {
    const { prismaDateFromCalendar } = await import("@/lib/datetime-pure");
    const day = prismaDateFromCalendar({ year: 2026, month: 7, day: 12 });
    vi.mocked(prisma.hrAttendanceDaily.findMany).mockResolvedValue([
      {
        staffId: "a",
        date: day,
        status: "PRESENT",
        lateMinutes: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-12T04:00:00.000Z"), // 9:30 IST
        punchOutTime: new Date("2026-07-12T12:30:00.000Z"), // 18:00 IST
        staff: { staffCode: "STF0008", fullName: "Aalok Jha", department: null },
      },
      {
        staffId: "b",
        date: day,
        status: "MISSING_PUNCH_OUT",
        lateMinutes: 10,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        punchInTime: new Date("2026-07-12T04:40:00.000Z"),
        punchOutTime: null,
        staff: { staffCode: "STF0003", fullName: "Arun C Michael", department: null },
      },
    ] as never);

    const range = parseNovaDateRange("yesterday", new Date("2026-07-13T12:00:00+05:30"), tz)!;
    const result = await runAttendanceLateSummary({
      user: admin(),
      query: "punch out times",
      tz,
      range,
      entityHint: null,
      resolvedEntityType: null,
      resolvedEntityDbId: null,
      personHint: null,
      sampleLimit: 50,
    });
    expect(result.fact.data!.focus).toBe("punch_out");
    const text = formatFactsDeterministic("punch out times", [result.fact]);
    expect(text).toMatch(/Here’s the punch-out list/i);
    expect(text).toMatch(/Aalok Jha.*OUT/i);
    expect(text).toMatch(/6:00|18:00/);
    expect(text).toMatch(/Arun C Michael.*no punch out yet/i);
    expect(text).not.toMatch(/min late/i);
  });
});
