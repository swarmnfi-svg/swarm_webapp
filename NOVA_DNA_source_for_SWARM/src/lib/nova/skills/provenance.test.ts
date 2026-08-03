import { describe, expect, it } from "vitest";
import {
  formatNovaFreshnessLabel,
  humanizeNovaSource,
  provenanceFromFacts,
  toNovaProvenanceDisplay,
} from "@/lib/nova/skills/provenance";

describe("humanizeNovaSource", () => {
  it("strips _summary / _open suffixes", () => {
    expect(humanizeNovaSource("receipts_summary")).toBe("receipts");
    expect(humanizeNovaSource("documents_open")).toBe("documents");
    expect(humanizeNovaSource("pending_workflow_counts")).toBe("pending workflow");
  });

  it("keeps already-readable labels", () => {
    expect(humanizeNovaSource("daily brief")).toBe("daily brief");
  });
});

describe("formatNovaFreshnessLabel", () => {
  const now = Date.parse("2026-07-12T12:00:00.000Z");

  it("labels recent freshness", () => {
    expect(formatNovaFreshnessLabel("2026-07-12T11:59:40.000Z", now)).toBe("just now");
    expect(formatNovaFreshnessLabel("2026-07-12T11:50:00.000Z", now)).toBe("10 min ago");
  });

  it("returns null for invalid", () => {
    expect(formatNovaFreshnessLabel(null, now)).toBeNull();
    expect(formatNovaFreshnessLabel("not-a-date", now)).toBeNull();
  });
});

describe("toNovaProvenanceDisplay", () => {
  it("merges structured provenance with source-line fallback", () => {
    const display = toNovaProvenanceDisplay(
      {
        period: "today",
        sources: ["receipts_summary"],
        freshness: "2026-07-12T11:59:50.000Z",
        trustWarnings: ["Cached facts are aging — refresh before decisions."],
      },
      {
        sourceLineFallback: "Receipts, Collections",
        nowMs: Date.parse("2026-07-12T12:00:00.000Z"),
      }
    );
    expect(display?.period).toBe("today");
    // Dedup is case-insensitive — "Receipts" collapses with "receipts"
    expect(display?.sources).toEqual(["receipts", "Collections"]);
    expect(display?.freshnessLabel).toBe("just now");
    expect(display?.dataAsOfLabel).toBeTruthy();
    expect(display?.trustWarnings).toHaveLength(1);
  });

  it("returns null when empty", () => {
    expect(toNovaProvenanceDisplay(undefined)).toBeNull();
  });
});

describe("provenanceFromFacts", () => {
  it("collects period and sources from facts", () => {
    const p = provenanceFromFacts(
      [
        {
          ok: true,
          tool: "receipts_summary",
          data: { period: "today", sources: ["receipts_summary"] },
        },
      ],
      ["Receipts"]
    );
    expect(p.period).toBe("today");
    expect(p.sources).toContain("receipts_summary");
    expect(p.sources).toContain("Receipts");
    expect(p.freshness).toBeTruthy();
  });
});
