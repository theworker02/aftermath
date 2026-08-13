import type { CheckKind, CheckStatus, Finding, Receipt, Verdict } from './types.js';

export function formatVerdict(verdict: Verdict): string {
  return verdict.replace(/_/g, ' ').toUpperCase();
}

const KIND_ORDER: CheckKind[] = [
  'build',
  'test',
  'typecheck',
  'lint',
  'format',
  'smoke',
  'api',
  'dependency',
  'benchmark',
  'artifact',
  'custom',
];

const FAILURE_PRIORITY: CheckKind[] = [
  'build',
  'test',
  'smoke',
  'typecheck',
  'lint',
  'format',
  'api',
  'dependency',
  'benchmark',
  'artifact',
  'custom',
];

export function summarizeByCategory(receipt: Receipt): Record<string, { pass: number; fail: number; other: number }> {
  const out: Record<string, { pass: number; fail: number; other: number }> = {};
  for (const check of receipt.checks) {
    const bucket = out[check.kind] ?? { pass: 0, fail: 0, other: 0 };
    if (check.status === 'pass') bucket.pass += 1;
    else if (check.status === 'fail' || check.status === 'timeout') bucket.fail += 1;
    else bucket.other += 1;
    out[check.kind] = bucket;
  }
  return out;
}

export function mostImportantFailure(receipt: Receipt): Receipt['checks'][number] | null {
  const failing = receipt.checks.filter(
    (c) => c.status === 'fail' || c.status === 'timeout',
  );
  if (!failing.length) return null;
  failing.sort((a, b) => {
    const pa = FAILURE_PRIORITY.indexOf(a.kind);
    const pb = FAILURE_PRIORITY.indexOf(b.kind);
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });
  return failing[0] ?? null;
}

export function findingCategorySummary(findings: Finding[]): string[] {
  const by: Record<string, number> = {};
  for (const f of findings) {
    const key = `${f.severity}:${f.code}`;
    by[key] = (by[key] ?? 0) + 1;
  }
  return Object.entries(by)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ×${n}`);
}

export function renderHumanReceipt(receipt: Receipt): string {
  const categories = summarizeByCategory(receipt);
  const topFail = mostImportantFailure(receipt);
  const findingCats = findingCategorySummary(receipt.findings);

  const lines: string[] = [
    `# Aftermath Receipt #${receipt.runNumber}`,
    '',
    '## Verdict',
    formatVerdict(receipt.verdict),
    '',
    '## Repository',
    `- Name: ${receipt.repository.name}`,
    `- Branch: ${receipt.git.branch ?? 'unknown'}`,
    `- HEAD: ${receipt.git.head ?? 'unknown'}`,
    `- Change fingerprint: ${receipt.git.changeFingerprint}`,
    `- Repair attempts (this fingerprint): ${receipt.repairAttempts}`,
    '',
    '## Change',
    `- Files: ${receipt.change.filesChanged}`,
    `- +${receipt.change.insertions} / -${receipt.change.deletions}`,
  ];

  for (const [cat, count] of Object.entries(receipt.change.byCategory)) {
    lines.push(`- ${cat}: ${count}`);
  }

  lines.push('', '## Category summary');
  const kinds = [
    ...KIND_ORDER.filter((k) => categories[k]),
    ...Object.keys(categories).filter((k) => !KIND_ORDER.includes(k as CheckKind)),
  ];
  if (!kinds.length) lines.push('- No checks executed');
  for (const kind of kinds) {
    const c = categories[kind]!;
    lines.push(`- **${kind}**: ${c.pass} pass · ${c.fail} fail · ${c.other} other`);
  }

  if (topFail) {
    lines.push(
      '',
      '## Most important failure',
      `- **${topFail.kind}** \`${topFail.name}\`: ${topFail.status.toUpperCase()}${
        topFail.summary ? ` — ${topFail.summary}` : ''
      }`,
      `- Command: \`${[topFail.command, ...topFail.args].join(' ')}\``,
    );
  }

  lines.push('', '## Checks');
  for (const check of sortChecks(receipt.checks)) {
    lines.push(
      `- **${check.kind}** \`${check.name}\`: ${check.status.toUpperCase()}${
        check.summary ? ` — ${check.summary}` : ''
      }`,
    );
  }

  if (receipt.findings.length) {
    lines.push('', '## Findings');
    if (findingCats.length) {
      lines.push(`- Summary: ${findingCats.join(', ')}`);
    }
    for (const f of receipt.findings) {
      const loc = f.location
        ? ` @ \`${f.location.file}${f.location.line != null ? `:${f.location.line}` : ''}\``
        : '';
      lines.push(`- \`${f.id}\` ${f.code} ${f.title}: ${f.message}${loc}`);
    }
  } else {
    lines.push('', '## Findings', '- None');
  }

  lines.push(
    '',
    '## Notes',
    ...receipt.notes.map((n) => `- ${n}`),
    '',
    '## Evidence',
    ...receipt.artifacts.map((a) => `- ${a}`),
    '',
    '---',
    '',
    'VERIFIED means configured mandatory gates passed. It does **not** mean the software is bug-free.',
    '',
  );

  return lines.join('\n');
}

