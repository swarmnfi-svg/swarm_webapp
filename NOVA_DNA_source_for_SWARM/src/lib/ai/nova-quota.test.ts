import { afterEach, describe, expect, it } from "vitest";
import {
  novaConcurrentLimit,
  releaseNovaSlot,
  resetNovaConcurrencyForTests,
  tryAcquireNovaSlot,
} from "./nova-quota";

describe("nova concurrency (NOVA-09)", () => {
  afterEach(() => {
    resetNovaConcurrencyForTests();
    delete process.env.NOVA_MAX_CONCURRENT_PER_USER;
  });

  it("defaults to one in-flight slot per user", () => {
    expect(novaConcurrentLimit()).toBe(1);
    expect(tryAcquireNovaSlot("u1")).toBe(true);
    expect(tryAcquireNovaSlot("u1")).toBe(false);
    expect(tryAcquireNovaSlot("u2")).toBe(true);
    releaseNovaSlot("u1");
    expect(tryAcquireNovaSlot("u1")).toBe(true);
  });

  it("respects NOVA_MAX_CONCURRENT_PER_USER", () => {
    process.env.NOVA_MAX_CONCURRENT_PER_USER = "2";
    expect(novaConcurrentLimit()).toBe(2);
    expect(tryAcquireNovaSlot("u1")).toBe(true);
    expect(tryAcquireNovaSlot("u1")).toBe(true);
    expect(tryAcquireNovaSlot("u1")).toBe(false);
  });
});
