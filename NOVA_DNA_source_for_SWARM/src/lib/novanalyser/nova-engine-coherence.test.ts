/**
 * NOVA meta-engine routing coherence — NovaPlan + selectNovaTools + follow-ups.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildNovaPlan, novaPlanHasReadyTools } from "@/lib/ai/nova-plan";
import { resolveNovaMetaEngineRoute } from "@/lib/ai/nova-engine-routing";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { resolveNovaFollowUp } from "@/lib/ai/nova-context";
import {
  emptyNovaDialogState,
  setNovaLastNovAnalyserContext,
} from "@/lib/nova/dialog-state";
import {
  isNovAnalyserActionFollowUp,
  resolveNovAnalyserFollowUpPlan,
} from "@/lib/novanalyser/follow-up";

describe("NOVA meta-engine routing coherence", () => {
  const prevFlag = process.env.NOVA_NOVANALYSER_ENABLED;

  beforeEach(() => {
    process.env.NOVA_NOVANALYSER_ENABLED = "1";
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.NOVA_NOVANALYSER_ENABLED;
    else process.env.NOVA_NOVANALYSER_ENABLED = prevFlag;
  });

  it("NovaPlan and selectNovaTools agree on novanalyser cues", () => {
    const q = "how can I improve the business";
    expect(selectNovaTools(q)).toEqual(["novanalyser"]);
    const plan = buildNovaPlan(q);
    expect(plan.tools).toEqual(["novanalyser"]);
    expect(plan.module).toBe("novanalyser");
    expect(novaPlanHasReadyTools(plan)).toBe(true);
    expect(plan.confidence).toBe("high");
  });

  it("flag OFF: meta engine does not claim novanalyser; analysis/trend unchanged", () => {
    delete process.env.NOVA_NOVANALYSER_ENABLED;
    expect(resolveNovaMetaEngineRoute("how can I improve the business")).toBeNull();
    expect(selectNovaTools("how can I improve the business")).not.toContain("novanalyser");
    expect(buildNovaPlan("how can I improve the business").tools).not.toContain("novanalyser");
    expect(selectNovaTools("why is my kpi low")).toContain("nova_analysis");
    expect(resolveNovaMetaEngineRoute("why is my kpi low")?.tools).toEqual(["nova_analysis"]);
  });

  it("NovaPlan and selectNovaTools agree on nova_analysis cues", () => {
    const q = "why is my kpi low";
    expect(selectNovaTools(q)).toContain("nova_analysis");
    expect(selectNovaTools(q)).not.toContain("novanalyser");
    const plan = buildNovaPlan(q);
    expect(plan.tools).toContain("nova_analysis");
    expect(plan.module).toBe("nova_analysis");
  });

  it("meta-engine priority: novanalyser before nova_analysis", () => {
    const route = resolveNovaMetaEngineRoute("can I increase my productivity");
    expect(route?.tools).toEqual(["novanalyser"]);
    expect(route?.module).toBe("novanalyser");
  });

  it("domain why stays on nova_analysis not novanalyser", () => {
    expect(resolveNovaMetaEngineRoute("why is outstanding high")?.tools).toEqual([
      "nova_analysis",
    ]);
  });

  it("Think slot-fill cannot override high-confidence NovaPlan meta engine", () => {
    const plan = buildNovaPlan("how can I improve the business");
    expect(plan.confidence).toBe("high");
    expect(plan.tools).toEqual(["novanalyser"]);
    // thinkForLowConfidence requires low confidence or empty tools — neither applies
    expect(novaPlanHasReadyTools(plan)).toBe(true);
  });
});

describe("NovANALYSER → NovaPlan follow-ups", () => {
  const prevFlag = process.env.NOVA_NOVANALYSER_ENABLED;

  beforeEach(() => {
    process.env.NOVA_NOVANALYSER_ENABLED = "1";
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.NOVA_NOVANALYSER_ENABLED;
    else process.env.NOVA_NOVANALYSER_ENABLED = prevFlag;
  });

  const ctx = {
    intent: "business_health",
    planId: "business_health_v1",
    topIssues: [
      {
        id: "overdue_collections",
        title: "Overdue collections",
        contributorTools: ["overdue_invoices", "receipts_summary"],
      },
      {
        id: "project_delays",
        title: "Project delays",
        contributorTools: ["projects_summary"],
      },
    ],
    capturedAt: new Date().toISOString(),
  };

  it("detects action follow-up phrases", () => {
    expect(isNovAnalyserActionFollowUp("what should I do")).toBe(true);
    expect(isNovAnalyserActionFollowUp("suggest actions")).toBe(true);
    expect(isNovAnalyserActionFollowUp("show overdue invoices")).toBe(false);
  });

  it("action follow-up delegates to contributor skill (no novanalyser re-run)", () => {
    const plan = resolveNovAnalyserFollowUpPlan("what should I do", ctx);
    expect(plan?.tools).toEqual(["overdue_invoices"]);
    expect(plan?.tools).not.toContain("novanalyser");
    expect(plan?.source).toBe("follow_up");
  });

  it("drill-down follow-up delegates to nova_analysis", () => {
    const plan = resolveNovAnalyserFollowUpPlan("tell me more about overdue collections", ctx);
    expect(plan?.tools).toEqual(["nova_analysis"]);
    expect(plan?.module).toBe("nova_analysis");
  });

  it("resolveNovaFollowUp uses session context without re-running novanalyser", () => {
    const dialogState = setNovaLastNovAnalyserContext(emptyNovaDialogState(), {
      intent: ctx.intent,
      planId: ctx.planId,
      topIssues: ctx.topIssues,
    });
    const resolved = resolveNovaFollowUp("what should I do", [], dialogState);
    expect(resolved.isFollowUp).toBe(true);
    expect(resolved.forcedTools).toEqual(["overdue_invoices"]);
    expect(resolved.forcedTools).not.toContain("novanalyser");
  });

  it("fresh broad ask still routes to novanalyser when not an action follow-up", () => {
    const dialogState = setNovaLastNovAnalyserContext(emptyNovaDialogState(), {
      intent: ctx.intent,
      planId: ctx.planId,
      topIssues: ctx.topIssues,
    });
    const resolved = resolveNovaFollowUp(
      "how can I improve the business",
      [],
      dialogState
    );
    expect(resolved.isFollowUp).toBe(false);
    expect(selectNovaTools(resolved.query)).toEqual(["novanalyser"]);
  });
});