export function renderConsoleSummary(receipt: Receipt): string {
  const categories = summarizeByCategory(receipt);
  const topFail = mostImportantFailure(receipt);
  const findingCats = findingCategorySummary(receipt.findings);

  const lines = [
    'AFTERMATH',
    `Verification #${receipt.runNumber}`,
    `Repository: ${receipt.repository.name}`,
    `Change: ${receipt.change.filesChanged} files  +${receipt.change.insertions} -${receipt.change.deletions}`,
    `Repair attempts: ${receipt.repairAttempts}`,
    '',
  ];

  for (const check of sortChecks(receipt.checks)) {
    const label = check.kind.toUpperCase().padEnd(10, ' ');
    lines.push(`${label}${statusGlyph(check.status)} ${check.summary ?? check.status}`);
  }

  lines.push('', 'Category summary:');
  const kinds = KIND_ORDER.filter((k) => categories[k]);
  if (!kinds.length) lines.push('- (none)');
  for (const kind of kinds) {
    const c = categories[kind]!;
    lines.push(`- ${kind}: ${c.pass} pass / ${c.fail} fail / ${c.other} other`);
  }

  if (topFail) {
    lines.push(
      '',
      'Most important failure:',
      `- ${topFail.kind}/${topFail.name}: ${topFail.summary ?? topFail.status}`,
    );
  }

  if (receipt.findings.length) {
    lines.push('', 'Findings:');
    if (findingCats.length) lines.push(`- ${findingCats.join(', ')}`);
    for (const f of receipt.findings.slice(0, 8)) {
      const loc = f.location
        ? ` @ ${f.location.file}${f.location.line != null ? `:${f.location.line}` : ''}`
        : '';
      lines.push(`- ${f.code} ${f.title}: ${f.message}${loc}`);
    }
    if (receipt.findings.length > 8) {
      lines.push(`- … +${receipt.findings.length - 8} more`);
    }
  }

  lines.push('', 'VERDICT', formatVerdict(receipt.verdict));
  lines.push('', 'Evidence:', `.aftermath/runs/${String(receipt.runNumber).padStart(4, '0')}/`);
  return lines.join('\n');
}

