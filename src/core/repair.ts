import { existsSync, readFileSync } from 'node:fs';
import type { AftermathConfig, Receipt } from './types.js';
import { mostImportantFailure } from './receipt.js';
import { getRepairNotes } from './repair-state.js';
import { topErrorLines } from './locations.js';

export function buildRepairContext(
  receipt: Receipt,
  opts: {
    patch?: string;
    previousAttempts?: string[];
    maxRepairAttempts?: number;
    config?: AftermathConfig;
  } = {},
): string {
  const failing = receipt.checks.filter(
    (c) => c.status === 'fail' || c.status === 'timeout',
  );
  const errorFindings = receipt.findings.filter((f) => f.severity === 'error');
  const topFail = mostImportantFailure(receipt);
  const maxAttempts =
    opts.maxRepairAttempts ?? opts.config?.policy?.max_repair_attempts ?? 3;
  const priorNotes =
    opts.previousAttempts ??
    getRepairNotes(receipt.repository.root, receipt.git.changeFingerprint);

  const lines: string[] = [
    '# Aftermath Repair Context',
    '',
    `Run: #${receipt.runNumber} (${receipt.id})`,
    `Verdict: ${receipt.verdict}`,
    `Repair attempts: ${receipt.repairAttempts} / max ${maxAttempts}`,
    '',
    '## Goal',
    'Repair the identified verification failures without undoing unrelated correct changes.',
    '',
    '## Original task',
    receipt.notes.find((n) => n.startsWith('Task:'))?.replace(/^Task:\s*/, '') ||
      '(not provided)',
    '',
    '## Changed files',
  ];

  for (const file of receipt.change.files.slice(0, 40)) {
    lines.push(`- ${file.path} (${file.category})`);
  }

  if (topFail) {
    lines.push(
      '',
      '## Most important failure',
      `- **${topFail.kind}** \`${topFail.name}\`: ${topFail.status}`,
      `- ${topFail.summary ?? 'see excerpt below'}`,
    );
  }

  lines.push('', '## Failing checks');
  if (!failing.length) {
    lines.push('- None (review warning findings / policy regressions).');
  }
  for (const check of failing) {
    lines.push(`### ${check.name}`);
    lines.push('```');
    lines.push(`$ ${[check.command, ...check.args].join(' ')}`);
    lines.push(`cwd: ${check.cwd}`);
    lines.push(`status: ${check.status}`);
    lines.push(`exit: ${check.exitCode ?? 'n/a'}`);
    lines.push('```');
    const excerpt = extractFailureExcerpt(check.stdoutPath, check.stderrPath);
    if (excerpt) {
      lines.push('Failure excerpt:');
      lines.push('```');
      lines.push(excerpt);
      lines.push('```');
    }
  }

  lines.push('', '## Findings');
  for (const f of receipt.findings) {
    const loc = f.location
      ? ` @ ${f.location.file}${f.location.line != null ? `:${f.location.line}` : ''}`
      : '';
    lines.push(`- ${f.id} ${f.code} ${f.title}: ${f.message}${loc}`);
    const top =
      Array.isArray(f.evidence?.topErrorLines) && f.evidence.topErrorLines.length
        ? (f.evidence.topErrorLines as string[]).slice(0, 5)
        : [];
    for (const line of top) lines.push(`  - \`${line.slice(0, 200)}\``);
  }

  // Top error lines across failing checks (navigation aids)
  const globalErrors: string[] = [];
  for (const check of failing) {
    for (const line of collectTopErrors(check.stdoutPath, check.stderrPath)) {
      globalErrors.push(`[${check.name}] ${line}`);
    }
  }
  if (globalErrors.length) {
    lines.push('', '## Top error lines');
    for (const line of globalErrors.slice(0, 20)) {
      lines.push(`- ${line.slice(0, 240)}`);
    }
  }

  const relatedTests = receipt.change.files
    .filter((f) => f.category === 'tests')
    .map((f) => f.path);
  if (relatedTests.length) {
    lines.push('', '## Related test files');
    for (const t of relatedTests.slice(0, 20)) lines.push(`- ${t}`);
  }

  const symbols = guessSymbols(opts.patch ?? '');
  if (symbols.length) {
    lines.push('', '## Suspected symbols');
    for (const s of symbols.slice(0, 30)) lines.push(`- ${s}`);
  }

  if (opts.patch) {
    lines.push('', '## Relevant diff fragments');
    lines.push('```diff');
    lines.push(trimPatch(opts.patch, 200));
    lines.push('```');
  }

  lines.push('', '## Previous repair attempts');
  if (!priorNotes.length && receipt.repairAttempts === 0) {
    lines.push('- none yet');
  } else {
    lines.push(`- Count for this change fingerprint: ${receipt.repairAttempts}`);
    for (const a of priorNotes) lines.push(`- ${a}`);
  }

  if (receipt.repairAttempts >= maxAttempts) {
    lines.push(
      '',
      '## Stop condition',
      `- Max repair attempts (${maxAttempts}) reached for this change fingerprint.`,
      '- Do not continue automatic repair loops; escalate to a human or redesign the fix.',
    );
  }

  lines.push(
    '',
    '## Constraints',
    '- Do not rewrite unrelated files.',
    '- Do not weaken tests to force a green receipt unless explicitly requested.',
    '- After fixes, re-run Aftermath verification.',
    '- Do not claim completion until configured gates pass.',
    '',
  );

  void errorFindings;
  return lines.join('\n');
}

