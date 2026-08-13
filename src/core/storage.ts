import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Receipt } from './types.js';

export const AFTERMATH_DIR = '.aftermath';
export const BASELINE_FILE = 'baseline.json';
export const RUNS_DIR = 'runs';
export const RECEIPTS_DIR = 'receipts';
export const CACHE_DIR = 'cache';

export function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/core -> repo root
  return resolve(here, '..', '..');
}

export function aftermathVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot(), 'package.json'), 'utf8')) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return '0.1.0';
  }
}

export function ensureAftermathDirs(cwd: string): {
  root: string;
  runs: string;
  receipts: string;
  cache: string;
  baseline: string;
} {
  const root = join(cwd, AFTERMATH_DIR);
  const runs = join(root, RUNS_DIR);
  const receipts = join(root, RECEIPTS_DIR);
  const cache = join(root, CACHE_DIR);
  mkdirSync(runs, { recursive: true });
  mkdirSync(receipts, { recursive: true });
  mkdirSync(cache, { recursive: true });
  const gitignore = join(root, '.gitignore');
  if (!existsSync(gitignore)) {
    writeFileSync(
      gitignore,
      ['runs/', 'receipts/', 'cache/', '*.log', '', '# Optionally commit baseline.json', ''].join(
        '\n',
      ),
      'utf8',
    );
  }
  return {
    root,
    runs,
    receipts,
    cache,
    baseline: join(root, BASELINE_FILE),
  };
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function nextRunNumber(cwd: string): number {
  const { runs } = ensureAftermathDirs(cwd);
  const entries = existsSync(runs)
    ? readdirSync(runs).filter((name) => /^\d+$/.test(name) || /^run_\d+$/.test(name))
    : [];
  let max = 0;
  for (const entry of entries) {
    const n = Number(entry.replace(/^run_/, ''));
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return max + 1;
}

export function runIdFromNumber(n: number): string {
  return `run_${String(n).padStart(4, '0')}`;
}

export function resolveRunDir(cwd: string, runNumber: number): string {
  const { runs } = ensureAftermathDirs(cwd);
  return join(runs, String(runNumber).padStart(4, '0'));
}

export function latestRunNumber(cwd: string): number | null {
  const { runs } = ensureAftermathDirs(cwd);
  if (!existsSync(runs)) return null;
  const nums = readdirSync(runs)
    .map((name) => {
      if (/^\d+$/.test(name)) return Number(name);
      const m = /^run_(\d+)$/i.exec(name);
      return m ? Number(m[1]) : NaN;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return Math.max(...nums);
}

/** Parse a numeric run id (e.g. `12`, `run_0012`, `#12`). */
export function parseRunRef(ref: string): number {
  const cleaned = ref.replace(/^#/, '').replace(/^run[_-]?/i, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Invalid run reference: ${ref}`);
  }
  return n;
}

/**
 * Resolve a run reference in a repository. Accepts numeric ids and the
 * aliases `latest` / `last`.
 */
export function resolveRunRef(cwd: string, ref: string): number {
  const trimmed = ref.trim();
  if (/^(latest|last)$/i.test(trimmed)) {
    const n = latestRunNumber(cwd);
    if (n == null) {
      throw new Error('No Aftermath runs found. Run `aftermath verify` first.');
    }
    return n;
  }
  return parseRunRef(trimmed);
}

export function fileSizeBytes(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function safeReadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value, 'utf8');
}

export function loadReceiptJson(cwd: string, runRef: string): Receipt {
  const n = resolveRunRef(cwd, runRef);
  const dirs = ensureAftermathDirs(cwd);
  const padded = String(n).padStart(4, '0');
  const candidates = [
    join(dirs.runs, padded, 'receipt.json'),
    join(dirs.receipts, `run_${padded}.json`),
  ];
  for (const path of candidates) {
    const receipt = safeReadJson<Receipt>(path);
    if (receipt) return receipt;
  }
  throw new Error(`Receipt not found for run ${runRef}`);
}

function directorySizeBytes(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path);
  if (st.isFile()) return st.size;
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) total += directorySizeBytes(child);
    else if (entry.isFile()) total += statSync(child).size;
  }
  return total;
}

