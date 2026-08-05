#!/usr/bin/env node
/**
 * Cross-platform Gradle wrapper runner for Capacitor Android builds.
 * Usage: node scripts/android-gradle.js assembleDebug|assembleRelease
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const task = process.argv[2] || 'assembleDebug';
const frontendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = join(frontendRoot, 'android');
const isWin = process.platform === 'win32';
const gradlew = join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');

if (!existsSync(gradlew)) {
  console.error(`Gradle wrapper not found: ${gradlew}`);
  process.exit(1);
}

const result = spawnSync(gradlew, [task], {
  cwd: androidDir,
  stdio: 'inherit',
  shell: isWin,
  env: process.env,
});

process.exit(result.status ?? 1);
