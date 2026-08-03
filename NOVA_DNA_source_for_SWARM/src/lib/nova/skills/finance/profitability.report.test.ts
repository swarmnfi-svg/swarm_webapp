/**
 * Project P&L report pack — skill-level.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/finance/financial-account-queries", () => ({
  getFundPositionSummary: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/reports/queries", () => ({
  getProjectPlPage: vi.fn().mockResolvedValue({ rows: [], total: 2 }),
  getProjectPl: vi.fn().mockResolvedValue([
    {
      projectName: "Loss Site",
      projectId: "P-L1",
      status: "ACTIVE",
      invoiced: 100000,
      received: 40000,
      purchases: 150000,
      margin: -50000,
      outstanding: 60000,
    },
    {
      projectName: "Profit Site",
      projectId: "P-P1",
      status: "ACTIVE",
      invoiced: 200000,
      received: 180000,
      purchases: 120000,
      margin: 80000,
      outstanding: 20000,
    },
  ]),
}));

import { runProfitabilitySummary } from "@/lib/nova/skills/finance/profitability";

function director(): SessionUser {
  return {
    id: "u1",
    role: "DIRECTOR",
    email: "d@test.com",
    name: "Director",
    grantedPermissions: [
      "ai.assistant.read",
      "project.profitability.view",
      "accounts.reports.read",
    ],
  } as SessionUser;
}

describe("profitability_summary report pack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("chat-only for ordinary P&L asks", async () => {
    const res = await runProfitabilitySummary({
      user: director(),
      query: "project profitability",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    expect((res.fact.data as { reportIntent?: boolean } | undefined)?.reportIntent).toBeFalsy();
    expect((res.fact.data as { pack?: unknown } | undefined)?.pack).toBeUndefined();
  });

  it("builds project_pl_report pack for report intent", async () => {
    const res = await runProfitabilitySummary({
      user: director(),
      query: "project pnl report with charts",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(true);
    const data = res.fact.data as {
      reportIntent?: boolean;
      pack?: { packId?: string; charts?: unknown[]; tables?: { rows: unknown[] }[] };
    };
    expect(data.reportIntent).toBe(true);
    expect(data.pack?.packId).toBe("project_pl_report");
    expect(data.pack?.charts?.length).toBeGreaterThan(0);
    expect(data.pack?.tables?.[0]?.rows.length).toBeGreaterThan(0);
  });

  it("soft-fails loss asks when Project P&L lookup throws (not 0 loss)", async () => {
    const { getProjectPl } = await import("@/lib/reports/queries");
    vi.mocked(getProjectPl).mockRejectedValueOnce(new Error("db down"));
    const res = await runProfitabilitySummary({
      user: director(),
      query: "any project at loss",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(false);
    expect(String(res.fact.error ?? "")).toMatch(/do not treat as zero/i);
    expect(res.fact.data).toBeUndefined();
  });
});
