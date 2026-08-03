import { describe, expect, it } from "vitest";
import { normalizeNovaQuery } from "@/lib/ai/nova-normalize";
import { suggestNovaCatalogPhrasesForUser } from "@/lib/ai/nova-catalog-suggest";
import { runNovaSearchEngine } from "@/lib/nova/nova-search-engine";
import {
  matchNovaPartyDocumentAsk,
  normalizeNovaDocumentJargon,
  shouldSuppressCatalogNearMiss,
} from "@/lib/nova/nlp-document-jargon";

const superUser = {
  id: "u1",
  role: "SUPER_ADMIN",
  name: "Super",
  grantedPermissions: [
    "ai.assistant.read",
    "customer.read",
    "project.read",
    "invoice.read",
    "accounts.reports.read",
    "hr.attendance.read",
  ],
} as never;

describe("NOVA document / drawing NLP", () => {
  it("normalizes P&ID and drawing jargon to documents", () => {
    expect(normalizeNovaDocumentJargon("tata p&id").toLowerCase()).toMatch(
      /tata documents/
    );
    expect(normalizeNovaQuery("tata steels P&ID").toLowerCase()).toMatch(
      /tata steels documents/
    );
    expect(normalizeNovaQuery("show me GA drawing for Avaada").toLowerCase()).toMatch(
      /documents/
    );
  });

  it("matches party↔doc in either order", () => {
    expect(matchNovaPartyDocumentAsk("tata p&id")?.entityHint.toLowerCase()).toBe(
      "tata"
    );
    expect(
      matchNovaPartyDocumentAsk("P&ID for Tata Steels")?.entityHint.toLowerCase()
    ).toMatch(/tata steels/);
    expect(
      matchNovaPartyDocumentAsk("drawings of James School")?.entityHint.toLowerCase()
    ).toMatch(/james school/);
    expect(
      matchNovaPartyDocumentAsk("do we have isometric for Tata Steels")?.entityHint.toLowerCase()
    ).toMatch(/tata steels/);
  });

  it("routes natural language to documents_search", () => {
    for (const q of [
      "tata p&id",
      "P&ID for Tata Steels",
      "show me drawings for Tata Steels",
      "tata steels ga drawing",
      "datasheet for Avaada",
    ]) {
      const slots = runNovaSearchEngine(normalizeNovaQuery(q));
      expect(slots.tools, q).toEqual(["documents_search"]);
      expect(slots.queryFamily, q).toBe("docs");
      expect(slots.entityHint, q).toBeTruthy();
    }
  });

  it("suppresses catalog near-miss junk for party / P&ID asks", () => {
    expect(shouldSuppressCatalogNearMiss("tata p&id")).toBe(true);
    expect(shouldSuppressCatalogNearMiss("Tata Steels")).toBe(true);
    expect(shouldSuppressCatalogNearMiss("leave balans")).toBe(false);
    expect(suggestNovaCatalogPhrasesForUser(superUser, "tata p&id", 4)).toEqual(
      []
    );
  });
});
