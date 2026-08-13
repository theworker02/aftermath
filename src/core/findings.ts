import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  AftermathConfig,
  BaselineSnapshot,
  CommandResult,
  DiffSummary,
  Finding,
  FindingCode,
} from './types.js';
import { FINDING_TITLES } from './types.js';
import { parseLogLocations, primaryLogLocation, topErrorLines } from './locations.js';

let findingCounter = 0;

export function resetFindingCounter(): void {
  findingCounter = 0;
}

function nextFindingId(code: FindingCode): string {
  findingCounter += 1;
  return `${code}-${String(findingCounter).padStart(3, '0')}`;
}

export function makeFinding(
  code: FindingCode,
  severity: Finding['severity'],
  message: string,
  evidence: Record<string, unknown>,
  extras?: Partial<Finding>,
): Finding {
  return {
    id: nextFindingId(code),
    code,
    title: FINDING_TITLES[code],
    severity,
    message,
    evidence,
    ...extras,
  };
}

function readLog(path?: string): string {
  if (!path || !existsSync(path)) return '';
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** Attach file:line navigation and top error lines from check logs. */
export function enrichFindingFromLogs(finding: Finding, check: CommandResult): Finding {
  const stdout = readLog(check.stdoutPath);
  const stderr = readLog(check.stderrPath);
  const location = primaryLogLocation(stdout, stderr);
  const locations = parseLogLocations([stderr, stdout].filter(Boolean).join('\n'), 8);
  const files = [
    ...new Set([...(finding.relatedFiles ?? []), ...locations.map((l) => l.file)]),
  ].slice(0, 20);
  const errors = topErrorLines(stdout, stderr, 10);
  return {
    ...finding,
    ...(location ? { location } : {}),
    relatedFiles: files.length ? files : finding.relatedFiles,
    evidence: {
      ...finding.evidence,
      ...(location
        ? {
            location: {
              file: location.file,
              line: location.line ?? null,
              column: location.column ?? null,
            },
          }
        : {}),
      ...(errors.length ? { topErrorLines: errors } : {}),
    },
  };
}

export function analyzeFindings(opts: {
  checks: CommandResult[];
  baseline: BaselineSnapshot | null;
  config: AftermathConfig;
  diff: DiffSummary;
  cwd: string;
}): Finding[] {
  resetFindingCounter();
  const findings: Finding[] = [];

  for (const check of opts.checks) {
    if (check.status === 'fail' || check.status === 'timeout') {
      let finding: Finding | null = null;
      if (check.kind === 'test') {
        finding = makeFinding(
          'AF001',
          'error',
          `${check.name} failed${check.exitCode != null ? ` (exit ${check.exitCode})` : ''}.`,
          {
            command: [check.command, ...check.args].join(' '),
            exitCode: check.exitCode,
            status: check.status,
            metrics: check.metrics ?? {},
          },
          { relatedChecks: [check.id] },
        );
      } else if (check.kind === 'build') {
        finding = makeFinding(
          'AF002',
          'error',
          `Build check ${check.name} failed.`,
          {
            command: [check.command, ...check.args].join(' '),
            exitCode: check.exitCode,
            status: check.status,
          },
          { relatedChecks: [check.id] },
        );
      } else if (check.kind === 'typecheck') {
        finding = makeFinding(
          'AF011',
          'error',
          `Typecheck ${check.name} failed.`,
          { exitCode: check.exitCode, status: check.status },
          { relatedChecks: [check.id] },
        );
      } else if (check.kind === 'lint') {
        finding = makeFinding(
          'AF012',
          'error',
          `Lint check ${check.name} failed.`,
          { exitCode: check.exitCode, status: check.status },
          { relatedChecks: [check.id] },
        );
      } else if (check.kind === 'smoke') {
        finding = makeFinding(
          'AF010',
          'error',
          `Smoke test ${check.name} failed.`,
          { exitCode: check.exitCode, status: check.status },
          { relatedChecks: [check.id] },
        );
      }
      if (finding) findings.push(enrichFindingFromLogs(finding, check));
    }
  }

  // Warning delta vs baseline
  const currentWarnings = sumMetric(opts.checks, 'warnings');
  if (opts.baseline) {
    const baseWarnings = opts.baseline.warnings ?? 0;
    if (currentWarnings > baseWarnings && !(opts.config.policy?.allow_new_warnings ?? false)) {
      findings.push(
        makeFinding('AF003', 'warning', 'New lint/tool warnings detected vs baseline.', {
          baseline: baseWarnings,
          current: currentWarnings,
          new: currentWarnings - baseWarnings,
        }),
      );
    }

    const baseTests = opts.baseline.testCounts?.total;
    const currentTests = sumMetric(opts.checks, 'total') || sumPassedFailed(opts.checks);
    if (
      baseTests != null &&
      currentTests != null &&
      currentTests < baseTests &&
      !(opts.config.policy?.allow_removed_tests ?? false)
    ) {
      findings.push(
        makeFinding('AF005', 'warning', 'Test surface decreased vs baseline.', {
          before: baseTests,
          after: currentTests,
          difference: currentTests - baseTests,
        }),
      );
    }

    const baseAssertions = opts.baseline.testCounts?.assertions;
    const currentAssertions = estimateAssertions(opts.cwd, opts.diff);
    if (
      baseAssertions != null &&
      currentAssertions != null &&
      currentAssertions < baseAssertions &&
      !(opts.config.policy?.allow_assertion_reduction ?? false)
    ) {
      findings.push(
        makeFinding(
          'AF006',
          'warning',
          'Possible assertion reduction (verification weakening).',
          {
            before: baseAssertions,
            after: currentAssertions,
            difference: currentAssertions - baseAssertions,
          },
        ),
      );
    }

    const depDrift = analyzeDependencyDrift(opts.cwd, opts.baseline, opts.diff);
    if (depDrift) findings.push(depDrift);

    // Artifact growth
    for (const art of opts.config.artifact ?? []) {
      const base = opts.baseline.artifacts?.find((a) => a.name === art.name);
      const currentPath = join(opts.cwd, art.path);
      if (!base || !existsSync(currentPath)) continue;
      try {
        const size = statSync(currentPath).size;
        const growth = ((size - base.bytes) / Math.max(base.bytes, 1)) * 100;
        const limit = art.max_growth_percent ?? 20;
        if (growth > limit) {
          findings.push(
            makeFinding('AF008', 'warning', `Artifact ${art.name} grew beyond threshold.`, {
              baselineBytes: base.bytes,
              currentBytes: size,
              growthPercent: Number(growth.toFixed(1)),
              thresholdPercent: limit,
            }),
          );
        }
      } catch {
        // ignore
      }
    }

    // Benchmark regression
    for (const check of opts.checks.filter((c) => c.kind === 'benchmark' && c.status === 'pass')) {
      const base = opts.baseline.benchmarks?.find((b) => b.name === check.name);
      const cfg = opts.config.benchmark?.find((b) => b.name === check.name);
      const currentVal = Number(check.metrics?.value);
      if (!base || !cfg || !Number.isFinite(currentVal)) continue;
      const direction = cfg.direction ?? 'higher';
      const delta =
        direction === 'higher'
          ? ((currentVal - base.value) / Math.max(base.value, 1)) * 100
          : ((base.value - currentVal) / Math.max(base.value, 1)) * 100;
      const threshold = -(cfg.regression_threshold_percent ?? 10);
      if (delta < threshold) {
        findings.push(
          makeFinding('AF007', 'warning', `Benchmark ${check.name} regressed.`, {
            baseline: base.value,
            current: currentVal,
            regressionPercent: Number(delta.toFixed(1)),
            metric: cfg.metric,
          }),
        );
      }
    }
  }

  // API drift heuristic from diff (public export removals)
  const apiFinding = detectApiBreaks(opts.cwd, opts.diff);
  if (apiFinding) findings.push(apiFinding);

  return findings;
}

function sumMetric(checks: CommandResult[], key: string): number {
  let total = 0;
  for (const c of checks) {
    const v = c.metrics?.[key];
    if (typeof v === 'number') total += v;
  }
  return total;
}

function sumPassedFailed(checks: CommandResult[]): number | null {
  const passed = sumMetric(checks, 'passed');
  const failed = sumMetric(checks, 'failed');
  const skipped = sumMetric(checks, 'skipped');
  if (passed + failed + skipped === 0) return null;
  return passed + failed + skipped;
}

function estimateAssertions(cwd: string, diff: DiffSummary): number | null {
  let count = 0;
  let examined = 0;
  for (const file of diff.files.filter((f) => f.category === 'tests')) {
    const abs = join(cwd, file.path);
    if (!existsSync(abs)) continue;
    try {
      const text = readFileSync(abs, 'utf8');
      const matches = text.match(/\b(expect\(|assert_|assert\(|assertEquals|assert_eq!)/g);
      count += matches?.length ?? 0;
      examined += 1;
    } catch {
      // ignore
    }
  }
  return examined > 0 ? count : null;
}

export interface DependencySnapshot {
  directCount: number;
  fingerprint: string;
  manifests: string[];
  lockfiles: string[];
  names: string[];
}

export function snapshotDependencies(cwd: string): DependencySnapshot | null {
  const manifests: string[] = [];
  const lockfiles: string[] = [];
  const names = new Set<string>();

  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    manifests.push('package.json');
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };
      for (const n of Object.keys(pkg.dependencies ?? {})) names.add(n);
      for (const n of Object.keys(pkg.devDependencies ?? {})) names.add(n);
      for (const n of Object.keys(pkg.peerDependencies ?? {})) names.add(n);
    } catch {
      // ignore parse errors
    }
  }
  for (const lock of ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb']) {
    if (existsSync(join(cwd, lock))) lockfiles.push(lock);
  }

  const cargo = join(cwd, 'Cargo.toml');
  if (existsSync(cargo)) {
    manifests.push('Cargo.toml');
    const text = readFileSync(cargo, 'utf8');
    const depsSection = text.split(/\[dependencies\]/)[1]?.split(/^\[/m)[0] ?? '';
    for (const line of depsSection.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/);
      if (m?.[1]) names.add(m[1]);
    }
  }
  if (existsSync(join(cwd, 'Cargo.lock'))) lockfiles.push('Cargo.lock');

  const gomod = join(cwd, 'go.mod');
  if (existsSync(gomod)) {
    manifests.push('go.mod');
    const text = readFileSync(gomod, 'utf8');
    for (const m of text.matchAll(/^\s*([^\s]+)\s+v/gm)) {
      if (m[1]) names.add(m[1]);
    }
  }
  if (existsSync(join(cwd, 'go.sum'))) lockfiles.push('go.sum');

  if (!manifests.length && !lockfiles.length) return null;

  const sorted = [...names].sort();
  const fingerprint = `${sorted.length}:${sorted.join(',')}|locks:${lockfiles.join(',')}`;
  return {
    directCount: sorted.length,
    fingerprint,
    manifests,
    lockfiles,
    names: sorted,
  };
}

