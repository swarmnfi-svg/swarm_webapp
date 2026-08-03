import { describe, expect, it, vi } from "vitest";
import {
  DAILY_BRIEF_FANOUT_CONCURRENCY,
  DAILY_BRIEF_PACKS,
  mapWithConcurrency,
  resolveDailyBriefPack,
  slimDailyBriefSection,
} from "@/lib/nova/skills/ops/daily-brief";
import { hasNovaSkill } from "@/lib/nova/skills/registry";
import type { SessionUser } from "@/auth";

function user(partial: Partial<SessionUser> & Pick<SessionUser, "role">): SessionUser {
  return {
    id: "u1",
    email: "a@b.c",
    name: "Test",
    role: partial.role,
    permissions: partial.permissions ?? [],
    canSeeProjectValue: false,
    ...partial,
  } as SessionUser;
}

describe("daily_brief role packs", () => {
  it("maps director/admin to director pack", () => {
    expect(resolveDailyBriefPack(user({ role: "DIRECTOR" }))).toBe("director");
    expect(resolveDailyBriefPack(user({ role: "ADMIN" }))).toBe("director");
  });

  it("maps accountant and manager packs", () => {
    expect(resolveDailyBriefPack(user({ role: "ACCOUNTANT" }))).toBe("accountant");
    expect(resolveDailyBriefPack(user({ role: "MANAGER" }))).toBe("manager");
    expect(resolveDailyBriefPack(user({ role: "STAFF" }))).toBe("staff");
  });

  it("only references registered read skills", () => {
    for (const pack of Object.values(DAILY_BRIEF_PACKS)) {
      for (const toolId of pack) {
        expect(hasNovaSkill(toolId), toolId).toBe(true);
      }
    }
  });

  it("expands packs with ledger/ops registered skills", () => {
    expect(DAILY_BRIEF_PACKS.director).toContain("director_dashboard_summary");
    expect(DAILY_BRIEF_PACKS.director).toContain("sales_orders_summary");
    expect(DAILY_BRIEF_PACKS.director).toContain("projects_summary");
    expect(DAILY_BRIEF_PACKS.director).toContain("reports_snapshot");
    expect(DAILY_BRIEF_PACKS.director).toContain("profitability_summary");
    expect(DAILY_BRIEF_PACKS.manager).toContain("purchase_orders_summary");
    expect(DAILY_BRIEF_PACKS.manager).toContain("kpi_summary");
    expect(DAILY_BRIEF_PACKS.accountant).toContain("tally_status");
    expect(DAILY_BRIEF_PACKS.accountant).toContain("reports_snapshot");
    expect(DAILY_BRIEF_PACKS.staff).toContain("kpi_summary");
    expect(DAILY_BRIEF_PACKS.staff).toContain("incentives_summary");
  });

  it("maps attendance skill field names into brief sections", () => {
    const slim = slimDailyBriefSection("attendance_late_summary", {
      tool: "attendance_late_summary",
      ok: true,
      data: {
        period: "today",
        peopleWithLate: 3,
        latePeopleCount: 3,
        presentPunchDays: 42,
        absentDays: 5,
      },
    });
    expect(slim.peopleWithLate).toBe(3);
    expect(slim.presentPunchDays).toBe(42);
    expect(slim.absentDays).toBe(5);
    expect(slim.presentCount).toBeUndefined();
    expect(slim.absentCount).toBeUndefined();
  });

  it("director pack fan-out is filtered by novaCanRunTool for Staff grant", async () => {
    const { novaCanRunTool } = await import("@/lib/ai/nova-suggest");
    const staffDirector = user({
      role: "STAFF",
      grantedPermissions: ["ai.assistant.read", "director.dashboard"],
    });
    expect(resolveDailyBriefPack(staffDirector)).toBe("director");
    const runnable = DAILY_BRIEF_PACKS.director.filter((t) => novaCanRunTool(staffDirector, t));
    expect(runnable).not.toContain("sales_summary");
    expect(runnable).not.toContain("receipts_summary");
    expect(runnable).not.toContain("receivables_summary");
    expect(runnable).not.toContain("accounts_snapshot");
    expect(runnable).not.toContain("profitability_summary");
    expect(runnable).toContain("notifications_open");
  });

  it("fan-out concurrency default is capped (NI-02)", () => {
    expect(DAILY_BRIEF_FANOUT_CONCURRENCY).toBeGreaterThanOrEqual(2);
    expect(DAILY_BRIEF_FANOUT_CONCURRENCY).toBeLessThanOrEqual(4);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves input order", async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      await new Promise((r) => setTimeout(r, (6 - n) * 5));
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds the concurrency cap", async () => {
    let inflight = 0;
    let peak = 0;
    const cap = 3;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await mapWithConcurrency(items, cap, async (n) => {
      inflight += 1;
      peak = Math.max(peak, inflight);
      await new Promise((r) => setTimeout(r, 15));
      inflight -= 1;
      return n;
    });

    expect(peak).toBeLessThanOrEqual(cap);
    expect(peak).toBe(cap);
  });

  it("handles empty input", async () => {
    const fn = vi.fn(async (n: number) => n);
    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("completes faster than serial for overlapping work", async () => {
    const delayMs = 40;
    const n = 6;
    const cap = 3;
    const started = Date.now();
    await mapWithConcurrency(
      Array.from({ length: n }, (_, i) => i),
      cap,
      async () => {
        await new Promise((r) => setTimeout(r, delayMs));
        return true;
      }
    );
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(n * delayMs * 0.85);
    expect(elapsed).toBeGreaterThanOrEqual(Math.ceil(n / cap) * delayMs - 20);
  });
});
