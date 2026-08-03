import { describe, expect, it } from "vitest";
import {
  buildNovaClarifyAct,
  resolveNovaClarifyReply,
  shouldCancelPendingNovaClarify,
} from "@/lib/nova/dialog-state";

describe("catalog near-miss clarify cancel (tata p&id)", () => {
  const catalogWall = () =>
    buildNovaClarifyAct({
      kind: "generic",
      originalQuery: "tata p&id",
      hint: "tata p&id",
      options: [
        {
          n: 1,
          id: "attendance",
          label: "who did not punch",
          type: "metric",
          reply: "who did not punch",
        },
        {
          n: 2,
          id: "profit",
          label: "any project at loss",
          type: "metric",
          reply: "any project at loss",
        },
        {
          n: 3,
          id: "bank",
          label: "cash at bank",
          type: "metric",
          reply: "cash at bank",
        },
        {
          n: 4,
          id: "irn",
          label: "irn status",
          type: "metric",
          reply: "irn status",
        },
      ],
    });

  it("cancels when user rephrases with party / P&ID", () => {
    const act = catalogWall();
    expect(shouldCancelPendingNovaClarify("tata steels P&id", act)).toBe(true);
    expect(resolveNovaClarifyReply("tata steels P&id", act).kind).toBe("cancel");
    expect(resolveNovaClarifyReply("tata steels", act).kind).toBe("cancel");
  });

  it("still matches numbered chip picks", () => {
    const act = catalogWall();
    expect(resolveNovaClarifyReply("1", act).kind).toBe("matched");
    expect(resolveNovaClarifyReply("who did not punch", act).kind).toBe("matched");
  });
});
