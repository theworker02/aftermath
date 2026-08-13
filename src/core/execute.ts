import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { redactSecrets, truncateText } from './redaction.js';
import { writeText } from './storage.js';
import type { AftermathConfig, CheckStatus, CommandResult, PlannedCommand } from './types.js';

export async function executeCommand(
  planned: PlannedCommand,
  opts: {
    runDir: string;
    config: AftermathConfig;
    cancelSignal?: AbortSignal;
  },
): Promise<CommandResult> {
  const startedAt = Date.now();
  const maxLogBytes = (opts.config.limits?.max_log_mb ?? 25) * 1024 * 1024;
  const stdoutPath = join(opts.runDir, `${sanitize(planned.id)}.stdout.log`);
  const stderrPath = join(opts.runDir, `${sanitize(planned.id)}.stderr.log`);

  if (!planned.command) {
    return {
      id: planned.id,
      kind: planned.kind,
      name: planned.name,
      command: planned.command,
      args: planned.args,
      cwd: planned.cwd,
      status: 'unavailable',
      exitCode: null,
      durationMs: 0,
      truncated: false,
      started: false,
      summary: 'Command failed to resolve (empty executable).',
    };
  }

  if (opts.cancelSignal?.aborted) {
    return baseResult(planned, 'cancelled', null, 0, false, false, 'Cancelled before start.');
  }

  let stdout = '';
  let stderr = '';
  let truncated = false;
  let started = false;
  let exitCode: number | null = null;
  let status: CheckStatus = 'fail';
  let readyMatched = false;

  try {
    const result = await runProcess({
      command: planned.command,
      args: planned.args,
      cwd: planned.cwd,
      timeoutMs: planned.timeoutSeconds * 1000,
      cancelSignal: opts.cancelSignal,
      readyPattern: planned.readyPattern,
      onChunk: (stream, chunk) => {
        started = true;
        if (stream === 'stdout') stdout += chunk;
        else stderr += chunk;
        if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxLogBytes * 2) {
          // Soft cap in memory; final truncate below
        }
      },
    });
    started = result.started;
    exitCode = result.exitCode;
    readyMatched = result.readyMatched;
    if (result.timedOut) status = 'timeout';
    else if (result.cancelled) status = 'cancelled';
    else if (!result.started) status = 'unavailable';
    else if (planned.readyPattern) {
      // Smoke with ready_pattern: success only when the pattern matched
      // (process is then terminated deterministically).
      status = result.readyMatched ? 'pass' : result.timedOut ? 'timeout' : 'fail';
      if (result.readyMatched) exitCode = 0;
    } else {
      status = result.exitCode === 0 ? 'pass' : 'fail';
    }
  } catch (error) {
    started = false;
    status = 'unavailable';
    stderr = String(error);
  }

  const patterns = opts.config.redaction?.patterns ?? [];
  const outTrunc = truncateText(redactSecrets(stdout, patterns), maxLogBytes);
  const errTrunc = truncateText(redactSecrets(stderr, patterns), maxLogBytes);
  truncated = outTrunc.truncated || errTrunc.truncated;
  writeText(stdoutPath, outTrunc.text);
  writeText(stderrPath, errTrunc.text);

  // Also stream-copy raw for consumers that want file handles
  void createWriteStream;

  const summary =
    readyMatched && planned.readyPattern
      ? `PASS (ready_pattern matched; process terminated)`
      : summarizeOutput(planned.kind, outTrunc.text, errTrunc.text, status, exitCode);

  return {
    id: planned.id,
    kind: planned.kind,
    name: planned.name,
    command: planned.command,
    args: planned.args,
    cwd: planned.cwd,
    status,
    exitCode,
    durationMs: Date.now() - startedAt,
    stdoutPath,
    stderrPath,
    truncated,
    started,
    summary,
    metrics: {
      ...extractMetrics(planned.kind, outTrunc.text + '\n' + errTrunc.text),
      ...(readyMatched ? { readyPatternMatched: true } : {}),
    },
  };
}

function baseResult(
  planned: PlannedCommand,
  status: CheckStatus,
  exitCode: number | null,
  durationMs: number,
  truncated: boolean,
  started: boolean,
  summary: string,
): CommandResult {
  return {
    id: planned.id,
    kind: planned.kind,
    name: planned.name,
    command: planned.command,
    args: planned.args,
    cwd: planned.cwd,
    status,
    exitCode,
    durationMs,
    truncated,
    started,
    summary,
  };
}

