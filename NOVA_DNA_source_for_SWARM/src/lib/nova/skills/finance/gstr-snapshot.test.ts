/**
 * gstr_snapshot soft-fail — never present failed GSTR lookups as ₹0.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/auth";

vi.mock("@/lib/reports/gstr1", () => ({
  getGstr1Report: vi.fn(),
}));
vi.mock("@/lib/reports/gstr3b", () => ({
  getGstr3bReport: vi.fn(),
}));

import { getGstr1Report } from "@/lib/reports/gstr1";
import { getGstr3bReport } from "@/lib/reports/gstr3b";
import { runGstrSnapshot } from "@/lib/nova/skills/finance/gstr-snapshot";

function accountant(): SessionUser {
  return {
    id: "u1",
    role: "ACCOUNTANT",
    email: "a@test.com",
    name: "Acct",
    grantedPermissions: ["ai.assistant.read", "reports.read", "invoice.read", "accounts.reports.read"],
  } as SessionUser;
}

describe("gstr_snapshot soft-fail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok:false when both GSTR builders fail (not empty/₹0)", async () => {
    vi.mocked(getGstr1Report).mockRejectedValueOnce(new Error("items crash"));
    vi.mocked(getGstr3bReport).mockRejectedValueOnce(new Error("db down"));
    const res = await runGstrSnapshot({
      user: accountant(),
      query: "GSTR-1",
      tz: "Asia/Kolkata",
      range: null,
    } as never);
    expect(res.fact.ok).toBe(false);
    expect(String(res.fact.error ?? "")).toMatch(/do not treat as ₹0/i);
  });
});