function extractFailureExcerpt(
  stdoutPath?: string,
  stderrPath?: string,
): string | null {
  const chunks: string[] = [];
  for (const path of [stderrPath, stdoutPath]) {
    if (!path || !existsSync(path)) continue;
    try {
      const text = readFileSync(path, 'utf8');
      const lines = text.split(/\r?\n/);
      const interesting = lines.filter((l) =>
        /error|fail|panic|assert|exception|trace/i.test(l),
      );
      const selected =
        interesting.length > 0
          ? interesting.slice(-40)
          : lines.slice(-40);
      chunks.push(selected.join('\n'));
    } catch {
      // ignore
    }
  }
  const out = chunks.join('\n').trim();
  return out ? out.slice(0, 8000) : null;
}

function collectTopErrors(stdoutPath?: string, stderrPath?: string): string[] {
  const stdout =
    stdoutPath && existsSync(stdoutPath) ? readFileSync(stdoutPath, 'utf8') : '';
  const stderr =
    stderrPath && existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8') : '';
  return topErrorLines(stdout, stderr, 8);
}

function trimPatch(patch: string, maxLines: number): string {
  const lines = patch.split(/\r?\n/);
  if (lines.length <= maxLines) return patch;
  return `${lines.slice(0, maxLines).join('\n')}\n\n[diff truncated to ${maxLines} lines]`;
}

function guessSymbols(patch: string): string[] {
  const names = new Set<string>();
  for (const m of patch.matchAll(
    /(?:fn|function|class|def|func|pub\s+fn|export\s+(?:async\s+)?function|export\s+class)\s+([A-Za-z_][A-Za-z0-9_]*)/g,
  )) {
    if (m[1]) names.add(m[1]);
  }
  return [...names];
}

