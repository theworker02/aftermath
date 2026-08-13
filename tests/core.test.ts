import { describe, expect, it } from 'vitest';
import { categorizePath } from '../src/core/git.js';
import { detectEcosystems } from '../src/core/detect.js';
import { buildVerificationPlan, isDestructiveLine, splitCommand } from '../src/core/plan.js';
import { redactSecrets, truncateText } from '../src/core/redaction.js';
import { extractMetrics } from '../src/core/execute.js';
import { detectApiBreaksFromPatch, makeFinding, resetFindingCounter } from '../src/core/findings.js';
import { formatVerdict, renderConsoleSummary, renderHtmlReceipt } from '../src/core/receipt.js';
import { defaultConfig } from '../src/core/config.js';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Receipt } from '../src/core/types.js';

describe('categorizePath', () => {
  it('classifies common paths', () => {
    expect(categorizePath('src/main.rs')).toBe('source');
    expect(categorizePath('tests/foo.rs')).toBe('tests');
    expect(categorizePath('README.md')).toBe('docs');
    expect(categorizePath('package-lock.json')).toBe('lockfile');
    expect(categorizePath('.github/workflows/ci.yml')).toBe('ci');
    expect(categorizePath('assets/logo.svg')).toBe('assets');
  });
});

describe('detectEcosystems', () => {
  it('detects node package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }));
    const ecos = detectEcosystems(dir);
    expect(ecos.some((e) => e.id === 'node')).toBe(true);
  });

  it('detects rust Cargo.toml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-'));
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname="x"\nversion="0.1.0"\n');
    const ecos = detectEcosystems(dir);
    expect(ecos.some((e) => e.id === 'rust')).toBe(true);
  });
});

describe('command discovery', () => {
  it('prefers package scripts that exist and does not invent npm test', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { lint: 'eslint .' } }),
    );
    const plan = buildVerificationPlan({
      cwd: dir,
      config: defaultConfig(),
      diff: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { source: 1 },
        files: [{ path: 'src/a.ts', category: 'source', status: 'modified' }],
      },
      full: true,
    });
    expect(plan.commands.some((c) => c.name === 'lint')).toBe(true);
    expect(plan.commands.some((c) => c.name === 'test')).toBe(false);
  });

  it('tokenizes commands without shell injection', () => {
    expect(splitCommand('cargo test --workspace')).toEqual({
      command: 'cargo',
      args: ['test', '--workspace'],
    });
  });

  it('flags destructive lines', () => {
    expect(isDestructiveLine('sudo rm -rf /')).toBe(true);
    expect(isDestructiveLine('cargo test')).toBe(false);
  });
});

describe('redaction and truncation', () => {
  it('redacts common secrets', () => {
    const text = 'Authorization: Bearer abcdefghijklmnop token=sk-abcdefghijklmnopqrstuv';
    const out = redactSecrets(text);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('abcdefghijklmnop');
  });

  it('truncates oversized logs with metadata', () => {
    const big = 'x'.repeat(1000);
    const out = truncateText(big, 100);
    expect(out.truncated).toBe(true);
    expect(out.text).toContain('truncated');
  });
});

describe('parsers and findings', () => {
  it('parses cargo-like test metrics', () => {
    const m = extractMetrics('test', 'test result: FAILED. 3 passed; 2 failed; 1 ignored');
    expect(m.passed).toBe(3);
    expect(m.failed).toBe(2);
    expect(m.skipped).toBe(1);
  });

  it('detects API removals from patch', () => {
    resetFindingCounter();
    const finding = detectApiBreaksFromPatch(
      `-export function publicApi() {}\n+export function other() {}\n`,
    );
    expect(finding?.code).toBe('AF004');
  });

  it('creates stable finding ids', () => {
    resetFindingCounter();
    const a = makeFinding('AF001', 'error', 'x', {});
    const b = makeFinding('AF002', 'error', 'y', {});
    expect(a.id).toBe('AF001-001');
    expect(b.id).toBe('AF002-002');
  });
});

