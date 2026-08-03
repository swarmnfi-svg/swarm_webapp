import { describe, expect, it } from "vitest";
import { compressNovaHistoryWithSlotSummary } from "@/lib/nova/memory";

describe("compressNovaHistoryWithSlotSummary", () => {
  it("passes through short threads unchanged", () => {
    const turns = [
      { role: "user" as const, content: "today receipts" },
      { role: "assistant" as const, content: "₹10", toolsUsed: ["receipts_summary"] },
    ];
    expect(compressNovaHistoryWithSlotSummary(turns, 6)).toEqual([
      { role: "user", content: "today receipts" },
      { role: "assistant", content: "₹10" },
    ]);
  });

  it("compresses older turns into a slot summary", () => {
    const turns = [
      { role: "user" as const, content: "today receipts" },
      {
        role: "assistant" as const,
        content: "ok",
        toolsUsed: ["receipts_summary", "lexicon"],
      },
      { role: "user" as const, content: "late comers" },
      {
        role: "assistant" as const,
        content: "ok",
        toolsUsed: ["attendance_late_summary"],
      },
      { role: "user" as const, content: "my work" },
      { role: "assistant" as const, content: "tasks", toolsUsed: ["my_work_summary"] },
      { role: "user" as const, content: "pending approvals" },
      { role: "assistant" as const, content: "3 open", toolsUsed: ["approvals_summary"] },
    ];
    const out = compressNovaHistoryWithSlotSummary(turns, 4);
    expect(out[0]?.role).toBe("assistant");
    expect(out[0]?.content).toMatch(/Earlier in this chat \(compressed\)/);
    expect(out[0]?.content).toMatch(/receipts/);
    expect(out).toHaveLength(5); // 1 summary + 4 recent
    expect(out[out.length - 1]?.content).toBe("3 open");
  });
});
