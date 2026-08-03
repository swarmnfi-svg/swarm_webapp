/**
 * Desktop bridge hook — local-final short-circuit contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEmpowerNovaBridge,
  tryNovaBridgeLocalFinal,
} from "@/lib/nova/empower-nova-bridge";

beforeEach(() => {
  vi.stubGlobal("window", {
    __EMPOWER_NOVA_BRIDGE__: undefined,
  } as Window & typeof globalThis);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("empower nova bridge hook", () => {
  it("returns null when bridge is absent", async () => {
    expect(getEmpowerNovaBridge()).toBeNull();
    expect(await tryNovaBridgeLocalFinal("hello")).toBeNull();
  });

  it("returns local draft only for local-final without server action", async () => {
    (window as Window).__EMPOWER_NOVA_BRIDGE__ = {
      enhance: vi.fn(async () => ({
        source: "local-final",
        serverActionRequired: false,
        localDraft: "  Local answer  ",
      })),
    };
    expect(await tryNovaBridgeLocalFinal("hi")).toBe("Local answer");
  });

  it("falls through when server action is still required", async () => {
    (window as Window).__EMPOWER_NOVA_BRIDGE__ = {
      enhance: vi.fn(async () => ({
        source: "local-preprocess",
        serverActionRequired: true,
        localDraft: "draft only",
      })),
    };
    expect(await tryNovaBridgeLocalFinal("hi")).toBeNull();
  });
});
