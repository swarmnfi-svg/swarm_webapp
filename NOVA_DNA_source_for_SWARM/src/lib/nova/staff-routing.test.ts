/**
 * Staff profile routing — never inherit sticky receipts / money party.
 */
import { describe, expect, it } from "vitest";
import { extractNovaPersonHint } from "@/lib/ai/nova-lexicon";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import {
  applyNovaTopicSwitchToDialogState,
  detectNovaSlotFamily,
  emptyNovaDialogState,
  type NovaDialogState,
} from "@/lib/nova/dialog-state";

describe("staff arif routing", () => {
  it("extracts person hint from staff-prefixed asks", () => {
    expect(extractNovaPersonHint("staff arif")).toBe("arif");
    expect(extractNovaPersonHint("employee Zeeshan")).toBe("Zeeshan");
    expect(extractNovaPersonHint("Staff Arif Khan")).toBe("Arif Khan");
  });

  it("extracts person hint from who-is asks", () => {
    expect(extractNovaPersonHint("who is arun")).toBe("arun");
    expect(extractNovaPersonHint("who is Arun")).toBe("Arun");
    expect(extractNovaPersonHint("who's Zeeshan")).toBe("Zeeshan");
    expect(extractNovaPersonHint("who is late")).toBeNull();
  });

  it("routes staff-prefixed asks to staff_summary only", () => {
    expect(selectNovaTools("staff arif")).toEqual(["staff_summary"]);
    expect(selectNovaTools("employee Zeeshan")).toEqual(["staff_summary"]);
  });

  it("routes staff finance asks to advances / expense facts, not staff profile", () => {
    expect(selectNovaTools("which staff requested most advance")).toEqual([
      "staff_advances_summary",
    ]);
    expect(selectNovaTools("staff advance pending settlement")).toEqual([
      "staff_advances_summary",
    ]);
    expect(selectNovaTools("who claimed most reimbursement")).toEqual([
      "staff_expense_summary",
    ]);
    expect(selectNovaTools("which staff spends more money")).toEqual([
      "staff_expense_summary",
    ]);
    expect(selectNovaTools("employee expense trend")).toEqual(["nova_trend"]);
  });

  it("routes who is <name> to staff_summary", () => {
    expect(selectNovaTools("who is arun")).toEqual(["staff_summary"]);
    expect(selectNovaTools("who is Arun")).toEqual(["staff_summary"]);
  });

  it("detects staff slot family (not money)", () => {
    expect(detectNovaSlotFamily("staff arif")).toBe("staff");
    expect(detectNovaSlotFamily("who is arun")).toBe("staff");
    expect(detectNovaSlotFamily("receipts today")).toBe("money");
    expect(detectNovaSlotFamily("staff-wise expense report")).toBe("money");
  });

  it("clears sticky money bound on switch to staff", () => {
    const now = new Date();
    const prior: NovaDialogState = {
      ...emptyNovaDialogState(),
      bound: {
        entityId: "cust_1",
        entityType: "customer",
        entityLabel: "Tata",
        entityCode: "TATA",
      },
      slots: {
        family: "money",
        metric: "receipts",
        tools: ["receipts_summary"],
        module: null,
        entityHint: "Tata",
        periodLabel: "13 Jul",
        periodGrain: "day",
        periodSource: "explicit",
        turnCount: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
    };
    const next = applyNovaTopicSwitchToDialogState(prior, "staff arif");
    expect(next.bound).toBeUndefined();
    expect(next.slots).toBeNull();
  });

  it("who-is then customer outstanding topic-switches to money", () => {
    const now = new Date();
    const prior: NovaDialogState = {
      ...emptyNovaDialogState(),
      slots: {
        family: "staff",
        metric: null,
        tools: ["staff_summary"],
        module: "staff",
        entityHint: "arun",
        periodLabel: null,
        periodGrain: null,
        periodSource: null,
        turnCount: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60_000).toISOString(),
      },
    };
    expect(detectNovaSlotFamily("customer outstanding")).toBe("money");
    const next = applyNovaTopicSwitchToDialogState(prior, "customer outstanding");
    expect(next.slots).toBeNull();
    expect(selectNovaTools("customer outstanding")).toEqual(
      expect.arrayContaining(["receivables_summary"])
    );
  });

  it("bare staff follow-up reinforces staff family", () => {
    expect(detectNovaSlotFamily("staff")).toBe("staff");
    expect(selectNovaTools("staff")).toEqual(["staff_summary"]);
  });
});
