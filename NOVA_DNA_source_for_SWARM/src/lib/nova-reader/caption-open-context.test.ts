import { describe, expect, it } from "vitest";
import {
  captionPartyNameForSide,
  parseReaderCaptionOpenContext,
} from "@/lib/nova-reader/caption-open-context";

describe("Reader caption → entity kindHint", () => {
  it("for Avaada → entitySpan + no invent kind", () => {
    const c = parseReaderCaptionOpenContext("for Avaada");
    expect(c.entitySpan?.toLowerCase()).toBe("avaada");
    expect(c.entityKindHint).toBeNull();
  });

  it("attach for Avaada project → strip + kindHint project", () => {
    const c = parseReaderCaptionOpenContext("attach for Avaada project");
    expect(c.entitySpan).toBe("Avaada");
    expect(c.entityKindHint).toBe("project");
  });

  it("Avaada invoices → customer-ish money module", () => {
    const c = parseReaderCaptionOpenContext("Avaada invoices");
    expect(c.entitySpan).toBe("Avaada");
    expect(c.moduleHint).toBe("invoices");
    expect(c.entityKindHint).toBe("customer");
  });

  it("empty caption → null span", () => {
    expect(parseReaderCaptionOpenContext("").entitySpan).toBeNull();
    expect(parseReaderCaptionOpenContext(null).entitySpan).toBeNull();
  });

  it("captionPartyNameForSide respects kindHint", () => {
    const project = parseReaderCaptionOpenContext("for Avaada project");
    expect(captionPartyNameForSide(project, "customer")).toBe("Avaada");
    expect(captionPartyNameForSide(project, "vendor")).toBeNull();

    const money = parseReaderCaptionOpenContext("Avaada invoices");
    expect(captionPartyNameForSide(money, "customer")).toBe("Avaada");
    expect(captionPartyNameForSide(money, "vendor")).toBeNull();

    const bare = parseReaderCaptionOpenContext("for Steel Fab");
    expect(captionPartyNameForSide(bare, "vendor")).toBe("Steel Fab");
    expect(captionPartyNameForSide(bare, "customer")).toBe("Steel Fab");
  });
});
