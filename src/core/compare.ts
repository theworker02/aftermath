import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadBaseline } from './baseline.js';
import { ensureAftermathDirs, loadReceiptJson, safeReadJson } from './storage.js';
import type { BaselineSnapshot, Receipt } from './types.js';

export type CompareDirection = 'better' | 'worse' | 'same' | 'unknown';

export interface CompareDelta {
  metric: string;
  baseline: number | string | null;
  current: number | string | null;
  delta: number | string | null;
  direction: CompareDirection;
}

export interface CompareReport {
  baselinePresent: boolean;
  baselineCreatedAt?: string;
  comparedAgainst: 'run' | 'none';
  runNumber?: number;
  verdict?: string;
  deltas: CompareDelta[];
  checkStatusChanges: Array<{
    name: string;
    kind: string;
    baseline?: string;
    current?: string;
  }>;
  findingSummary: { errors: number; warnings: number; info: number };
  highlights: string[];
}

/** Compare baseline against a specific run or the latest receipt. */
export function buildCompareReport(cwd: string, runRef?: string): CompareReport {
  const baseline = loadBaseline(cwd);
  if (!baseline) {
    return {
      baselinePresent: false,
      comparedAgainst: 'none',
      deltas: [],
      checkStatusChanges: [],
      findingSummary: { errors: 0, warnings: 0, info: 0 },
      highlights: ['No baseline present. Run `aftermath baseline` first.'],
    };
  }

  const receipt = resolveReceipt(cwd, runRef);
  if (!receipt) {
    return {
      baselinePresent: true,
      baselineCreatedAt: baseline.createdAt,
      comparedAgainst: 'none',
      deltas: metricsFromBaselineOnly(baseline),
      checkStatusChanges: [],
      findingSummary: { errors: 0, warnings: 0, info: 0 },
      highlights: [
        'Baseline is present, but no verification receipt was found to compare.',
        'Run `aftermath verify` then `aftermath compare` (or `aftermath compare <run>`).',
      ],
    };
  }

  return compareBaselineToReceipt(baseline, receipt);
}

export function compareWithBaseline(cwd: string, runRef?: string): string {
  return formatCompareReport(buildCompareReport(cwd, runRef));
}

export function compareBaselineToReceipt(
  baseline: BaselineSnapshot,
  receipt: Receipt,
): CompareReport {
  const currentWarnings = sumMetric(receipt.checks, 'warnings');
  const currentPassed = sumMetric(receipt.checks, 'passed');
  const currentFailed = sumMetric(receipt.checks, 'failed');
  const currentSkipped = sumMetric(receipt.checks, 'skipped');
  const currentTotal =
    sumMetric(receipt.checks, 'total') ||
    (currentPassed + currentFailed + currentSkipped > 0
      ? currentPassed + currentFailed + currentSkipped
      : null);

  const currentDeps = countDepsFromReceipt(receipt) ?? countDepsFromCwd(receipt.repository.root);

  const deltas: CompareDelta[] = [
    numericDelta('warnings', baseline.warnings ?? 0, currentWarnings, 'lower-better'),
    numericDelta(
      'tests.total',
      baseline.testCounts?.total ?? null,
      currentTotal,
      'higher-better',
    ),
    numericDelta(
      'tests.passed',
      baseline.testCounts?.passed ?? null,
      currentPassed || null,
      'higher-better',
    ),
    numericDelta(
      'tests.failed',
      baseline.testCounts?.failed ?? 0,
      currentFailed,
      'lower-better',
    ),
    numericDelta(
      'dependencies.direct',
      baseline.dependencies?.directCount ?? null,
      currentDeps,
      'neutral',
    ),
  ];

  const checkStatusChanges = diffCheckStatuses(baseline, receipt);
  const findingSummary = {
    errors: receipt.findings.filter((f) => f.severity === 'error').length,
    warnings: receipt.findings.filter((f) => f.severity === 'warning').length,
    info: receipt.findings.filter((f) => f.severity === 'info').length,
  };

  const highlights = buildHighlights(deltas, checkStatusChanges, findingSummary, receipt);

  return {
    baselinePresent: true,
    baselineCreatedAt: baseline.createdAt,
    comparedAgainst: 'run',
    runNumber: receipt.runNumber,
    verdict: receipt.verdict,
    deltas,
    checkStatusChanges,
    findingSummary,
    highlights,
  };
}

