import { describe, expect, it, beforeEach } from "vitest";
import {
  bumpQiMetric,
  classifyQiAskOutcome,
  emptyQiMetricCounters,
  getQiCrumbs,
  qiCountersFromCrumbs,
  qiMissRate,
  qiWrongScopeRate,
  recordQiCrumb,
  resetQiCrumbs,
} from "@/lib/nova/query-structure/qi-metrics";
import { refuseSilentOrgWide, toolsImplyPartyScope } from "@/lib/nova/query-structure/gates";

describe("QI miss-rate / wrong-scope metrics", () => {
  beforeEach(() => resetQiCrumbs());

  it("classifies ok_scoped when bound", () => {
    expect(
      classifyQiAskOutcome({
        entitySpan: "avaada",
        toolsImplyScope: true,
        resolvedEntityId: "p1",
      })
    ).toBe("ok_scoped");
  });

  it("classifies clarify_miss when gate fires (not wrong_scope)", () => {
    const refuse = refuseSilentOrgWide({
      entitySpan: "avaada",
      tools: ["tasks_summary"],
    });
    expect(refuse?.clarify).toBe(true);
    expect(
      classifyQiAskOutcome({
        entitySpan: "avaada",
        toolsImplyScope: toolsImplyPartyScope(["tasks_summary"]),
        clarified: true,
      })
    ).toBe("clarify_miss");
  });

  it("classifies wrong_scope when scoped tool would run unbound", () => {
    expect(
      classifyQiAskOutcome({
        entitySpan: "avaada",
        toolsImplyScope: true,
        clarified: false,
        resolvedEntityId: null,
      })
    ).toBe("wrong_scope");
  });

  it("wrong-scope rate target 0 on golden path (gate → clarify)", () => {
    let c = emptyQiMetricCounters();
    const cases = [
      { span: "avaada", bound: false, clarify: true },
      { span: "james school", bound: true, clarify: false },
      { span: "tata", bound: false, person: "tata", clarify: false },
    ] as const;

    for (const row of cases) {
      const outcome = classifyQiAskOutcome({
        entitySpan: row.span,
        toolsImplyScope: true,
        resolvedEntityId: "bound" in row && row.bound ? "id" : null,
        personHint: "person" in row ? row.person : null,
        clarified: "clarify" in row ? row.clarify : false,
      });
      expect(outcome).not.toBe("wrong_scope");
      c = bumpQiMetric(c, outcome);
      recordQiCrumb({
        entitySpan: row.span,
        entityKindHint: "project",
        scoped: true,
        outcome,
        tools: ["tasks_summary"],
      });
    }

    expect(qiWrongScopeRate(c)).toBe(0);
    expect(qiMissRate(c)).toBeGreaterThan(0);
    expect(qiCountersFromCrumbs(getQiCrumbs()).asksWithEntity).toBe(3);
  });
});