describe('receipt formatting', () => {
  it('formats verdicts', () => {
    expect(formatVerdict('partially_verified')).toBe('PARTIALLY VERIFIED');
  });

  it('renders console summary', () => {
    const receipt = {
      schemaVersion: 1,
      id: 'run_0001',
      runNumber: 1,
      createdAt: new Date().toISOString(),
      verdict: 'failed',
      repository: { root: '/tmp', name: 'demo' },
      git: {
        head: 'abc',
        branch: 'main',
        dirty: true,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        changeFingerprint: 'deadbeef',
      },
      change: {
        filesChanged: 2,
        insertions: 10,
        deletions: 1,
        byCategory: { source: 2 },
        files: [],
      },
      environment: {
        os: 'win32',
        arch: 'x64',
        nodeVersion: process.version,
        aftermathVersion: '0.1.0',
        toolVersions: {},
      },
      plan: { createdAt: '', full: false, ecosystems: [], commands: [], notes: [] },
      checks: [
        {
          id: 't',
          kind: 'test',
          name: 'test',
          command: 'npm',
          args: ['test'],
          cwd: '/tmp',
          status: 'fail',
          exitCode: 1,
          durationMs: 10,
          truncated: false,
          started: true,
          summary: '2 failed',
        },
      ],
      findings: [],
      artifacts: [],
      repairAttempts: 1,
      notes: [],
    } as Receipt;
    const text = renderConsoleSummary(receipt);
    expect(text).toContain('AFTERMATH');
    expect(text).toContain('FAILED');
    expect(text).toContain('Most important failure');
    expect(text).toContain('Category summary');
    expect(text).toContain('Repair attempts: 1');
  });
});

describe('makefile and CI discovery', () => {
  it('discovers Makefile test target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-make-'));
    writeFileSync(join(dir, 'Makefile'), 'test:\n\t@echo ok\nlint:\n\t@echo lint\n');
    const plan = buildVerificationPlan({
      cwd: dir,
      config: defaultConfig(),
      diff: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { source: 1 },
        files: [{ path: 'main.c', category: 'source', status: 'modified' }],
      },
      full: true,
    });
    expect(plan.commands.some((c) => c.name === 'make-test')).toBe(true);
    expect(plan.commands.some((c) => c.name === 'make-lint')).toBe(true);
  });

  it('extracts multiline CI run blocks and skips setup-only', async () => {
    const { extractCiRunLines } = await import('../src/core/plan.js');
    const yaml = `
jobs:
  build:
    steps:
      - run: npm ci
      - run: |
          npm test
      - run: "npm run lint"
`;
    const lines = extractCiRunLines(yaml);
    expect(lines).toContain('npm test');
    expect(lines).toContain('npm run lint');
    expect(lines).toContain('npm ci');
  });

  it('adds dependency-aware plan notes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-deps-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
    const plan = buildVerificationPlan({
      cwd: dir,
      config: defaultConfig(),
      diff: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { lockfile: 1 },
        files: [{ path: 'package-lock.json', category: 'lockfile', status: 'modified' }],
      },
      full: false,
    });
    expect(plan.notes.some((n) => /Dependency\/lockfile/i.test(n))).toBe(true);
  });
});