function analyzeDependencyDrift(
  cwd: string,
  baseline: BaselineSnapshot,
  diff: DiffSummary,
): Finding | null {
  const current = snapshotDependencies(cwd);
  const baseCount = baseline.dependencies?.directCount;
  if (!current || baseCount == null) return null;

  const changedManifests = diff.files
    .filter(
      (f) =>
        f.category === 'dependencies' ||
        f.category === 'lockfile' ||
        /package\.json|Cargo\.toml|go\.mod|requirements|Gemfile|pyproject/i.test(f.path),
    )
    .map((f) => f.path);

  const lockfileTouched = diff.files
    .filter((f) => f.category === 'lockfile' || /lock/i.test(f.path))
    .map((f) => f.path);

  if (current.directCount <= baseCount && lockfileTouched.length === 0) {
    return null;
  }

  if (current.directCount > baseCount) {
    return makeFinding(
      'AF009',
      'info',
      `Direct dependency count increased (${baseCount} → ${current.directCount}).`,
      {
        before: baseCount,
        after: current.directCount,
        difference: current.directCount - baseCount,
        baselineFingerprint: baseline.dependencies?.fingerprint ?? null,
        currentFingerprint: current.fingerprint,
        manifests: current.manifests,
        lockfiles: current.lockfiles,
        changedManifests,
        lockfileTouched,
        sampleNames: current.names.slice(0, 40),
      },
      { relatedFiles: [...new Set([...changedManifests, ...lockfileTouched])].slice(0, 20) },
    );
  }

  if (lockfileTouched.length > 0) {
    return makeFinding(
      'AF009',
      'info',
      'Dependency lockfile(s) changed without a net increase in direct dependency count.',
      {
        before: baseCount,
        after: current.directCount,
        difference: current.directCount - baseCount,
        baselineFingerprint: baseline.dependencies?.fingerprint ?? null,
        currentFingerprint: current.fingerprint,
        manifests: current.manifests,
        lockfiles: current.lockfiles,
        lockfileTouched,
        changedManifests,
      },
      { relatedFiles: lockfileTouched.slice(0, 20) },
    );
  }

  return null;
}

