import { describe, expect, it } from "vitest";
import {
  looksLikePartyOrProjectName,
  looksLikeSingleTokenPartyLabel,
  normalizeNovaEntityLookupHint,
} from "@/lib/nova/party-name";

describe("party-name helpers", () => {
  it("strips trailing project / task noise before lookup", () => {
    expect(normalizeNovaEntityLookupHint("Avaada project")).toBe("Avaada");
    expect(normalizeNovaEntityLookupHint("Avaada project task")).toBe("Avaada");
    expect(normalizeNovaEntityLookupHint("Avaada project tasks")).toBe("Avaada");
    expect(normalizeNovaEntityLookupHint("  AvAAda  ")).toBe("AvAAda");
  });

  it("single-token brand labels vs multi-word parties", () => {
    expect(looksLikeSingleTokenPartyLabel("avaada")).toBe(true);
    expect(looksLikeSingleTokenPartyLabel("Avaada project")).toBe(true);
    expect(looksLikePartyOrProjectName("avaada")).toBe(false);
    expect(looksLikePartyOrProjectName("tata steel")).toBe(true);
  });
});
