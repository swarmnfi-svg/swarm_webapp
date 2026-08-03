import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bumpPatch,
  formatPlaneVersion,
  parsePlaneVersion,
  validateSemver,
  versionCodeFrom,
} from "./nova-chat-version.mjs";

describe("nova-chat-version", () => {
  it("parses plane suffix versions", () => {
    assert.deepEqual(parsePlaneVersion("1.2.3s"), {
      major: 1,
      minor: 2,
      patch: 3,
      suffix: "s",
    });
    assert.deepEqual(parsePlaneVersion("1.2.99b"), {
      major: 1,
      minor: 2,
      patch: 99,
      suffix: "b",
    });
  });

  it("maps semver to versionCode", () => {
    assert.equal(versionCodeFrom({ major: 1, minor: 2, patch: 3 }), 10203);
    assert.equal(versionCodeFrom({ major: 1, minor: 2, patch: 99 }), 10299);
    assert.equal(versionCodeFrom({ major: 1, minor: 3, patch: 0 }), 10300);
  });

  it("formats with plane suffix", () => {
    assert.equal(formatPlaneVersion({ major: 1, minor: 2, patch: 3 }, "s"), "1.2.3s");
    assert.equal(formatPlaneVersion({ major: 1, minor: 2, patch: 3 }, "b"), "1.2.3b");
  });

  it("rejects patch above 99", () => {
    assert.throws(() => validateSemver({ major: 1, minor: 2, patch: 100 }));
    assert.throws(() => parsePlaneVersion("1.2.100s"));
  });

  it("bumps 1.2.99 to 1.3.0", () => {
    assert.deepEqual(bumpPatch({ major: 1, minor: 2, patch: 99 }), {
      major: 1,
      minor: 3,
      patch: 0,
    });
  });
});
