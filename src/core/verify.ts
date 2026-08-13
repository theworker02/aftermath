import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadBaseline, captureEnvironment } from './baseline.js';
import { loadConfig } from './config.js';
import { executeCommand } from './execute.js';
import { analyzeFindings, detectApiBreaksFromPatch } from './findings.js';
import { collectDiffPatch, collectDiffSummary, collectGitState } from './git.js';
import { buildVerificationPlan } from './plan.js';
import { renderHumanReceipt, renderConsoleSummary, renderHtmlReceipt } from './receipt.js';
import { buildRepairContext } from './repair.js';
import { getRepairAttempts } from './repair-state.js';
import { buildSarif, buildSummary } from './summary.js';
import {
  ensureAftermathDirs,
  nextRunNumber,
  pruneRunStorage,
  resolveRunDir,
  runIdFromNumber,
  writeJson,
  writeText,
} from './storage.js';
import type { CommandResult, Receipt, VerifyOptions, Verdict } from './types.js';
import { SCHEMA_VERSION } from './types.js';

export async function verifyRepository(options: VerifyOptions = {}): Promise<{
  receipt: Receipt;
  consoleSummary: string;
  jsonSummary?: string;
  exitCode: number;
}> {
  const cwd = options.cwd ?? process.cwd();
  const dirs = ensureAftermathDirs(cwd);
  const { config } = loadConfig(cwd);
  const runNumber = nextRunNumber(cwd);
  const runId = runIdFromNumber(runNumber);
  const runDir = resolveRunDir(cwd, runNumber);
  mkdirSync(runDir, { recursive: true });

  const git = await collectGitState(cwd);
  const change = await collectDiffSummary(cwd, git);
  const patch = await collectDiffPatch(cwd);
  writeText(join(runDir, 'diff.patch'), patch);

  const plan = buildVerificationPlan({
    cwd,
    config,
    diff: change,
    full: options.full,
  });
  writeJson(join(runDir, 'plan.json'), plan);

  const checks: CommandResult[] = [];
  let cancelled = false;

  for (const planned of plan.commands) {
    if (options.cancelSignal?.aborted) {
      cancelled = true;
      break;
    }
    if (planned.destructive) {
      const approved = options.approvalCallback
        ? await options.approvalCallback(planned)
        : !(options.skipDestructive ?? true);
      if (!approved) {
        checks.push({
          id: planned.id,
          kind: planned.kind,
          name: planned.name,
          command: planned.command,
          args: planned.args,
          cwd: planned.cwd,
          status: 'not_run',
          exitCode: null,
          durationMs: 0,
          truncated: false,
          started: false,
          summary: 'Skipped destructive command (requires explicit approval).',
        });
        continue;
      }
    }

    const result = await executeCommand(planned, {
      runDir,
      config,
      cancelSignal: options.cancelSignal,
    });
    checks.push(result);
    if (result.status === 'cancelled') {
      cancelled = true;
      break;
    }
  }

  const baseline = loadBaseline(cwd);
  const findings = analyzeFindings({
    checks,
    baseline,
    config,
    diff: change,
    cwd,
  });
  const apiFinding = detectApiBreaksFromPatch(patch);
  if (apiFinding && !(config.policy?.allow_api_breaks ?? false)) {
    findings.push(apiFinding);
  }

  const verdict = computeVerdict({ checks, findings, config, cancelled });
  const environment = await captureEnvironment(cwd);
  const repairAttempts = getRepairAttempts(cwd, git.changeFingerprint);

  const receipt: Receipt = {
    schemaVersion: SCHEMA_VERSION,
    id: runId,
    runNumber,
    createdAt: new Date().toISOString(),
    verdict,
    repository: {
      root: cwd,
      name: basename(cwd),
    },
    git,
    change,
    environment,
    plan,
    checks,
    findings,
    baseline: {
      present: Boolean(baseline),
      path: baseline ? dirs.baseline : undefined,
      compared: Boolean(baseline),
    },
    artifacts: [],
    repairAttempts,
    notes: [
      ...(options.taskDescription ? [`Task: ${options.taskDescription}`] : []),
      ...plan.notes,
      ...(repairAttempts > 0
        ? [`Repair attempts for this change fingerprint: ${repairAttempts}`]
        : []),
      'VERIFIED means configured mandatory gates passed — not that software is bug-free.',
    ],
  };

  writeJson(join(runDir, 'metadata.json'), {
    id: runId,
    runNumber,
    createdAt: receipt.createdAt,
    verdict,
    changeFingerprint: git.changeFingerprint,
    repairAttempts,
  });
  writeJson(join(runDir, 'findings.json'), findings);
  writeJson(join(runDir, 'receipt.json'), receipt);

  const human = renderHumanReceipt(receipt);
  writeText(join(runDir, 'receipt.md'), human);
  writeText(join(dirs.receipts, `${runId}.md`), human);
  writeJson(join(dirs.receipts, `${runId}.json`), receipt);

  const html = renderHtmlReceipt(receipt);
  writeText(join(runDir, 'receipt.html'), html);
  writeText(join(dirs.receipts, `${runId}.html`), html);

  const repair = buildRepairContext(receipt, { patch, config });
  writeText(join(runDir, 'repair-context.md'), repair);

  const exitCode = verdictToExitCode(verdict, options.ci ?? false);
  const summary = buildSummary(receipt, {
    ciExitCode: verdictToExitCode(verdict, true),
    interactiveExitCode: verdictToExitCode(verdict, false),
  });
  writeJson(join(runDir, 'summary.json'), summary);
  writeJson(join(dirs.receipts, `${runId}.summary.json`), summary);

  const artifacts = [
    join(runDir, 'receipt.json'),
    join(runDir, 'receipt.md'),
    join(runDir, 'receipt.html'),
    join(runDir, 'summary.json'),
    join(runDir, 'repair-context.md'),
    join(runDir, 'diff.patch'),
    join(runDir, 'plan.json'),
    join(runDir, 'findings.json'),
  ];

  if (options.sarif || options.ci) {
    const sarif = buildSarif(receipt);
    writeJson(join(runDir, 'findings.sarif'), sarif);
    artifacts.push(join(runDir, 'findings.sarif'));
  }

  receipt.artifacts = artifacts;
  writeJson(join(runDir, 'receipt.json'), receipt);
  summary.artifacts = artifacts;
  writeJson(join(runDir, 'summary.json'), summary);

  // Storage hygiene after the current run is fully written
  const maxMb = config.limits?.max_run_storage_mb ?? 500;
  const prune = pruneRunStorage(cwd, maxMb);
  if (prune.deletedRuns.length) {
    receipt.notes.push(...prune.notes);
    writeJson(join(runDir, 'receipt.json'), receipt);
    writeText(join(runDir, 'receipt.md'), renderHumanReceipt(receipt));
    writeText(join(runDir, 'receipt.html'), renderHtmlReceipt(receipt));
  } else if (prune.beforeBytes > prune.maxBytes * 0.9) {
    // Near limit — still surface the note once
    receipt.notes.push(prune.notes[0] ?? `Run storage near limit (${maxMb} MB).`);
  }

  return {
    receipt,
    consoleSummary: renderConsoleSummary(receipt),
    jsonSummary: JSON.stringify(summary, null, 2),
    exitCode,
  };
}