/** Shareable HTML receipt for screenshots and offline review. */
export function renderHtmlReceipt(receipt: Receipt): string {
  const categories = summarizeByCategory(receipt);
  const topFail = mostImportantFailure(receipt);
  const findingCats = findingCategorySummary(receipt.findings);
  const verdictClass = receipt.verdict.replace(/_/g, '-');

  const checkRows = sortChecks(receipt.checks)
    .map((c) => {
      const summary = escapeHtml(c.summary ?? c.status);
      return `<tr><td>${escapeHtml(c.kind)}</td><td><code>${escapeHtml(c.name)}</code></td><td class="st-${escapeHtml(c.status)}">${escapeHtml(c.status.toUpperCase())}</td><td>${summary}</td></tr>`;
    })
    .join('\n');

  const findingRows = receipt.findings.length
    ? receipt.findings
        .map((f) => {
          const loc = f.location
            ? `<code>${escapeHtml(f.location.file)}${
                f.location.line != null ? `:${f.location.line}` : ''
              }</code>`
            : '—';
          return `<tr><td><code>${escapeHtml(f.id)}</code></td><td>${escapeHtml(f.code)}</td><td>${escapeHtml(f.severity)}</td><td>${escapeHtml(f.message)}</td><td>${loc}</td></tr>`;
        })
        .join('\n')
    : '<tr><td colspan="5">None</td></tr>';

  const catLines = Object.entries(categories)
    .map(
      ([k, v]) =>
        `<li><strong>${escapeHtml(k)}</strong>: ${v.pass} pass · ${v.fail} fail · ${v.other} other</li>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aftermath Receipt #${receipt.runNumber}</title>
  <meta name="generator" content="Aftermath" />
  <style>
    :root {
      --bg: #0b0f14; --panel: #151c24; --ink: #e8eef5; --muted: #9bb0c2;
      --line: #2a3542; --accent: #a8c5a2; --steel: #7c9cb4; --fail: #c97b7b;
      --pass: #a8c5a2; --warn: #c9b07b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; color: var(--ink); font: 15px/1.5 "IBM Plex Sans", "Segoe UI", sans-serif;
      background: radial-gradient(900px 500px at 10% -10%, #1a2430, transparent 55%),
                  linear-gradient(160deg, var(--bg), var(--panel));
      min-height: 100vh; padding: 2rem;
    }
    header { max-width: 960px; margin: 0 auto 2rem; }
    .eyebrow { font: 12px/1 "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .18em; color: var(--steel); }
    h1 { font-family: Georgia, "Iowan Old Style", serif; font-weight: 600; font-size: 2rem; margin: .4rem 0; }
    .verdict {
      display: inline-block; margin-top: .75rem; padding: .45rem .8rem; border: 1px solid var(--line);
      font-family: "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .04em;
    }
    .verdict.verified, .verdict.partially-verified { border-color: var(--accent); color: var(--accent); }
    .verdict.failed, .verdict.cancelled { border-color: var(--fail); color: var(--fail); }
    .verdict.inconclusive { border-color: var(--warn); color: var(--warn); }
    main { max-width: 960px; margin: 0 auto; }
    section {
      background: rgba(21,28,36,.72); border: 1px solid var(--line); padding: 1.25rem 1.4rem; margin-bottom: 1rem;
    }
    h2 { margin: 0 0 .75rem; font-size: 1rem; color: var(--steel); font-family: "IBM Plex Mono", monospace; letter-spacing: .06em; text-transform: uppercase; }
    ul { margin: 0; padding-left: 1.2rem; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: .92rem; }
    th, td { text-align: left; padding: .45rem .35rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--steel); font-weight: 500; font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; }
    code { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: .86em; color: var(--ink); }
    .st-pass { color: var(--pass); }
    .st-fail, .st-timeout { color: var(--fail); }
    footer { max-width: 960px; margin: 2rem auto 0; color: var(--muted); font-size: .85rem; }
    .meta { color: var(--muted); }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">AFTERMATH RECEIPT</p>
    <h1>#${receipt.runNumber} · ${escapeHtml(receipt.repository.name)}</h1>
    <p class="meta">Branch ${escapeHtml(receipt.git.branch ?? 'unknown')} · HEAD ${escapeHtml(
      (receipt.git.head ?? 'unknown').slice(0, 12),
    )} · ${escapeHtml(receipt.createdAt)}</p>
    <div class="verdict ${verdictClass}">${escapeHtml(formatVerdict(receipt.verdict))}</div>
  </header>
  <main>
    <section>
      <h2>Change</h2>
      <ul>
        <li>Files: ${receipt.change.filesChanged} · +${receipt.change.insertions} / -${receipt.change.deletions}</li>
        <li>Fingerprint: <code>${escapeHtml(receipt.git.changeFingerprint.slice(0, 16))}…</code></li>
        <li>Repair attempts: ${receipt.repairAttempts}</li>
      </ul>
    </section>
    <section>
      <h2>Category summary</h2>
      <ul>${catLines || '<li>No checks executed</li>'}</ul>
      ${
        topFail
          ? `<p class="meta" style="margin-top:1rem">Most important failure: <strong>${escapeHtml(topFail.kind)}</strong> <code>${escapeHtml(topFail.name)}</code> — ${escapeHtml(topFail.summary ?? topFail.status)}</p>`
          : ''
      }
      ${
        findingCats.length
          ? `<p class="meta">Finding summary: ${escapeHtml(findingCats.join(', '))}</p>`
          : ''
      }
    </section>
    <section>
      <h2>Checks</h2>
      <table>
        <thead><tr><th>Kind</th><th>Name</th><th>Status</th><th>Summary</th></tr></thead>
        <tbody>${checkRows || '<tr><td colspan="4">None</td></tr>'}</tbody>
      </table>
    </section>
    <section>
      <h2>Findings</h2>
      <table>
        <thead><tr><th>Id</th><th>Code</th><th>Severity</th><th>Message</th><th>Location</th></tr></thead>
        <tbody>${findingRows}</tbody>
      </table>
    </section>
  </main>
  <footer>
    VERIFIED means configured mandatory gates passed. It does not mean the software is bug-free.<br />
    Generated locally by Aftermath · no telemetry.
  </footer>
</body>
</html>
`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sortChecks(checks: Receipt['checks']): Receipt['checks'] {
  return [...checks].sort((a, b) => {
    const pa = KIND_ORDER.indexOf(a.kind);
    const pb = KIND_ORDER.indexOf(b.kind);
    if (pa !== pb) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    return a.name.localeCompare(b.name);
  });
}

function statusGlyph(status: CheckStatus | string): string {
  switch (status) {
    case 'pass':
      return 'PASS';
    case 'fail':
      return 'FAIL';
    case 'timeout':
      return 'TIMEOUT';
    case 'cancelled':
      return 'CANCELLED';
    case 'not_run':
      return 'NOT RUN';
    case 'unavailable':
      return 'UNAVAILABLE';
    default:
      return String(status).toUpperCase();
  }
}