export function formatCompareReport(report: CompareReport): string {
  const lines: string[] = ['AFTERMATH COMPARE', ''];

  if (!report.baselinePresent) {
    lines.push(...report.highlights);
    return lines.join('\n');
  }

  lines.push(`Baseline created: ${report.baselineCreatedAt ?? 'unknown'}`);
  if (report.comparedAgainst === 'run') {
    lines.push(
      `Compared against: run #${report.runNumber} (verdict: ${String(report.verdict).toUpperCase()})`,
    );
  } else {
    lines.push('Compared against: (no run)');
  }
  lines.push('');

  lines.push('Metric deltas:');
  for (const d of report.deltas) {
    const arrow =
      d.direction === 'worse' ? '↑ worse' : d.direction === 'better' ? '↓ better' : d.direction;
    lines.push(
      `- ${d.metric}: baseline=${fmt(d.baseline)} current=${fmt(d.current)} delta=${fmt(d.delta)} (${arrow})`,
    );
  }

  lines.push('', 'Check status changes:');
  if (!report.checkStatusChanges.length) {
    lines.push('- none (or insufficient overlapping check names)');
  } else {
    for (const c of report.checkStatusChanges) {
      lines.push(
        `- ${c.kind}/${c.name}: ${c.baseline ?? '—'} → ${c.current ?? '—'}`,
      );
    }
  }

  lines.push(
    '',
    'Findings on compared run:',
    `- errors: ${report.findingSummary.errors}`,
    `- warnings: ${report.findingSummary.warnings}`,
    `- info: ${report.findingSummary.info}`,
    '',
    'Highlights:',
  );
  for (const h of report.highlights) lines.push(`- ${h}`);

  return lines.join('\n');
}

function resolveReceipt(cwd: string, runRef?: string): Receipt | null {
  if (runRef) {
    try {
      return loadReceiptJson(cwd, runRef);
    } catch {
      return null;
    }
  }
  const dirs = ensureAftermathDirs(cwd);
  if (!existsSync(dirs.runs)) return safeReadLatestReceipt(dirs.receipts);
  try {
    const nums = readdirSync(dirs.runs)
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!nums.length) return safeReadLatestReceipt(dirs.receipts);
    const latest = Math.max(...nums);
    return loadReceiptJson(cwd, String(latest));
  } catch {
    return safeReadLatestReceipt(dirs.receipts);
  }
}

function safeReadLatestReceipt(receiptsDir: string): Receipt | null {
  if (!existsSync(receiptsDir)) return null;
  try {
    const files = readdirSync(receiptsDir)
      .filter((f) => /^run_\d+\.json$/i.test(f))
      .sort()
      .reverse();
    for (const f of files) {
      const receipt = safeReadJson<Receipt>(join(receiptsDir, f));
      if (receipt) return receipt;
    }
  } catch {
    return null;
  }
  return null;
}

function metricsFromBaselineOnly(baseline: BaselineSnapshot): CompareDelta[] {
  return [
    {
      metric: 'warnings',
      baseline: baseline.warnings ?? 0,
      current: null,
      delta: null,
      direction: 'unknown',
    },
    {
      metric: 'tests.total',
      baseline: baseline.testCounts?.total ?? null,
      current: null,
      delta: null,
      direction: 'unknown',
    },
    {
      metric: 'dependencies.direct',
      baseline: baseline.dependencies?.directCount ?? null,
      current: null,
      delta: null,
      direction: 'unknown',
    },
  ];
}