describe('compare and repair state', () => {
  it('compares baseline to a receipt with concrete deltas', async () => {
    const { compareBaselineToReceipt } = await import('../src/core/compare.js');
    const baseline = {
      schemaVersion: 1 as const,
      createdAt: new Date().toISOString(),
      repository: { root: '/tmp', head: 'a', branch: 'main' },
      checks: [{ kind: 'test' as const, name: 'test', status: 'pass' as const }],
      warnings: 0,
      testCounts: { total: 10, passed: 10, failed: 0 },
      dependencies: { directCount: 2 },
    };
    const receipt = {
      schemaVersion: 1,
      id: 'run_0002',
      runNumber: 2,
      createdAt: new Date().toISOString(),
      verdict: 'failed',
      repository: { root: '/tmp', name: 'demo' },
      git: {
        head: 'b',
        branch: 'main',
        dirty: true,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        changeFingerprint: 'fp',
      },
      change: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: {},
        files: [],
      },
      environment: {
        os: 'win32',
        arch: 'x64',
        nodeVersion: process.version,
        aftermathVersion: '0.2.0',
        toolVersions: {},
      },
      plan: { createdAt: '', full: false, ecosystems: [], commands: [], notes: [] },
      checks: [
        {
          id: 't',
          kind: 'test',
          name: 'test',
          command: 'npm',
          args: ['test'],
          cwd: '/tmp',
          status: 'fail',
          exitCode: 1,
          durationMs: 1,
          truncated: false,
          started: true,
          summary: 'failed',
          metrics: { total: 9, passed: 8, failed: 1, warnings: 2 },
        },
      ],
      findings: [
        {
          id: 'AF001-001',
          code: 'AF001',
          title: 'TEST_FAILURE',
          severity: 'error',
          message: 'fail',
          evidence: {},
        },
      ],
      artifacts: [],
      repairAttempts: 0,
      notes: [],
    } as Receipt;
    const report = compareBaselineToReceipt(baseline, receipt);
    expect(report.comparedAgainst).toBe('run');
    expect(report.deltas.some((d) => d.metric === 'warnings' && d.direction === 'worse')).toBe(
      true,
    );
    expect(report.checkStatusChanges.some((c) => c.name === 'test')).toBe(true);
    expect(report.highlights.length).toBeGreaterThan(0);
  });

  it('tracks repair attempts per fingerprint', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-repair-'));
    const { recordRepairAttempt, getRepairAttempts } = await import('../src/core/repair-state.js');
    expect(getRepairAttempts(dir, 'abc')).toBe(0);
    expect(recordRepairAttempt(dir, 'abc', 1, 'first')).toBe(1);
    expect(recordRepairAttempt(dir, 'abc', 2, 'second')).toBe(2);
    expect(getRepairAttempts(dir, 'abc')).toBe(2);
    expect(getRepairAttempts(dir, 'other')).toBe(0);
  });
});

describe('docs-only scope', () => {
  it('skips benchmarks on docs-only changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-'));
    mkdirSync(join(dir, 'docs'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'a.md'), '# hi');
    const config = defaultConfig();
    config.benchmark = [
      { name: 'slow', command: 'echo 1', metric: 'ops', direction: 'higher' },
    ];
    const plan = buildVerificationPlan({
      cwd: dir,
      config,
      diff: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { docs: 1 },
        files: [{ path: 'docs/a.md', category: 'docs', status: 'modified' }],
      },
      full: false,
    });
    expect(plan.commands.some((c) => c.kind === 'benchmark')).toBe(false);
    expect(plan.notes.some((n) => /benchmark/i.test(n))).toBe(true);
  });
});

describe('phase 3 config validate', () => {
  it('accepts a valid .aftermath.toml', async () => {
    const { validateConfig, formatConfigValidation } = await import('../src/core/config.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-cfg-ok-'));
    writeFileSync(
      join(dir, '.aftermath.toml'),
      `version = 1\n\n[policy]\ntests_must_pass = true\nmax_repair_attempts = 2\n`,
    );
    const result = validateConfig(dir);
    expect(result.ok).toBe(true);
    expect(result.path).toContain('.aftermath.toml');
    expect(result.config.policy?.max_repair_attempts).toBe(2);
    expect(formatConfigValidation(result)).toContain('VALID');
  });

  it('rejects unknown keys and bad TOML', async () => {
    const { validateConfig } = await import('../src/core/config.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-cfg-bad-'));
    writeFileSync(join(dir, '.aftermath.toml'), `version = 1\nunknown_top = true\n`);
    const badKeys = validateConfig(dir);
    expect(badKeys.ok).toBe(false);
    expect(badKeys.errors.length).toBeGreaterThan(0);

    const dir2 = mkdtempSync(join(tmpdir(), 'aftermath-cfg-toml-'));
    writeFileSync(join(dir2, '.aftermath.toml'), `[policy\ntests_must_pass = true\n`);
    const badToml = validateConfig(dir2);
    expect(badToml.ok).toBe(false);
  });
});

