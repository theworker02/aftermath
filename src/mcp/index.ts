#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createBaseline, loadBaseline } from '../core/baseline.js';
import { compareWithBaseline } from '../core/compare.js';
import { formatConfigValidation, validateConfig } from '../core/config.js';
import { inspectRun, loadReceipt, runDoctor } from '../core/doctor.js';
import { explainReceipt, buildRepairContext } from '../core/repair.js';
import { recordRepairAttempt } from '../core/repair-state.js';
import { collectDiffPatch } from '../core/git.js';
import { loadConfig } from '../core/config.js';
import { formatStatus, getAftermathStatus } from '../core/status.js';
import { verifyRepository } from '../core/verify.js';
import { aftermathVersion } from '../core/storage.js';

const server = new McpServer({
  name: 'aftermath',
  version: aftermathVersion(),
});

server.tool(
  'aftermath_verify',
  'Run Aftermath verification and return the receipt summary. Prefer this over inventing PASS/FAIL.',
  {
    cwd: z.string().optional().describe('Repository root'),
    full: z.boolean().optional().describe('Run full verification ignoring smart scope'),
    ci: z.boolean().optional().describe('Use CI exit semantics'),
    json: z.boolean().optional().describe('Return machine-readable summary JSON'),
    task: z.string().optional().describe('Optional task description'),
  },
  async ({ cwd, full, ci, json, task }) => {
    const result = await verifyRepository({
      cwd: cwd ?? process.cwd(),
      full,
      ci,
      json,
      sarif: ci,
      taskDescription: task,
    });
    return {
      content: [
        {
          type: 'text',
          text: json
            ? (result.jsonSummary ?? '{}')
            : JSON.stringify(
                {
                  summary: result.consoleSummary,
                  verdict: result.receipt.verdict,
                  runNumber: result.receipt.runNumber,
                  findings: result.receipt.findings,
                  exitCode: result.exitCode,
                  evidenceDir: `.aftermath/runs/${String(result.receipt.runNumber).padStart(4, '0')}/`,
                },
                null,
                2,
              ),
        },
      ],
    };
  },
);

server.tool(
  'aftermath_get_receipt',
  'Load a verification receipt by run id/number. Pass "latest" for the newest run.',
  {
    run: z.string().describe('Run number, run_#### id, or "latest"'),
    cwd: z.string().optional(),
  },
  async ({ run, cwd }) => {
    const receipt = loadReceipt(cwd ?? process.cwd(), run);
    return { content: [{ type: 'text', text: JSON.stringify(receipt, null, 2) }] };
  },
);

server.tool(
  'aftermath_get_findings',
  'Get findings for a verification run. Pass "latest" for the newest run.',
  {
    run: z.string().optional().describe('Run number or "latest" (default)'),
    cwd: z.string().optional(),
  },
  async ({ run, cwd }) => {
    const receipt = loadReceipt(cwd ?? process.cwd(), run ?? 'latest');
    return { content: [{ type: 'text', text: JSON.stringify(receipt.findings, null, 2) }] };
  },
);

server.tool(
  'aftermath_get_baseline',
  'Get the current repository baseline snapshot.',
  { cwd: z.string().optional() },
  async ({ cwd }) => {
    const baseline = loadBaseline(cwd ?? process.cwd());
    return {
      content: [
        {
          type: 'text',
          text: baseline ? JSON.stringify(baseline, null, 2) : 'No baseline present.',
        },
      ],
    };
  },
);

server.tool(
  'aftermath_prepare_repair',
  'Prepare a compact repair context package for a failed run. Pass "latest" for the newest run.',
  {
    run: z.string().optional().describe('Run number or "latest" (default)'),
    cwd: z.string().optional(),
  },
  async ({ run, cwd }) => {
    const root = cwd ?? process.cwd();
    const receipt = loadReceipt(root, run ?? 'latest');
    const { config } = loadConfig(root);
    const attempts = recordRepairAttempt(
      root,
      receipt.git.changeFingerprint,
      receipt.runNumber,
      `MCP repair-context for run #${receipt.runNumber}`,
    );
    receipt.repairAttempts = attempts;
    const patch = await collectDiffPatch(root);
    const text = buildRepairContext(receipt, { patch, config });
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'aftermath_compare',
  'Compare the repository baseline against the latest (or specified) verification run.',
  {
    cwd: z.string().optional(),
    run: z.string().optional().describe('Optional run number or "latest"'),
  },
  async ({ cwd, run }) => {
    const text = compareWithBaseline(cwd ?? process.cwd(), run ?? 'latest');
    return { content: [{ type: 'text', text }] };
  },
);

server.tool(
  'aftermath_explain_finding',
  'Explain why a verification run failed, distinguishing observation vs finding vs relation. Pass "latest" for the newest run.',
  {
    run: z.string().optional().describe('Run number or "latest" (default)'),
    cwd: z.string().optional(),
  },
  async ({ run, cwd }) => {
    const receipt = loadReceipt(cwd ?? process.cwd(), run ?? 'latest');
    return { content: [{ type: 'text', text: explainReceipt(receipt) }] };
  },
);

server.tool(
  'aftermath_inspect',
  'Inspect a previous Aftermath run. Pass "latest" for the newest run.',
  {
    run: z.string().optional().describe('Run number or "latest" (default)'),
    cwd: z.string().optional(),
  },
  async ({ run, cwd }) => {
    return {
      content: [{ type: 'text', text: inspectRun(cwd ?? process.cwd(), run ?? 'latest') }],
    };
  },
);

server.tool(
  'aftermath_baseline',
  'Create a repository health baseline. Requires force=true to overwrite.',
  {
    cwd: z.string().optional(),
    force: z.boolean().optional(),
  },
  async ({ cwd, force }) => {
    const result = await createBaseline({ cwd: cwd ?? process.cwd(), force });
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ path: result.path, overwritten: result.overwritten }, null, 2),
        },
      ],
    };
  },
);

server.tool('aftermath_doctor', 'Run Aftermath doctor diagnostics.', { cwd: z.string().optional() }, async ({
  cwd,
}) => {
  const report = await runDoctor(cwd ?? process.cwd());
  return { content: [{ type: 'text', text: JSON.stringify(report, null, 2) }] };
});

server.tool(
  'aftermath_config_validate',
  'Validate .aftermath.toml against the Aftermath configuration schema.',
  { cwd: z.string().optional() },
  async ({ cwd }) => {
    const result = validateConfig(cwd ?? process.cwd());
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ok: result.ok,
              path: result.path,
              usingDefaults: result.usingDefaults,
              errors: result.errors,
              warnings: result.warnings,
              report: formatConfigValidation(result),
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  'aftermath_status',
  'Show latest verdict, finding counts, baseline presence, and receipt paths.',
  { cwd: z.string().optional() },
  async ({ cwd }) => {
    const status = getAftermathStatus(cwd ?? process.cwd());
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ ...status, report: formatStatus(status) }, null, 2),
        },
      ],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