function numericDelta(
  metric: string,
  baseline: number | null,
  current: number | null,
  mode: 'lower-better' | 'higher-better' | 'neutral',
): CompareDelta {
  if (baseline == null || current == null) {
    return { metric, baseline, current, delta: null, direction: 'unknown' };
  }
  const delta = current - baseline;
  let direction: CompareDirection = 'same';
  if (delta === 0) direction = 'same';
  else if (mode === 'neutral') direction = 'unknown';
  else if (mode === 'lower-better') direction = delta < 0 ? 'better' : 'worse';
  else direction = delta > 0 ? 'better' : 'worse';
  return { metric, baseline, current, delta, direction };
}

function diffCheckStatuses(baseline: BaselineSnapshot, receipt: Receipt) {
  const out: CompareReport['checkStatusChanges'] = [];
  const currentByKey = new Map<string, string>(
    receipt.checks.map((c) => [`${c.kind}:${c.name}`, c.status]),
  );
  for (const b of baseline.checks) {
    const key = `${b.kind}:${b.name}`;
    const cur = currentByKey.get(key);
    if (cur && cur !== b.status) {
      out.push({ name: b.name, kind: b.kind, baseline: b.status, current: cur });
    } else if (!cur) {
      out.push({ name: b.name, kind: b.kind, baseline: b.status, current: undefined });
    }
  }
  for (const c of receipt.checks) {
    const key = `${c.kind}:${c.name}`;
    const had = baseline.checks.some((b) => b.kind === c.kind && b.name === c.name);
    if (!had) {
      out.push({ name: c.name, kind: c.kind, baseline: undefined, current: c.status });
    }
  }
  return out;
}

function buildHighlights(
  deltas: CompareDelta[],
  checks: CompareReport['checkStatusChanges'],
  findings: CompareReport['findingSummary'],
  receipt: Receipt,
): string[] {
  const highlights: string[] = [];
  const worse = deltas.filter((d) => d.direction === 'worse');
  const better = deltas.filter((d) => d.direction === 'better');

  if (worse.length) {
    highlights.push(`Regressions: ${worse.map((d) => d.metric).join(', ')}`);
  }
  if (better.length) {
    highlights.push(`Improvements: ${better.map((d) => d.metric).join(', ')}`);
  }

  const newlyFailing = checks.filter(
    (c) => c.current === 'fail' || c.current === 'timeout',
  );
  if (newlyFailing.length) {
    highlights.push(
      `Failing checks vs baseline overlap: ${newlyFailing.map((c) => c.name).join(', ')}`,
    );
  }

  if (findings.errors > 0) {
    highlights.push(`${findings.errors} error finding(s) on run #${receipt.runNumber}`);
  } else if (receipt.verdict === 'verified') {
    highlights.push('No error findings; latest run met verification gates.');
  }

  if (!highlights.length) highlights.push('No material deltas detected.');
  return highlights;
}

function sumMetric(checks: Receipt['checks'], key: string): number {
  let total = 0;
  for (const c of checks) {
    const v = c.metrics?.[key];
    if (typeof v === 'number') total += v;
  }
  return total;
}

function countDepsFromReceipt(receipt: Receipt): number | null {
  const note = receipt.notes.find((n) => n.startsWith('Direct deps:'));
  if (!note) return null;
  const n = Number(note.replace(/^[^\d-]*/, ''));
  return Number.isFinite(n) ? n : null;
}

function countDepsFromCwd(cwd: string): number | null {
  const pkg = join(cwd, 'package.json');
  if (!existsSync(pkg)) return null;
  try {
    const data = JSON.parse(readFileSync(pkg, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return (
      Object.keys(data.dependencies ?? {}).length + Object.keys(data.devDependencies ?? {}).length
    );
  } catch {
    return null;
  }
}

function fmt(v: number | string | null | undefined): string {
  if (v == null) return '—';
  return String(v);
}
