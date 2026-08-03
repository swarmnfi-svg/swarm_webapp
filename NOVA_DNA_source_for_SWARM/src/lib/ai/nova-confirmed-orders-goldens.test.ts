/**
 * Goldens: “new orders this month” → confirmed projects (not Sales Orders).
 * Explicit “sales orders this month” stays on sales_orders_summary.
 */
import { describe, expect, it } from "vitest";
import { selectNovaTools } from "@/lib/ai/nova-tools";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { composeNovaIntent } from "@/lib/ai/nova-intent";
import {
  isNovaConfirmedOrdersAsk,
  isNovaPortfolioProjectAsk,
  extractNovaNamedProjectHint,
} from "@/lib/ai/nova-lexicon";

describe("NOVA confirmed / new orders → projects", () => {
  const projectQueries = [
    "new orders this month",
    "orders confirmed this month",
    "projects confirmed this month",
    "new projects this month",
    "confirmed projects this month with value received pending",
    "confirmed orders this month",
    "orders this month",
  ];

  for (const q of projectQueries) {
    it(`routes “${q}” to projects_summary`, () => {
      const nq = normalizeNovaQuery(q);
      expect(isNovaConfirmedOrdersAsk(nq), q).toBe(true);
      expect(selectNovaTools(nq), q).toEqual(["projects_summary"]);
      expect(composeNovaIntent(nq).tools, q).toEqual(["projects_summary"]);
      expect(selectNovaTools(nq), q).not.toContain("sales_orders_summary");
      expect(selectNovaTools(nq), q).not.toContain("sales_summary");
      expect(selectNovaTools(nq), q).not.toContain("project_command");
    });
  }

  it("does not treat confirmed projects as a named project", () => {
    expect(isNovaPortfolioProjectAsk("confirmed projects this month")).toBe(true);
    expect(extractNovaNamedProjectHint("confirmed projects this month with value received pending")).toBeNull();
  });

  it("keeps explicit sales orders on sales_orders_summary", () => {
    for (const q of ["sales orders this month", "open sales orders", "SO pending"]) {
      const nq = normalizeNovaQuery(q);
      expect(isNovaConfirmedOrdersAsk(nq), q).toBe(false);
      expect(selectNovaTools(nq), q).toEqual(["sales_orders_summary"]);
      expect(composeNovaIntent(nq).tools, q).toEqual(["sales_orders_summary"]);
    }
  });

  it("leaves open orders on SO clarify / SO path (not confirmed projects)", () => {
    expect(isNovaConfirmedOrdersAsk("open orders")).toBe(false);
  });

  it("leaves order book on order_book_summary", () => {
    expect(selectNovaTools("order book")).toEqual(["order_book_summary"]);
  });
});