/** Recommended next operator/agent action based on receipt evidence. */
export function recommendedNextAction(receipt: Receipt): string {
  if (receipt.verdict === 'verified') {
    return 'No action required. Configured mandatory gates passed — review the receipt if you need evidence.';
  }
  if (receipt.verdict === 'cancelled') {
    return 'Re-run `aftermath verify` when ready; the previous run was cancelled before completion.';
  }
  if (receipt.verdict === 'inconclusive') {
    return 'Run `aftermath doctor`, then `aftermath config validate`, and ensure mandatory tools/scripts are available before verifying again.';
  }

  const failing = receipt.checks.filter(
    (c) => c.status === 'fail' || c.status === 'timeout',
  );
  const errorFindings = receipt.findings.filter((f) => f.severity === 'error');
  const maxAttempts = 3; // display default; callers with config may override via repair context

  if (failing.length || errorFindings.length) {
    if (receipt.repairAttempts >= maxAttempts) {
      return 'Max repair attempts reached for this change fingerprint. Escalate to a human; do not continue automatic repair loops. Inspect with `aftermath inspect <run>` and redesign the fix.';
    }
    return `Run \`/aftermath-repair\` (or \`aftermath repair-context ${receipt.runNumber}\`), apply a targeted fix, then re-run \`aftermath verify\`.`;
  }

  const depOrApi = receipt.findings.filter(
    (f) => f.code === 'AF004' || f.code === 'AF009' || f.code === 'AF003',
  );
  if (depOrApi.length) {
    return 'Review warning findings (API / dependency / warnings) with `aftermath explain <run>`, then either justify policy exceptions in `.aftermath.toml` or restore the prior contract and re-verify.';
  }

  if (receipt.findings.length) {
    return 'Review findings with `aftermath explain <run>`, address policy regressions, then re-run `aftermath verify`.';
  }

  return 'Inspect the receipt with `aftermath inspect <run>` and re-run verification after clarifying the inconclusive signals.';
}

export function explainReceipt(receipt: Receipt): string {
  const failing = receipt.checks.filter(
    (c) => c.status === 'fail' || c.status === 'timeout',
  );
  const topFail = mostImportantFailure(receipt);
  const lines: string[] = [
    `# Aftermath Explain #${receipt.runNumber}`,
    '',
    `Verdict: ${receipt.verdict}`,
    `Change fingerprint: ${receipt.git.changeFingerprint}`,
    `Repair attempts: ${receipt.repairAttempts}`,
    '',
  ];

  if (!failing.length && receipt.findings.length === 0) {
    lines.push('No failing checks or findings to explain.');
    lines.push('', '## Recommended next action', recommendedNextAction(receipt));
    return lines.join('\n');
  }

  if (topFail) {
    lines.push(
      `Most important failure: **${topFail.kind}/${topFail.name}** (${topFail.status}).`,
      '',
    );
  }

  for (const check of failing) {
    lines.push(`## Check: ${check.name}`);
    lines.push('');
    lines.push('### Observation');
    lines.push(
      `\`${[check.command, ...check.args].join(' ')}\` returned status \`${check.status}\`${
        check.exitCode != null ? ` (exit code ${check.exitCode})` : ''
      }.`,
    );
    lines.push('');
    lines.push('### Finding');
    lines.push(check.summary ?? 'Command did not pass.');
    lines.push('');
    lines.push('### Likely relation to change');
    const related = receipt.change.files
      .filter((f) => f.category === 'source' || f.category === 'tests')
      .slice(0, 10)
      .map((f) => f.path);
    if (related.length) {
      lines.push(
        `Failures may relate to modified files: ${related.join(', ')}. This is correlation, not proven causation.`,
      );
    } else {
      lines.push('Insufficient evidence to relate failures to specific changed files.');
    }
    lines.push('');
  }

  for (const finding of receipt.findings) {
    lines.push(`## Finding ${finding.id}`);
    lines.push('');
    lines.push('### Observation');
    lines.push(formatEvidence(finding.evidence));
    lines.push('');
    lines.push('### Finding');
    lines.push(finding.message);
    lines.push('');
    lines.push('### Likely relation to change');
    lines.push(
      finding.relatedFiles?.length
        ? `Related files: ${finding.relatedFiles.join(', ')}.`
        : 'Do not claim causation unless additional evidence proves it.',
    );
    lines.push('');
  }

  lines.push('## Recommended next action');
  lines.push(recommendedNextAction(receipt));
  lines.push('');

  return lines.join('\n');
}

function formatEvidence(evidence: Record<string, unknown>): string {
  try {
    return '```json\n' + JSON.stringify(evidence, null, 2) + '\n```';
  } catch {
    return String(evidence);
  }
}
