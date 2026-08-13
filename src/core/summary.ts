import type { Receipt, Verdict } from './types.js';
import { formatVerdict, mostImportantFailure, summarizeByCategory } from './receipt.js';
import { recommendedNextAction } from './repair.js';

/** Machine-readable CI / automation summary (summary.json). */
export interface AftermathSummary {
  schemaVersion: 1;
  kind: 'aftermath.summary';
  generatedAt: string;
  runNumber: number;
  runId: string;
  verdict: Verdict;
  verdictLabel: string;
  exitCodeHint: {
    interactive: number;
    ci: number;
  };
  repository: {
    name: string;
    root: string;
    branch: string | null;
    head: string | null;
    changeFingerprint: string;
  };
  change: {
    filesChanged: number;
    insertions: number;
    deletions: number;
  };
  checks: {
    total: number;
    passed: number;
    failed: number;
    other: number;
    byCategory: Record<string, { pass: number; fail: number; other: number }>;
  };
  findings: Array<{
    id: string;
    code: string;
    title: string;
    severity: string;
    message: string;
    location?: { file: string; line?: number; column?: number };
  }>;
  mostImportantFailure: {
    kind: string;
    name: string;
    status: string;
    summary?: string;
  } | null;
  repairAttempts: number;
  nextAction: string;
  artifacts: string[];
  evidenceDir: string;
}

export function buildSummary(receipt: Receipt, opts?: { ciExitCode?: number; interactiveExitCode?: number }): AftermathSummary {
  const categories = summarizeByCategory(receipt);
  let passed = 0;
  let failed = 0;
  let other = 0;
  for (const c of receipt.checks) {
    if (c.status === 'pass') passed += 1;
    else if (c.status === 'fail' || c.status === 'timeout') failed += 1;
    else other += 1;
  }
  const top = mostImportantFailure(receipt);
  const pad = String(receipt.runNumber).padStart(4, '0');

  return {
    schemaVersion: 1,
    kind: 'aftermath.summary',
    generatedAt: new Date().toISOString(),
    runNumber: receipt.runNumber,
    runId: receipt.id,
    verdict: receipt.verdict,
    verdictLabel: formatVerdict(receipt.verdict),
    exitCodeHint: {
      interactive: opts?.interactiveExitCode ?? verdictHint(receipt.verdict, false),
      ci: opts?.ciExitCode ?? verdictHint(receipt.verdict, true),
    },
    repository: {
      name: receipt.repository.name,
      root: receipt.repository.root,
      branch: receipt.git.branch,
      head: receipt.git.head,
      changeFingerprint: receipt.git.changeFingerprint,
    },
    change: {
      filesChanged: receipt.change.filesChanged,
      insertions: receipt.change.insertions,
      deletions: receipt.change.deletions,
    },
    checks: {
      total: receipt.checks.length,
      passed,
      failed,
      other,
      byCategory: categories,
    },
    findings: receipt.findings.map((f) => ({
      id: f.id,
      code: f.code,
      title: f.title,
      severity: f.severity,
      message: f.message,
      ...(f.location ? { location: f.location } : {}),
    })),
    mostImportantFailure: top
      ? {
          kind: top.kind,
          name: top.name,
          status: top.status,
          summary: top.summary,
        }
      : null,
    repairAttempts: receipt.repairAttempts,
    nextAction: recommendedNextAction(receipt),
    artifacts: receipt.artifacts,
    evidenceDir: `.aftermath/runs/${pad}/`,
  };
}

function verdictHint(verdict: Verdict, ci: boolean): number {
  if (!ci) {
    if (verdict === 'verified' || verdict === 'partially_verified') return 0;
    if (verdict === 'failed' || verdict === 'cancelled') return 1;
    return 3;
  }
  if (verdict === 'verified') return 0;
  if (verdict === 'failed' || verdict === 'partially_verified') return 1;
  if (verdict === 'inconclusive' || verdict === 'cancelled') return 3;
  return 2;
}

/** Optional SARIF 2.1.0 subset for GitHub Code Scanning / Annotations consumers. */
export function buildSarif(receipt: Receipt): Record<string, unknown> {
  const results = receipt.findings.map((f) => {
    const result: Record<string, unknown> = {
      ruleId: f.code,
      level: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'note',
      message: { text: `${f.title}: ${f.message}` },
      properties: {
        findingId: f.id,
        relatedFiles: f.relatedFiles ?? [],
        relatedChecks: f.relatedChecks ?? [],
        evidence: f.evidence,
      },
    };
    if (f.location?.file) {
      result.locations = [
        {
          physicalLocation: {
            artifactLocation: { uri: f.location.file.replace(/\\/g, '/') },
            ...(f.location.line != null
              ? {
                  region: {
                    startLine: f.location.line,
                    ...(f.location.column != null ? { startColumn: f.location.column } : {}),
                  },
                }
              : {}),
          },
        },
      ];
    }
    return result;
  });

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Aftermath',
            informationUri: 'https://github.com/theworker02/aftermath',
            version: receipt.environment.aftermathVersion,
            rules: uniqueRules(receipt),
          },
        },
        results,
        properties: {
          aftermathRunId: receipt.id,
          aftermathRunNumber: receipt.runNumber,
          verdict: receipt.verdict,
          changeFingerprint: receipt.git.changeFingerprint,
        },
      },
    ],
  };
}

function uniqueRules(receipt: Receipt): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  const rules: Array<Record<string, unknown>> = [];
  for (const f of receipt.findings) {
    if (seen.has(f.code)) continue;
    seen.add(f.code);
    rules.push({
      id: f.code,
      name: f.title,
      shortDescription: { text: f.title },
      fullDescription: { text: f.message },
      defaultConfiguration: {
        level: f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'note',
      },
      helpUri: 'https://github.com/theworker02/aftermath/blob/main/docs/findings.md',
    });
  }
  return rules;
}
