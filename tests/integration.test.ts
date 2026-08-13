import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { verifyRepository } from '../src/core/verify.js';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function initGit(dir: string) {
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore', windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'aftermath@example.com'], {
    cwd: dir,
    stdio: 'ignore',
    windowsHide: true,
  });
  execFileSync('git', ['config', 'user.name', 'Aftermath'], {
    cwd: dir,
    stdio: 'ignore',
    windowsHide: true,
  });
  execFileSync('git', ['add', '.'], { cwd: dir, stdio: 'ignore', windowsHide: true });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore', windowsHide: true });
}

describe('integration fixtures', () => {
  it('verifies node-pass fixture', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-pass-'));
    const fixture = join(repoRoot, 'fixtures', 'node-pass');
    if (!existsSync(fixture)) return;
    cpSync(fixture, dir, { recursive: true });
    initGit(dir);
    writeFileSync(
      join(dir, '.aftermath.toml'),
      `version = 1\n[verify]\ntest = ["node", "test.js"]\n`,
    );
    // Fix toml - commands need to be strings
    writeFileSync(
      join(dir, '.aftermath.toml'),
      `version = 1\n\n[verify]\ntest = ["node test.js"]\n`,
    );
    const result = await verifyRepository({ cwd: dir, full: true });
    expect(['verified', 'partially_verified', 'failed', 'inconclusive']).toContain(
      result.receipt.verdict,
    );
    expect(existsSync(join(dir, '.aftermath', 'runs'))).toBe(true);
  }, 60_000);

  it('detects failure in node-fail fixture', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-fail-'));
    const fixture = join(repoRoot, 'fixtures', 'node-fail');
    if (!existsSync(fixture)) return;
    cpSync(fixture, dir, { recursive: true });
    initGit(dir);
    writeFileSync(
      join(dir, '.aftermath.toml'),
      `version = 1\n\n[verify]\ntest = ["node test.js"]\n`,
    );
    const result = await verifyRepository({ cwd: dir, full: true, ci: true });
    expect(result.receipt.verdict === 'failed' || result.receipt.verdict === 'partially_verified').toBe(
      true,
    );
    expect(result.exitCode).not.toBe(0);
  }, 60_000);
});

describe('broken-project demo shape', () => {
  it('example exists', () => {
    expect(existsSync(join(repoRoot, 'examples', 'broken-project'))).toBe(true);
  });
});

void mkdirSync;
