#!/usr/bin/env node
/**
 * NOVA Chat Android plane versioning.
 *
 * Marketing: major.minor.patch + plane suffix (b = BPG, s = SaaS).
 * Patch runs 0–99 per minor line, then minor bumps (1.2.99s → 1.3.0s).
 * versionCode = major * 10000 + minor * 100 + patch (monotonic, shared across flavors).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const VERSION_FILE = path.join(ROOT, "version.properties");

const PLANE_SUFFIX = { bpg: "b", saas: "s" };

/** @typedef {{ major: number, minor: number, patch: number, suffix?: string }} PlaneVersion */

/** @param {string} raw */
export function parsePlaneVersion(raw) {
  const trimmed = raw.trim();
  const match = /^(\d+)\.(\d+)\.(\d+)([bs])?$/i.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid plane version "${raw}" — expected e.g. 1.2.3s or 1.2.99b`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const suffix = match[4]?.toLowerCase();
  validateSemver({ major, minor, patch });
  return { major, minor, patch, suffix };
}

/** @param {{ major: number, minor: number, patch: number }} parts */
export function validateSemver(parts) {
  if (!Number.isInteger(parts.major) || parts.major < 0) {
    throw new Error(`Invalid major ${parts.major}`);
  }
  if (!Number.isInteger(parts.minor) || parts.minor < 0) {
    throw new Error(`Invalid minor ${parts.minor}`);
  }
  if (!Number.isInteger(parts.patch) || parts.patch < 0 || parts.patch > 99) {
    throw new Error(
      `Invalid patch ${parts.patch} — patch must be 0–99 (next after 1.2.99 is 1.3.0)`,
    );
  }
}

/** @param {{ major: number, minor: number, patch: number }} parts @param {"b"|"s"} suffix */
export function formatPlaneVersion(parts, suffix) {
  validateSemver(parts);
  if (suffix !== "b" && suffix !== "s") {
    throw new Error(`Plane suffix must be b or s, got "${suffix}"`);
  }
  return `${parts.major}.${parts.minor}.${parts.patch}${suffix}`;
}

/** @param {{ major: number, minor: number, patch: number }} parts */
export function versionCodeFrom(parts) {
  validateSemver(parts);
  return parts.major * 10000 + parts.minor * 100 + parts.patch;
}

/** @param {{ major: number, minor: number, patch: number }} parts */
export function bumpPatch(parts) {
  validateSemver(parts);
  if (parts.patch >= 99) {
    return { major: parts.major, minor: parts.minor + 1, patch: 0 };
  }
  return { ...parts, patch: parts.patch + 1 };
}

export function readVersionFile() {
  if (!existsSync(VERSION_FILE)) {
    throw new Error(`Missing ${VERSION_FILE}`);
  }
  /** @type {Record<string, string>} */
  const values = {};
  for (const line of readFileSync(VERSION_FILE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  const parts = {
    major: Number(values.major),
    minor: Number(values.minor),
    patch: Number(values.patch),
  };
  validateSemver(parts);
  return parts;
}

/** @param {{ major: number, minor: number, patch: number }} parts */
export function writeVersionFile(parts) {
  validateSemver(parts);
  writeFileSync(
    VERSION_FILE,
    [
      "# NOVA Chat semver — shared by BPG + SaaS flavors (plane suffix applied in Gradle).",
      "# Rule: 1.2.3b / 1.2.3s … patch 0–99, then 1.2.99* → 1.3.0*",
      `major=${parts.major}`,
      `minor=${parts.minor}`,
      `patch=${parts.patch}`,
      "",
    ].join("\n"),
  );
}

/** @param {"bpg"|"saas"} plane @param {{ major: number, minor: number, patch: number }} parts */
export function displayNameFor(plane, parts) {
  const suffix = PLANE_SUFFIX[plane];
  const version = formatPlaneVersion(parts, suffix);
  return plane === "bpg" ? `NOVA Chat BPG ${version}` : `NOVA Chat ${version}`;
}

function usage() {
  console.log(`Usage:
  node scripts/nova-chat-version.mjs show
  node scripts/nova-chat-version.mjs apply 1.2.3
  node scripts/nova-chat-version.mjs bump-patch

Examples:
  1.2.3b / 1.2.3s  → versionCode ${versionCodeFrom({ major: 1, minor: 2, patch: 3 })}
  1.2.99s → 1.3.0s after bump from 1.2.99`);
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "-h") {
    usage();
    return;
  }

  if (cmd === "show") {
    const parts = readVersionFile();
    const code = versionCodeFrom(parts);
    console.log(`semver: ${parts.major}.${parts.minor}.${parts.patch}`);
    console.log(`versionCode: ${code}`);
    console.log(`bpg: ${formatPlaneVersion(parts, "b")} — ${displayNameFor("bpg", parts)}`);
    console.log(`saas: ${formatPlaneVersion(parts, "s")} — ${displayNameFor("saas", parts)}`);
    return;
  }

  if (cmd === "apply") {
    if (!arg) throw new Error("apply requires version e.g. 1.2.3");
    const { major, minor, patch } = parsePlaneVersion(arg);
    writeVersionFile({ major, minor, patch });
    console.log(`Updated ${path.relative(process.cwd(), VERSION_FILE)} → ${major}.${minor}.${patch}`);
    console.log(`versionCode=${versionCodeFrom({ major, minor, patch })}`);
    return;
  }

  if (cmd === "bump-patch") {
    const next = bumpPatch(readVersionFile());
    writeVersionFile(next);
    console.log(
      `Bumped → ${next.major}.${next.minor}.${next.patch} (code ${versionCodeFrom(next)})`,
    );
    return;
  }

  usage();
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
