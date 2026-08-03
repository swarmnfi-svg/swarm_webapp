import { describe, expect, it } from "vitest";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";

/**
 * Lock: "project at loss" must route to Project P&L (profitability_summary),
 * not the active-FY projects portfolio (projects_summary).
 * Regression from NOVA_PROJECT_UNDERSTANDING_CORRECTION_PLAN — "at" was missing
 * from the on/in loss rewrite while "on"/"in" already remapped to "project loss".
 */
describe("NOVA project at-loss routing (module bug sweep)", () => {
  for (const q of [
    "any project at loss",
    "project at loss",
    "projects at loss",
    "any project on loss",
    "any project in loss",
    "loss-making projects",
  ]) {
    it(`routes "${q}" to profitability_summary`, () => {
      const tools = selectNovaTools(normalizeNovaQuery(q));
      expect(tools, q).toContain("profitability_summary");
      expect(tools, q).not.toContain("projects_summary");
    });
  }
});