describe('phase 3 summary and explain', () => {
  it('builds summary.json shape and SARIF', async () => {
    const { buildSummary, buildSarif } = await import('../src/core/summary.js');
    const { recommendedNextAction, explainReceipt } = await import('../src/core/repair.js');
    const receipt = {
      schemaVersion: 1,
      id: 'run_0003',
      runNumber: 3,
      createdAt: new Date().toISOString(),
      verdict: 'failed',
      repository: { root: '/tmp', name: 'demo' },
      git: {
        head: 'abc',
        branch: 'main',
        dirty: true,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        changeFingerprint: 'fp3',
      },
      change: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { source: 1 },
        files: [{ path: 'src/a.ts', category: 'source', status: 'modified' }],
      },
      environment: {
        os: 'win32',
        arch: 'x64',
        nodeVersion: process.version,
        aftermathVersion: '0.3.0',
        toolVersions: {},
      },
      plan: { createdAt: '', full: false, ecosystems: [], commands: [], notes: [] },
      checks: [
        {
          id: 't',
          kind: 'test',
          name: 'test',
          command: 'npm',
          args: ['test'],
          cwd: '/tmp',
          status: 'fail',
          exitCode: 1,
          durationMs: 10,
          truncated: false,
          started: true,
          summary: '2 failed',
        },
      ],
      findings: [
        {
          id: 'AF001-001',
          code: 'AF001',
          title: 'TEST_FAILURE',
          severity: 'error',
          message: 'fail',
          evidence: { exitCode: 1 },
        },
      ],
      artifacts: [],
      repairAttempts: 0,
      notes: [],
    } as Receipt;

    const summary = buildSummary(receipt);
    expect(summary.kind).toBe('aftermath.summary');
    expect(summary.verdict).toBe('failed');
    expect(summary.nextAction).toMatch(/repair/i);
    expect(summary.evidenceDir).toContain('0003');

    const sarif = buildSarif(receipt);
    expect(sarif.version).toBe('2.1.0');
    const runs = sarif.runs as Array<{ results: unknown[] }>;
    expect(runs[0]?.results.length).toBe(1);

    expect(recommendedNextAction(receipt)).toMatch(/repair-context|aftermath-repair/i);
    const explained = explainReceipt(receipt);
    expect(explained).toContain('Recommended next action');
    expect(explained).toContain('Observation');
  });

  it('detects CommonJS and Rust API removals', () => {
    resetFindingCounter();
    const cjs = detectApiBreaksFromPatch(
      `--- a/x.js\n+++ b/x.js\n-exports.legacyApi = function () {}\n+exports.other = function () {}\n`,
    );
    expect(cjs?.code).toBe('AF004');
    expect((cjs?.evidence.removed as string[]) ?? []).toContain('legacyApi');

    resetFindingCounter();
    const rust = detectApiBreaksFromPatch(
      `--- a/lib.rs\n+++ b/lib.rs\n-pub fn public_fn() {}\n+pub fn other_fn() {}\n`,
    );
    expect(rust?.code).toBe('AF004');
    expect((rust?.evidence.removed as string[]) ?? []).toContain('public_fn');
  });

  it('snapshots dependency drift evidence', async () => {
    const { snapshotDependencies, analyzeFindings } = await import('../src/core/findings.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-depsnap-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({
        name: 'x',
        dependencies: { a: '1', b: '2', c: '3' },
      }),
    );
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    const snap = snapshotDependencies(dir);
    expect(snap?.directCount).toBe(3);
    expect(snap?.lockfiles).toContain('package-lock.json');

    const findings = analyzeFindings({
      checks: [],
      baseline: {
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        repository: { root: dir, head: null, branch: null },
        checks: [],
        warnings: 0,
        dependencies: { directCount: 1, fingerprint: 'old' },
      },
      config: defaultConfig(),
      diff: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { dependencies: 1 },
        files: [{ path: 'package.json', category: 'dependencies', status: 'modified' }],
      },
      cwd: dir,
    });
    const af009 = findings.find((f) => f.code === 'AF009');
    expect(af009).toBeTruthy();
    expect(af009?.evidence.after).toBe(3);
    expect(af009?.evidence.currentFingerprint).toBeTruthy();
  });
});

