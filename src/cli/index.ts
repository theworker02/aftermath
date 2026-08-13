#!/usr/bin/env node
import { createBaseline } from '../core/baseline.js';
import { compareWithBaseline } from '../core/compare.js';
import { formatConfigValidation, validateConfig } from '../core/config.js';
import { inspectRun, loadReceipt, runDoctor } from '../core/doctor.js';
import { explainReceipt, buildRepairContext } from '../core/repair.js';
import { recordRepairAttempt } from '../core/repair-state.js';
import { collectDiffPatch } from '../core/git.js';
import { loadConfig } from '../core/config.js';
import { formatStatus, getAftermathStatus } from '../core/status.js';
import { renderHtmlReceipt, renderHumanReceipt } from '../core/receipt.js';
import {
  aftermathVersion,
  ensureAftermathDirs,
  resolveRunDir,
  resolveRunRef,
  writeText,
} from '../core/storage.js';
import { verifyRepository } from '../core/verify.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function printHelp(): void {
  console.log(`Aftermath — independent verification for agent-written code.

Usage:
  aftermath verify [--full] [--ci] [--json] [--sarif] [--cwd <path>]
  aftermath baseline [--force] [--cwd <path>]
  aftermath status [--cwd <path>]
  aftermath inspect <run|latest>
  aftermath explain <run|latest>
  aftermath compare [run|latest]
  aftermath repair-context <run|latest>
  aftermath receipt <run|latest> [--html|--md|--json]
  aftermath config validate [--cwd <path>]
  aftermath doctor
  aftermath version
  aftermath help

Run aliases:
  latest, last     resolve to the newest verification run

Exit codes (CI):
  0 verification gates passed
  1 verification gate failed
  2 configuration or infrastructure error
  3 verification inconclusive

Machine output:
  summary.json   always written under .aftermath/runs/<n>/
  receipt.html   always written for sharing / screenshots
  --json         print summary.json to stdout
  --sarif        also write findings.sarif (also written in --ci)
`);
}

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const cmd = args[0] ?? 'help';
  const cwdFlag = readFlag(args, '--cwd') ?? process.cwd();

  try {
    switch (cmd) {
      case 'help':
      case '--help':
      case '-h':
        printHelp();
        return 0;
      case 'version':
      case '--version':
      case '-V':
        console.log(aftermathVersion());
        return 0;
      case 'status': {
        console.log(formatStatus(getAftermathStatus(cwdFlag)));
        return 0;
      }
      case 'verify': {
        const result = await verifyRepository({
          cwd: cwdFlag,
          full: args.includes('--full'),
          ci: args.includes('--ci'),
          json: args.includes('--json'),
          sarif: args.includes('--sarif'),
        });
        if (args.includes('--json')) {
          console.log(result.jsonSummary ?? '{}');
        } else {
          console.log(result.consoleSummary);
        }
        return result.exitCode;
      }
      case 'baseline': {
        const result = await createBaseline({
          cwd: cwdFlag,
          force: args.includes('--force'),
        });
        console.log(
          `Baseline ${result.overwritten ? 'overwritten' : 'created'} at ${result.path}`,
        );
        return 0;
      }
      case 'inspect': {
        const run = args[1] ?? 'latest';
        console.log(inspectRun(cwdFlag, run));
        return 0;
      }
      case 'explain': {
        const run = args[1] ?? 'latest';
        const receipt = loadReceipt(cwdFlag, run);
        console.log(explainReceipt(receipt));
        return 0;
      }
      case 'compare': {
        const run = args[1] && !args[1].startsWith('-') ? args[1] : 'latest';
        console.log(compareWithBaseline(cwdFlag, run));
        return 0;
      }
      case 'repair-context': {
        const run = args[1] ?? 'latest';
        const receipt = loadReceipt(cwdFlag, run);
        const { config } = loadConfig(cwdFlag);
        const attempts = recordRepairAttempt(
          cwdFlag,
          receipt.git.changeFingerprint,
          receipt.runNumber,
          `repair-context generated for run #${receipt.runNumber}`,
        );
        receipt.repairAttempts = attempts;
        const patch = await collectDiffPatch(cwdFlag);
        const text = buildRepairContext(receipt, { patch, config });
        const runDir = resolveRunDir(cwdFlag, resolveRunRef(cwdFlag, run));
        ensureAftermathDirs(cwdFlag);
        const out = join(runDir, 'repair-context.md');
        writeText(out, text);
        console.log(text);
        console.log(`\nWrote ${out}`);
        console.log(`Repair attempts for fingerprint: ${attempts}`);
        return 0;
      }
      case 'receipt': {
        const run = args[1] && !args[1].startsWith('-') ? args[1] : 'latest';
        const receipt = loadReceipt(cwdFlag, run);
        const runDir = resolveRunDir(cwdFlag, receipt.runNumber);
        const wantHtml = args.includes('--html');
        const wantMd = args.includes('--md');
        const wantJson = args.includes('--json');
        const anyFormat = wantHtml || wantMd || wantJson;

        if (!anyFormat || wantHtml) {
          const html = renderHtmlReceipt(receipt);
          const htmlPath = join(runDir, 'receipt.html');
          writeText(htmlPath, html);
          const dirs = ensureAftermathDirs(cwdFlag);
          writeText(
            join(dirs.receipts, `run_${String(receipt.runNumber).padStart(4, '0')}.html`),
            html,
          );
          if (wantHtml || !anyFormat) {
            console.log(htmlPath);
          }
        }
        if (wantMd) {
          const mdPath = join(runDir, 'receipt.md');
          writeText(mdPath, renderHumanReceipt(receipt));
          console.log(mdPath);
        }
        if (wantJson) {
          console.log(JSON.stringify(receipt, null, 2));
        }
        if (!anyFormat) {
          // Default: ensure HTML exists and print paths
          const md = join(runDir, 'receipt.md');
          if (existsSync(md)) console.log(md);
          console.log(`Verdict: ${receipt.verdict} · findings: ${receipt.findings.length}`);
        }
        return 0;
      }
      case 'config': {
        const sub = args[1] ?? 'validate';
        if (sub !== 'validate') {
          throw new Error('Usage: aftermath config validate [--cwd <path>]');
        }
        const result = validateConfig(cwdFlag);
        console.log(formatConfigValidation(result));
        return result.ok ? 0 : 2;
      }
      case 'doctor': {
        const report = await runDoctor(cwdFlag);
        console.log('AFTERMATH DOCTOR');
        for (const c of report.checks) {
          console.log(`${c.name.padEnd(16, ' ')} ${c.status.toUpperCase().padEnd(8, ' ')} ${c.detail}`);
        }
        return report.healthy ? 0 : 1;
      }
      default:
        console.error(`Unknown command: ${cmd}`);
        printHelp();
        return 2;
    }
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

function readFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx >= 0) return args[idx + 1];
  const pref = args.find((a) => a.startsWith(`${name}=`));
  return pref ? pref.slice(name.length + 1) : undefined;
}

main(process.argv).then((code) => {
  process.exitCode = code;
});
