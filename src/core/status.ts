import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ensureAftermathDirs,
  latestRunNumber,
  loadReceiptJson,
  aftermathVersion,
} from './storage.js';
import { formatVerdict } from './receipt.js';
import type { Receipt, Verdict } from './types.js';

export interface AftermathStatus {
  version: string;
  cwd: string;
  baselinePresent: boolean;
  baselinePath: string | null;
  latestRun: number | null;
  verdict: Verdict | null;
  findingCount: number;
  errorFindingCount: number;
  repairAttempts: number;
  receiptDir: string | null;
  hasHtmlReceipt: boolean;
  hasMdReceipt: boolean;
  sinceBaseline: string | null;
}

export function getAftermathStatus(cwd: string): AftermathStatus {
  const dirs = ensureAftermathDirs(cwd);
  const baselinePresent = existsSync(dirs.baseline);
  const latest = latestRunNumber(cwd);
  let receipt: Receipt | null = null;
  if (latest != null) {
    try {
      receipt = loadReceiptJson(cwd, String(latest));
    } catch {
      receipt = null;
    }
  }

  const padded = latest != null ? String(latest).padStart(4, '0') : null;
  const runDir = padded ? join(dirs.runs, padded) : null;
  const htmlPath = runDir ? join(runDir, 'receipt.html') : null;
  const mdPath = runDir ? join(runDir, 'receipt.md') : null;

  let sinceBaseline: string | null = null;
  if (!baselinePresent) {
    sinceBaseline = 'No baseline — create one with `aftermath baseline` before relying on regressions.';
  } else if (!receipt) {
    sinceBaseline = 'Baseline present; no verification runs yet.';
  } else if (receipt.baseline?.compared) {
    sinceBaseline = 'Latest run compared against baseline.';
  } else if (receipt.baseline?.present) {
    sinceBaseline = 'Baseline present but not compared on latest run.';
  } else {
    sinceBaseline = 'Baseline on disk; latest receipt did not record a comparison.';
  }

  return {
    version: aftermathVersion(),
    cwd,
    baselinePresent,
    baselinePath: baselinePresent ? dirs.baseline : null,
    latestRun: latest,
    verdict: receipt?.verdict ?? null,
    findingCount: receipt?.findings.length ?? 0,
    errorFindingCount: receipt?.findings.filter((f) => f.severity === 'error').length ?? 0,
    repairAttempts: receipt?.repairAttempts ?? 0,
    receiptDir: runDir,
    hasHtmlReceipt: Boolean(htmlPath && existsSync(htmlPath)),
    hasMdReceipt: Boolean(mdPath && existsSync(mdPath)),
    sinceBaseline,
  };
}

export function formatStatus(status: AftermathStatus): string {
  const lines = [
    'AFTERMATH STATUS',
    `Version: ${status.version}`,
    `Repository: ${status.cwd}`,
    '',
    `Baseline: ${status.baselinePresent ? 'present' : 'missing'}`,
    status.baselinePath ? `  ${status.baselinePath}` : '',
    `Latest run: ${status.latestRun != null ? `#${status.latestRun}` : 'none'}`,
    `Verdict: ${status.verdict ? formatVerdict(status.verdict) : '—'}`,
    `Findings: ${status.findingCount} (${status.errorFindingCount} errors)`,
    `Repair attempts (fingerprint): ${status.repairAttempts}`,
    '',
    `Since baseline: ${status.sinceBaseline ?? '—'}`,
  ].filter((l) => l !== '');

  if (status.receiptDir) {
    lines.push('', `Evidence: ${status.receiptDir}/`);
    lines.push(
      `Receipts: ${status.hasMdReceipt ? 'receipt.md' : '—'} · ${
        status.hasHtmlReceipt ? 'receipt.html' : '—'
      }`,
    );
  }

  lines.push(
    '',
    'Tips:',
    '- aftermath verify',
    '- aftermath inspect latest',
    '- aftermath receipt latest --html',
    '- aftermath compare latest',
  );

  return lines.join('\n') + '\n';
}