export interface PruneResult {
  deletedRuns: number[];
  freedBytes: number;
  beforeBytes: number;
  afterBytes: number;
  maxBytes: number;
  notes: string[];
}

/**
 * Enforce `limits.max_run_storage_mb` by deleting oldest run directories
 * (and matching receipt copies) until under the budget.
 */
export function pruneRunStorage(cwd: string, maxMb: number): PruneResult {
  const dirs = ensureAftermathDirs(cwd);
  const maxBytes = Math.max(1024, maxMb * 1024 * 1024);
  const notes: string[] = [];
  const deletedRuns: number[] = [];
  let freedBytes = 0;

  const runEntries = existsSync(dirs.runs)
    ? readdirSync(dirs.runs)
        .map((name) => {
          const n = Number(name);
          if (!Number.isFinite(n) || n <= 0) return null;
          const path = join(dirs.runs, name);
          return { n, path, bytes: directorySizeBytes(path) };
        })
        .filter((x): x is { n: number; path: string; bytes: number } => Boolean(x))
        .sort((a, b) => a.n - b.n)
    : [];

  let beforeBytes = runEntries.reduce((s, r) => s + r.bytes, 0);
  // Include receipt copies in the budget so we don't leave orphans bloating disk.
  if (existsSync(dirs.receipts)) {
    beforeBytes += directorySizeBytes(dirs.receipts);
  }

  let currentBytes = beforeBytes;
  if (currentBytes <= maxBytes) {
    return {
      deletedRuns,
      freedBytes: 0,
      beforeBytes,
      afterBytes: currentBytes,
      maxBytes,
      notes: [
        `Run storage ${formatMb(currentBytes)} / ${formatMb(maxBytes)} — within limit.`,
      ],
    };
  }

  notes.push(
    `Run storage ${formatMb(currentBytes)} exceeds limit ${formatMb(maxBytes)}; pruning oldest runs.`,
  );

  for (const entry of runEntries) {
    if (currentBytes <= maxBytes) break;
    // Never prune the newest run if it is the only one left under pressure mid-write;
    // still allow deleting older ones.
    const isNewest = entry.n === Math.max(...runEntries.map((r) => r.n));
    if (isNewest && deletedRuns.length === runEntries.length - 1) {
      notes.push(`Kept newest run #${entry.n} even though storage remains over budget.`);
      break;
    }

    let freed = entry.bytes;
    try {
      rmSync(entry.path, { recursive: true, force: true });
    } catch (err) {
      notes.push(
        `Failed to delete run #${entry.n}: ${err instanceof Error ? err.message : String(err)}`,
      );
      continue;
    }

    const padded = String(entry.n).padStart(4, '0');
    const receiptGlobs = [
      join(dirs.receipts, `run_${padded}.json`),
      join(dirs.receipts, `run_${padded}.md`),
      join(dirs.receipts, `run_${padded}.html`),
      join(dirs.receipts, `run_${padded}.summary.json`),
    ];
    for (const p of receiptGlobs) {
      if (!existsSync(p)) continue;
      try {
        freed += fileSizeBytes(p);
        rmSync(p, { force: true });
      } catch {
        // ignore individual receipt cleanup failures
      }
    }

    deletedRuns.push(entry.n);
    freedBytes += freed;
    currentBytes = Math.max(0, currentBytes - freed);
    notes.push(`Pruned run #${entry.n} (freed ~${formatMb(freed)}).`);
  }

  const afterBytes = Math.max(
    0,
    directorySizeBytes(dirs.runs) +
      (existsSync(dirs.receipts) ? directorySizeBytes(dirs.receipts) : 0),
  );

  notes.push(`Run storage now ${formatMb(afterBytes)} / ${formatMb(maxBytes)}.`);

  return {
    deletedRuns,
    freedBytes,
    beforeBytes,
    afterBytes,
    maxBytes,
    notes,
  };
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
