import { describe, expect, it } from "vitest";
import {
  NOVA_FRESHNESS_SOFT_MS,
  NOVA_FRESHNESS_STALE_MS,
  NOVA_REPORT_STALE_MS,
  audienceFromRole,
  buildNovaTrustWarnings,
  formatNovaDataAsOfAbsolute,
  maxCacheAgeMsFromFacts,
  trustWarningLabels,
  trustWarningsToPackWarnings,
} from "@/lib/nova/freshness-trust";

describe("audienceFromRole", () => {
  it("maps roles", () => {
    expect(audienceFromRole("DIRECTOR")).toBe("director");
    expect(audienceFromRole("ACCOUNTANT")).toBe("finance");
    expect(audienceFromRole("MANAGER")).toBe("ops");
    expect(audienceFromRole("STAFF")).toBe("staff");
  });
});

describe("buildNovaTrustWarnings", () => {
  const now = Date.parse("2026-07-14T12:00:00.000Z");

  it("stays quiet on fresh live data without failover", () => {
    const ws = buildNovaTrustWarnings({
      dataAsOf: "2026-07-14T11:59:30.000Z",
      role: "STAFF",
      nowMs: now,
    });
    expect(ws).toEqual([]);
  });

  it("warns staff gently when facts age past soft SLA", () => {
    const ws = buildNovaTrustWarnings({
      dataAsOf: new Date(now - NOVA_FRESHNESS_SOFT_MS - 60_000).toISOString(),
      role: "STAFF",
      nowMs: now,
    });
    expect(ws.some((w) => w.kind === "stale_facts")).toBe(true);
    expect(ws[0]?.message).toMatch(/outdated|out of date|ask again/i);
  });

  it("gives directors absolute as-of on stale facts", () => {
    const ws = buildNovaTrustWarnings({
      dataAsOf: new Date(now - NOVA_FRESHNESS_STALE_MS - 60_000).toISOString(),
      role: "DIRECTOR",
      nowMs: now,
    });
    const stale = ws.find((w) => w.kind === "stale_facts");
    expect(stale?.severity).toBe("warn");
    expect(stale?.message).toMatch(/Data as of|re-run/i);
  });

  it("surfaces cache age when stamped on facts", () => {
    const ws = buildNovaTrustWarnings({
      cacheAgeMs: NOVA_FRESHNESS_STALE_MS + 1,
      role: "ACCOUNTANT",
      nowMs: now,
    });
    expect(ws.some((w) => w.kind === "cache_age" && w.severity === "warn")).toBe(true);
  });

  it("surfaces provider failover with role-adaptive copy", () => {
    const staff = buildNovaTrustWarnings({
      toolsUsed: ["receipts_summary", "llm_fallback_facts", "llm_rate_limited"],
      role: "STAFF",
      nowMs: now,
    });
    expect(staff.some((w) => w.kind === "provider_failover")).toBe(true);
    expect(staff[0]?.message).toMatch(/backup path|ERP totals/i);

    const dir = buildNovaTrustWarnings({
      toolsUsed: ["llm_rate_limited"],
      role: "DIRECTOR",
      nowMs: now,
    });
    expect(dir[0]?.message).toMatch(/failover|llm_rate_limited/i);
  });

  it("marks saved reports with as-of trust note", () => {
    const fresh = buildNovaTrustWarnings({
      dataAsOf: "2026-07-14T11:00:00.000Z",
      isSavedReport: true,
      role: "MANAGER",
      nowMs: now,
    });
    expect(fresh.some((w) => w.kind === "report_as_of" && w.severity === "info")).toBe(true);

    const old = buildNovaTrustWarnings({
      dataAsOf: new Date(now - NOVA_REPORT_STALE_MS - 1000).toISOString(),
      isSavedReport: true,
      role: "DIRECTOR",
      nowMs: now,
    });
    expect(old.some((w) => w.kind === "report_as_of" && w.severity === "warn")).toBe(true);
    expect(old[0]?.message).toMatch(/regenerate/i);
  });

  it("adds live_unfrozen for finance/director when pack is fresh", () => {
    const ws = buildNovaTrustWarnings({
      dataAsOf: "2026-07-14T11:59:50.000Z",
      isLivePack: true,
      role: "DIRECTOR",
      nowMs: now,
    });
    expect(ws.some((w) => w.kind === "live_unfrozen")).toBe(true);
  });

  it("does not add live_unfrozen for staff on fresh packs", () => {
    const ws = buildNovaTrustWarnings({
      dataAsOf: "2026-07-14T11:59:50.000Z",
      isLivePack: true,
      role: "STAFF",
      nowMs: now,
    });
    expect(ws).toEqual([]);
  });
});

describe("helpers", () => {
  it("formats absolute as-of", () => {
    expect(formatNovaDataAsOfAbsolute("2026-07-14T06:30:00.000Z")).toMatch(/2026/);
    expect(formatNovaDataAsOfAbsolute("2026-07-14T06:30:00.000Z", "Asia/Kolkata")).toMatch(
      /14 Jul 2026/
    );
    expect(formatNovaDataAsOfAbsolute("2026-07-14T06:30:00.000Z", "Asia/Kolkata")).not.toMatch(
      /Z$/
    );
  });

  it("maps pack warnings + labels", () => {
    const ws = buildNovaTrustWarnings({
      toolsUsed: ["llm_unavailable"],
      role: "ADMIN",
      nowMs: Date.parse("2026-07-14T12:00:00.000Z"),
    });
    expect(trustWarningsToPackWarnings(ws)[0]?.code).toBe("freshness");
    expect(trustWarningLabels(ws)).toHaveLength(1);
  });

  it("reads max cacheAgeMs from facts", () => {
    expect(
      maxCacheAgeMsFromFacts([
        { ok: true, data: { cacheAgeMs: 1000 } },
        { ok: true, data: { cacheAgeMs: 5000 } },
        { ok: false, data: { cacheAgeMs: 99_000 } },
      ])
    ).toBe(5000);
    expect(maxCacheAgeMsFromFacts([{ ok: true, data: {} }])).toBeNull();
  });
});
