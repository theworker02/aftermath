#!/usr/bin/env node
/**
 * Lightweight session start hook (cross-platform).
 * Invoked via: node ./scripts/hooks/session-start.mjs
 * Uses process.execPath-compatible Node; does NOT run expensive suites.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.env.CURSOR_PROJECT_DIR || process.cwd();
const outDir = join(cwd, '.aftermath', 'cache');

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();
  } catch {
    return null;
  }
}

mkdirSync(outDir, { recursive: true });
const payload = {
  capturedAt: new Date().toISOString(),
  node: process.execPath,
  platform: process.platform,
  head: git(['rev-parse', 'HEAD']),
  branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  status: git(['status', '--porcelain']),
};
writeFileSync(join(outDir, 'session-start.json'), `${JSON.stringify(payload, null, 2)}\n`);
process.stdout.write(
  JSON.stringify({
    continue: true,
    message: 'Aftermath session state captured. Run /aftermath-verify after agent changes.',
  }),
);