describe('phase 4: latest alias, locations, html, prune, smoke ready', () => {
  it('resolves latest run alias', async () => {
    const { ensureAftermathDirs, resolveRunRef, writeJson } = await import('../src/core/storage.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-latest-'));
    const dirs = ensureAftermathDirs(dir);
    mkdirSync(join(dirs.runs, '0001'), { recursive: true });
    mkdirSync(join(dirs.runs, '0003'), { recursive: true });
    writeJson(join(dirs.runs, '0003', 'receipt.json'), {
      schemaVersion: 1,
      id: 'run_0003',
      runNumber: 3,
      createdAt: new Date().toISOString(),
      verdict: 'verified',
      repository: { root: dir, name: 'x' },
      git: {
        head: null,
        branch: null,
        dirty: false,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        changeFingerprint: 'abc',
      },
      change: { filesChanged: 0, insertions: 0, deletions: 0, byCategory: {}, files: [] },
      environment: {
        os: 'test',
        arch: 'x64',
        nodeVersion: process.version,
        aftermathVersion: '0.4.0',
        toolVersions: {},
      },
      plan: { createdAt: new Date().toISOString(), full: true, ecosystems: [], commands: [], notes: [] },
      checks: [],
      findings: [],
      artifacts: [],
      repairAttempts: 0,
      notes: [],
    });
    expect(resolveRunRef(dir, 'latest')).toBe(3);
    expect(resolveRunRef(dir, 'last')).toBe(3);
    expect(resolveRunRef(dir, 'run_0001')).toBe(1);
  });

  it('parses file:line locations from logs', async () => {
    const { parseLogLocations, primaryLogLocation } = await import('../src/core/locations.js');
    const text = `
Error: fail
  at Object.<anonymous> (src/pool.js:12:5)
src/main.ts:42:10 - error TS2304: Cannot find name 'x'.
`;
    const locs = parseLogLocations(text);
    expect(locs.some((l) => l.file.includes('pool.js') && l.line === 12)).toBe(true);
    expect(locs.some((l) => l.file.includes('main.ts') && l.line === 42)).toBe(true);
    expect(primaryLogLocation('', text)?.file).toMatch(/pool\.js|main\.ts/);
  });

  it('renders HTML receipt with verdict', () => {
    const receipt = {
      schemaVersion: 1 as const,
      id: 'run_0001',
      runNumber: 1,
      createdAt: '2026-08-13T00:00:00.000Z',
      verdict: 'failed' as const,
      repository: { root: '/tmp/x', name: 'x' },
      git: {
        head: 'abc',
        branch: 'main',
        dirty: true,
        stagedFiles: [],
        unstagedFiles: [],
        untrackedFiles: [],
        changeFingerprint: 'fp',
      },
      change: { filesChanged: 1, insertions: 2, deletions: 0, byCategory: { source: 1 }, files: [] },
      environment: {
        os: 'test',
        arch: 'x64',
        nodeVersion: 'v20',
        aftermathVersion: '0.4.0',
        toolVersions: {},
      },
      plan: { createdAt: '2026-08-13T00:00:00.000Z', full: true, ecosystems: [], commands: [], notes: [] },
      checks: [
        {
          id: 'test:1',
          kind: 'test' as const,
          name: 'test',
          command: 'npm',
          args: ['test'],
          cwd: '/tmp/x',
          status: 'fail' as const,
          exitCode: 1,
          durationMs: 10,
          truncated: false,
          started: true,
          summary: 'FAIL',
        },
      ],
      findings: [
        {
          id: 'AF001-001',
          code: 'AF001' as const,
          title: 'TEST_FAILURE',
          severity: 'error' as const,
          message: 'tests failed',
          evidence: {},
          location: { file: 'src/a.ts', line: 10 },
        },
      ],
      artifacts: [],
      repairAttempts: 0,
      notes: [],
    };
    const html = renderHtmlReceipt(receipt as Receipt);
    expect(html).toContain('AFTERMATH RECEIPT');
    expect(html).toContain('FAILED');
    expect(html).toContain('src/a.ts:10');
  });

  it('prunes oldest runs when over storage budget', async () => {
    const { ensureAftermathDirs, pruneRunStorage, writeText } = await import('../src/core/storage.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-prune-'));
    const dirs = ensureAftermathDirs(dir);
    for (const n of [1, 2, 3]) {
      const pad = String(n).padStart(4, '0');
      const runDir = join(dirs.runs, pad);
      mkdirSync(runDir, { recursive: true });
      // ~0.05 MB each of filler
      writeText(join(runDir, 'big.log'), 'x'.repeat(60_000));
    }
    const result = pruneRunStorage(dir, 0.1); // 0.1 MB budget → force prune
    expect(result.deletedRuns.length).toBeGreaterThan(0);
    expect(result.deletedRuns).not.toContain(3);
    expect(result.notes.some((n) => /Pruned run/i.test(n))).toBe(true);
  });

  it('passes smoke ready_pattern into the plan', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-smoke-'));
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'echo ok' } }),
    );
    const cfg = defaultConfig();
    cfg.smoke = [
      {
        name: 'api',
        command: 'node ./server.js',
        ready_pattern: 'listening',
        timeout_seconds: 5,
      },
    ];
    const plan = buildVerificationPlan({
      cwd: dir,
      config: cfg,
      diff: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { source: 1 },
        files: [{ path: 'src/a.js', category: 'source', status: 'modified' }],
      },
      full: true,
    });
    const smoke = plan.commands.find((c) => c.kind === 'smoke');
    expect(smoke?.readyPattern).toBe('listening');
  });

  it('terminates smoke process after ready_pattern match', async () => {
    const { executeCommand } = await import('../src/core/execute.js');
    const { ensureAftermathDirs, resolveRunDir } = await import('../src/core/storage.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-ready-'));
    ensureAftermathDirs(dir);
    const runDir = resolveRunDir(dir, 1);
    mkdirSync(runDir, { recursive: true });
    const script = join(dir, 'server.js');
    writeFileSync(
      script,
      [
        "console.log('booting');",
        'setInterval(() => {}, 1000);',
        "setTimeout(() => console.log('listening on :3000'), 50);",
      ].join('\n'),
    );
    const result = await executeCommand(
      {
        id: 'smoke:api',
        kind: 'smoke',
        name: 'api',
        command: process.execPath,
        args: [script],
        cwd: dir,
        timeoutSeconds: 5,
        source: 'smoke',
        mandatory: true,
        destructive: false,
        readyPattern: 'listening on :3000',
      },
      { runDir, config: defaultConfig() },
    );
    expect(result.status).toBe('pass');
    expect(result.metrics?.readyPatternMatched).toBe(true);
    expect(result.durationMs).toBeLessThan(4000);
  });

  it('formats status output', async () => {
    const { formatStatus, getAftermathStatus } = await import('../src/core/status.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-status-'));
    const status = getAftermathStatus(dir);
    const text = formatStatus(status);
    expect(text).toContain('AFTERMATH STATUS');
    expect(text).toContain('Baseline:');
    expect(status.latestRun).toBeNull();
  });

  it('enriches findings with locations from check logs', async () => {
    const { analyzeFindings } = await import('../src/core/findings.js');
    const dir = mkdtempSync(join(tmpdir(), 'aftermath-locfind-'));
    const log = join(dir, 'fail.stderr.log');
    writeFileSync(log, 'Error at src/broken.ts:7:3\nTypeError: boom\n');
    const findings = analyzeFindings({
      checks: [
        {
          id: 'test:1',
          kind: 'test',
          name: 'test',
          command: 'node',
          args: ['test.js'],
          cwd: dir,
          status: 'fail',
          exitCode: 1,
          durationMs: 1,
          truncated: false,
          started: true,
          stderrPath: log,
        },
      ],
      baseline: null,
      config: defaultConfig(),
      diff: {
        filesChanged: 1,
        insertions: 1,
        deletions: 0,
        byCategory: { source: 1 },
        files: [{ path: 'src/broken.ts', category: 'source', status: 'modified' }],
      },
      cwd: dir,
    });
    const af001 = findings.find((f) => f.code === 'AF001');
    expect(af001?.location?.file).toContain('broken.ts');
    expect(af001?.location?.line).toBe(7);
    expect(Array.isArray(af001?.evidence.topErrorLines)).toBe(true);
  });
});