function computeVerdict(opts: {
  checks: CommandResult[];
  findings: Receipt['findings'];
  config: ReturnType<typeof loadConfig>['config'];
  cancelled: boolean;
}): Verdict {
  if (opts.cancelled) return 'cancelled';

  const executed = opts.checks.filter((c) => c.started || c.status !== 'not_run');
  const unavailable = opts.checks.filter((c) => c.status === 'unavailable');
  const mandatory = opts.checks.filter((c) => {
    const planned = true;
    void planned;
    return ['build', 'test', 'smoke'].includes(c.kind) || c.name.includes('mandatory');
  });

  if (executed.length === 0) return 'inconclusive';
  if (unavailable.length === executed.length) return 'inconclusive';

  const hardFails = opts.checks.filter(
    (c) =>
      (c.status === 'fail' || c.status === 'timeout') &&
      (c.kind === 'build' ||
        c.kind === 'test' ||
        c.kind === 'smoke' ||
        (c.kind === 'typecheck' && opts.config.policy?.tests_must_pass)),
  );

  const errorFindings = opts.findings.filter((f) => f.severity === 'error');
  const warningFindings = opts.findings.filter((f) => f.severity === 'warning');

  if (hardFails.length > 0 || errorFindings.length > 0) {
    if (opts.checks.some((c) => c.status === 'pass')) return 'partially_verified';
    return 'failed';
  }

  if (warningFindings.length > 0) return 'partially_verified';

  const mandatoryFailedToRun = mandatory.filter(
    (c) => c.status === 'not_run' || c.status === 'unavailable',
  );
  if (mandatoryFailedToRun.length > 0) return 'inconclusive';

  const allMandatoryPassed = mandatory.every((c) => c.status === 'pass' || c.status === 'not_run');
  if (allMandatoryPassed && opts.checks.some((c) => c.status === 'pass')) return 'verified';

  return 'inconclusive';
}

export function verdictToExitCode(verdict: Verdict, ci: boolean): number {
  if (!ci) {
    if (verdict === 'verified') return 0;
    if (verdict === 'partially_verified') return 0;
    if (verdict === 'failed') return 1;
    if (verdict === 'cancelled') return 1;
    return 3;
  }
  // CI mode: strict
  if (verdict === 'verified') return 0;
  if (verdict === 'failed' || verdict === 'partially_verified') return 1;
  if (verdict === 'inconclusive' || verdict === 'cancelled') return 3;
  return 2;
}