async function runProcess(opts: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  cancelSignal?: AbortSignal;
  readyPattern?: string;
  onChunk: (stream: 'stdout' | 'stderr', chunk: string) => void;
}): Promise<{
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
  started: boolean;
  readyMatched: boolean;
}> {
  return new Promise((resolve) => {
    let timedOut = false;
    let cancelled = false;
    let started = false;
    let settled = false;
    let readyMatched = false;
    let combined = '';

    let readyRe: RegExp | null = null;
    if (opts.readyPattern) {
      try {
        readyRe = new RegExp(opts.readyPattern, 'm');
      } catch {
        readyRe = null;
      }
    }

    const child = spawn(opts.command, opts.args, {
      cwd: opts.cwd,
      env: process.env,
      windowsHide: true,
      shell: false,
    });

    started = true;

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.cancelSignal?.removeEventListener('abort', onAbort);
      resolve({
        exitCode: typeof exitCode === 'number' ? exitCode : null,
        timedOut,
        cancelled,
        started,
        readyMatched,
      });
    };

    const killChild = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, 2000).unref?.();
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killChild();
    }, opts.timeoutMs);

    const onAbort = () => {
      cancelled = true;
      killChild();
    };
    opts.cancelSignal?.addEventListener('abort', onAbort, { once: true });

    const handleChunk = (stream: 'stdout' | 'stderr', chunk: string) => {
      opts.onChunk(stream, chunk);
      if (!readyRe || readyMatched) return;
      combined += chunk;
      if (readyRe.test(combined)) {
        readyMatched = true;
        // Deterministic termination after readiness signal
        killChild();
      }
    };

    child.stdout?.on('data', (buf: Buffer) => handleChunk('stdout', buf.toString('utf8')));
    child.stderr?.on('data', (buf: Buffer) => handleChunk('stderr', buf.toString('utf8')));

    child.on('error', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.cancelSignal?.removeEventListener('abort', onAbort);
      resolve({
        exitCode: null,
        timedOut,
        cancelled,
        started: false,
        readyMatched: false,
      });
    });

    child.on('close', (code) => {
      finish(typeof code === 'number' ? code : null);
    });
  });
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

function summarizeOutput(
  kind: PlannedCommand['kind'],
  stdout: string,
  stderr: string,
  status: CheckStatus,
  exitCode: number | null,
): string {
  if (status === 'unavailable') return 'Command failed to start.';
  if (status === 'timeout') return 'Command timed out.';
  if (status === 'cancelled') return 'Command cancelled.';
  const metrics = extractMetrics(kind, stdout + '\n' + stderr);
  if (kind === 'test' && metrics.passed != null) {
    return `${metrics.passed} passed, ${metrics.failed ?? 0} failed, ${metrics.skipped ?? 0} skipped`;
  }
  if (status === 'pass') return 'PASS';
  return `FAIL (exit ${exitCode ?? 'unknown'})`;
}

export function extractMetrics(
  kind: PlannedCommand['kind'],
  output: string,
): Record<string, number | string | boolean | null> {
  const metrics: Record<string, number | string | boolean | null> = {};

  // Generic warning counts
  const warningMatches = output.match(/\bwarning\b/gi);
  if (warningMatches) metrics.warnings = warningMatches.length;

  if (kind === 'test' || kind === 'build' || kind === 'lint' || kind === 'typecheck') {
    // Prefer ecosystem-specific parsers; do not let a looser pattern overwrite a richer match.
    const cargo = output.match(/(\d+)\s+passed;\s+(\d+)\s+failed;\s+(\d+)\s+ignored/i);
    if (cargo) {
      metrics.passed = Number(cargo[1]);
      metrics.failed = Number(cargo[2]);
      metrics.skipped = Number(cargo[3]);
      metrics.total = Number(cargo[1]) + Number(cargo[2]) + Number(cargo[3]);
    }

    if (metrics.passed == null) {
      const goPass = [...output.matchAll(/^ok\s+/gm)].length;
      const goFail = [...output.matchAll(/^---\s+FAIL:/gm)].length;
      if (goPass || goFail) {
        metrics.passed = goPass;
        metrics.failed = goFail;
      }
    }

    if (metrics.passed == null) {
      const pytest = output.match(
        /(\d+)\s+passed(?:,\s+(\d+)\s+failed)?(?:,\s+(\d+)\s+skipped)?/i,
      );
      if (pytest) {
        metrics.passed = Number(pytest[1]);
        metrics.failed = Number(pytest[2] ?? 0);
        metrics.skipped = Number(pytest[3] ?? 0);
      }
    }

    if (metrics.passed == null) {
      const jest = output.match(
        /Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/i,
      );
      if (jest) {
        metrics.failed = Number(jest[1]);
        metrics.passed = Number(jest[2]);
        metrics.total = Number(jest[3]);
      }
    }

    if (metrics.passed == null) {
      const vitest = output.match(/Tests\s+(\d+)\s+failed\s+\|\s+(\d+)\s+passed/i);
      if (vitest) {
        metrics.failed = Number(vitest[1]);
        metrics.passed = Number(vitest[2]);
      }
    }

    if (metrics.passed == null) {
      const mocha = output.match(/(\d+)\s+passing/i);
      if (mocha) metrics.passed = Number(mocha[1]);
    }
  }

  // Assertion-ish heuristic: count expect(/assert
  const assertions = output.match(/\b(expect\(|assert[A-Z(]|assert_eq!|assertEquals)\b/g);
  if (assertions) metrics.assertionMentions = assertions.length;

  return metrics;
}
