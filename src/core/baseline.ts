import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { executeCommand } from './execute.js';
import { snapshotDependencies } from './findings.js';
import { collectDiffSummary, collectGitState, gitVersion } from './git.js';
import { buildVerificationPlan } from './plan.js';
import { aftermathVersion, ensureAftermathDirs, safeReadJson, writeJson } from './storage.js';
import type { BaselineOptions, BaselineSnapshot, CommandResult } from './types.js';
import { SCHEMA_VERSION } from './types.js';

export async function createBaseline(options: BaselineOptions = {}): Promise<{
  baseline: BaselineSnapshot;
  path: string;
  overwritten: boolean;
}> {
  const cwd = options.cwd ?? process.cwd();
  const dirs = ensureAftermathDirs(cwd);
  if (existsSync(dirs.baseline) && !options.force) {
    throw new Error(
      `Baseline already exists at ${dirs.baseline}. Re-run with --force to overwrite explicitly.`,
    );
  }

  const { config } = loadConfig(cwd);
  const git = await collectGitState(cwd);
  const diff = await collectDiffSummary(cwd, git);
  const plan = buildVerificationPlan({ cwd, config, diff, full: true });
  const runDir = join(dirs.cache, 'baseline-run');

  const checks: CommandResult[] = [];
  for (const planned of plan.commands.filter((c) => !c.destructive)) {
    if (options.cancelSignal?.aborted) break;
    checks.push(
      await executeCommand(planned, {
        runDir,
        config,
        cancelSignal: options.cancelSignal,
      }),
    );
  }

  const warnings = checks.reduce((sum, c) => sum + (Number(c.metrics?.warnings) || 0), 0);
  const passed = checks.reduce((sum, c) => sum + (Number(c.metrics?.passed) || 0), 0);
  const failed = checks.reduce((sum, c) => sum + (Number(c.metrics?.failed) || 0), 0);
  const skipped = checks.reduce((sum, c) => sum + (Number(c.metrics?.skipped) || 0), 0);
  const totals = checks.map((c) => Number(c.metrics?.total) || 0);
  const total = totals.some((n) => n > 0) ? totals.reduce((a, b) => a + b, 0) : passed + failed + skipped;

  const artifacts = [];
  for (const art of config.artifact ?? []) {
    const path = join(cwd, art.path);
    if (!existsSync(path)) continue;
    artifacts.push({ name: art.name, path: art.path, bytes: statSync(path).size });
  }

  const deps = snapshotDependencies(cwd);

  const baseline: BaselineSnapshot = {
    schemaVersion: SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    repository: {
      root: cwd,
      head: git.head,
      branch: git.branch,
    },
    checks: checks.map((c) => ({
      kind: c.kind,
      name: c.name,
      status: c.status,
      metrics: c.metrics,
    })),
    warnings,
    testCounts: {
      total: total || undefined,
      passed: passed || undefined,
      failed: failed || undefined,
      skipped: skipped || undefined,
    },
    dependencies: deps
      ? {
          directCount: deps.directCount,
          fingerprint: deps.fingerprint,
        }
      : undefined,
    artifacts,
    benchmarks: checks
      .filter((c) => c.kind === 'benchmark' && typeof c.metrics?.value === 'number')
      .map((c) => ({
        name: c.name,
        metric: String(c.metrics?.metric ?? 'value'),
        value: Number(c.metrics?.value),
      })),
  };

  writeJson(dirs.baseline, baseline);
  return { baseline, path: dirs.baseline, overwritten: Boolean(options.force) };
}

export function loadBaseline(cwd: string): BaselineSnapshot | null {
  const dirs = ensureAftermathDirs(cwd);
  return safeReadJson<BaselineSnapshot>(dirs.baseline);
}

export async function captureEnvironment(cwd: string) {
  return {
    os: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    aftermathVersion: aftermathVersion(),
    gitVersion: await gitVersion(cwd),
    toolVersions: {} as Record<string, string>,
  };
}
