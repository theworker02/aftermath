#!/usr/bin/env node
/**
 * Agent stop hook — lightweight observation only (cross-platform).
 * Invoked via: node ./scripts/hooks/agent-stop.mjs
 * Marks that verification is available; does not auto-run full suites.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const cwd = process.env.CURSOR_PROJECT_DIR || process.cwd();
const outDir = join(cwd, '.aftermath', 'cache');
mkdirSync(outDir, { recursive: true });
writeFileSync(
  join(outDir, 'agent-stop.json'),
  `${JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      node: process.execPath,
      platform: process.platform,
      hint: 'Run /aftermath-verify or `aftermath status` — do not trust the completion message alone.',
    },
    null,
    2,
  )}\n`,
);

process.stdout.write(
  JSON.stringify({
    continue: true,
    message:
      'Aftermath: agent stop observed. Verification available via /aftermath-verify (not auto-executed).',
  }),
);