function detectApiBreaks(cwd: string, diff: DiffSummary): Finding | null {
  void cwd;
  void diff;
  // Actual patch scanning happens in verify via detectApiBreaksFromPatch
  return null;
}

function collectExportNames(patch: string, removed: boolean): Set<string> {
  const names = new Set<string>();
  const prefix = removed ? '-' : '+';
  const lines = patch.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith(prefix) || line.startsWith('---') || line.startsWith('+++')) continue;
    const body = line.slice(1);

    let m = body.match(
      /^\s*export\s+(?:async\s+)?(?:function|class|const|type|interface|enum)\s+([A-Za-z0-9_]+)/,
    );
    if (m?.[1]) {
      names.add(m[1]);
      continue;
    }

    m = body.match(/^\s*export\s+\{([^}]+)\}/);
    if (m?.[1]) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name);
      }
      continue;
    }

    m = body.match(/^\s*(?:module\.)?exports\.([A-Za-z0-9_]+)\s*=/);
    if (m?.[1]) {
      names.add(m[1]);
      continue;
    }

    m = body.match(/^\s*pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type|const)\s+([A-Za-z0-9_]+)/);
    if (m?.[1]) names.add(m[1]);
  }
  return names;
}

export function detectApiBreaksFromPatch(patch: string): Finding | null {
  const removedNames = collectExportNames(patch, true);
  const addedNames = collectExportNames(patch, false);
  const relatedFiles = new Set<string>();

  for (const m of patch.matchAll(/^\+\+\+\s+b\/(.+)$/gm)) {
    const p = m[1];
    if (p && /\.(ts|tsx|js|mjs|cjs|mts|cts|rs|go|py)$/.test(p)) relatedFiles.add(p);
  }

  const gone = [...removedNames].filter((n) => !addedNames.has(n)).sort();
  const added = [...addedNames].filter((n) => !removedNames.has(n)).sort();
  if (gone.length === 0) return null;

  return makeFinding(
    'AF004',
    'warning',
    `Possible public API removals detected (${gone.length} symbol${gone.length === 1 ? '' : 's'}).`,
    {
      removed: gone,
      added,
      changed: gone.length,
      languages: ['js/ts exports', 'CommonJS exports', 'Rust pub items'],
      note: 'Heuristic diff analysis — confirm before treating as a breaking release.',
    },
    { relatedFiles: [...relatedFiles].slice(0, 20) },
  );
}
