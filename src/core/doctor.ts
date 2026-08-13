import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, validateConfig } from './config.js';
import { detectEcosystems } from './detect.js';
import { packageRoot, ensureAftermathDirs, loadReceiptJson } from './storage.js';
import type { DoctorReport, Receipt } from './types.js';
import { recommendedNextAction } from './repair.js';
import { mostImportantFailure, summarizeByCategory } from './receipt.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function which(bin: string): Promise<boolean> {
  try {
    await execFileAsync(process.platform === 'win32' ? 'where' : 'which', [bin], {
      windowsHide: true,
    });
    return true;
  } catch {
    return false;
  }
}

const ECO_TOOL: Record<string, string> = {
  rust: 'cargo',
  go: 'go',
  node: 'node',
  python: 'python',
  dart: 'dart',
  flutter: 'flutter',
  ruby: 'ruby',
  dotnet: 'dotnet',
  java: 'java',
};

export async function runDoctor(cwd = process.cwd()): Promise<DoctorReport> {
  const checks: DoctorReport['checks'] = [];

  const gitOk = await which('git');
  checks.push({
    name: 'Git',
    status: gitOk ? 'ok' : 'fail',
    detail: gitOk ? 'git available' : 'git not found on PATH',
  });

  const ecos = detectEcosystems(cwd);
  const byTool = new Map<string, string[]>();
  for (const eco of ecos) {
    const tool = ECO_TOOL[eco.id];
    if (!tool) continue;
    const list = byTool.get(tool) ?? [];
    const rel = eco.root === cwd ? '.' : eco.root.replace(cwd, '').replace(/^[/\\]/, '') || '.';
    list.push(`${eco.id}@${rel}`);
    byTool.set(tool, list);
  }

  if (byTool.size === 0) {
    checks.push({
      name: 'Ecosystems',
      status: 'warn',
      detail: 'no known ecosystem markers detected',
    });
  } else {
    const toolNames = [...byTool.keys()];
    const availability: string[] = [];
    for (const tool of toolNames) {
      const ok = await which(tool);
      const roots = byTool.get(tool) ?? [];
      availability.push(
        ok ? `${tool} ok (${roots.length} root${roots.length === 1 ? '' : 's'})` : `${tool} missing`,
      );
      if (!ok) {
        checks.push({
          name: tool,
          status: 'warn',
          detail: `required for ${roots.join(', ')}`,
        });
      }
    }
    checks.push({
      name: 'Ecosystems',
      status: availability.some((a) => a.includes('missing')) ? 'warn' : 'ok',
      detail: `${ecos.length} detected · tools: ${availability.join('; ')}`,
    });
  }

  const validation = validateConfig(cwd);
  if (!validation.ok) {
    checks.push({
      name: 'Configuration',
      status: 'fail',
      detail: validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
    });
  } else if (validation.usingDefaults) {
    checks.push({
      name: 'Configuration',
      status: 'ok',
      detail: 'using defaults (no .aftermath.toml)',
    });
  } else {
    const warnBits = validation.warnings.map((w) => w.message);
    checks.push({
      name: 'Configuration',
      status: warnBits.length ? 'warn' : 'ok',
      detail: warnBits.length
        ? `valid ${validation.path} · ${warnBits.join('; ')}`
        : `valid ${validation.path} (v${validation.config.version})`,
    });
  }

  const dirs = ensureAftermathDirs(cwd);
  checks.push({
    name: 'Baseline',
    status: existsSync(dirs.baseline) ? 'ok' : 'missing',
    detail: existsSync(dirs.baseline) ? dirs.baseline : 'no baseline.json yet',
  });

  const pluginRoot = packageRoot();
  const pluginLayout = [
    ['.cursor-plugin/plugin.json', 'manifest'],
    ['commands', 'commands'],
    ['skills', 'skills'],
    ['agents', 'agents'],
    ['hooks/hooks.json', 'hooks'],
    ['mcp.json', 'mcp config'],
    ['assets/logo.svg', 'logo'],
  ] as const;
  const missingLayout: string[] = [];
  for (const [rel, label] of pluginLayout) {
    if (!existsSync(join(pluginRoot, rel))) missingLayout.push(label);
  }
  checks.push({
    name: 'Cursor Plugin',
    status: missingLayout.length === 0 ? 'ok' : 'fail',
    detail:
      missingLayout.length === 0
        ? 'plugin layout complete'
        : `missing: ${missingLayout.join(', ')}`,
  });

  const manifestPath = join(pluginRoot, '.cursor-plugin', 'plugin.json');
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
        name?: string;
        version?: string;
        logo?: string;
      };
      const issues: string[] = [];
      if (!manifest.name) issues.push('name');
      if (!manifest.version) issues.push('version');
      if (manifest.logo && !existsSync(join(pluginRoot, manifest.logo))) issues.push('logo file');
      checks.push({
        name: 'Plugin Manifest',
        status: issues.length ? 'warn' : 'ok',
        detail: issues.length ? `issues: ${issues.join(', ')}` : `${manifest.name}@${manifest.version}`,
      });
    } catch {
      checks.push({
        name: 'Plugin Manifest',
        status: 'fail',
        detail: 'plugin.json is not valid JSON',
      });
    }
  }

  const mcpEntry = join(pluginRoot, 'dist', 'mcp', 'index.js');
  checks.push({
    name: 'MCP',
    status: existsSync(mcpEntry) ? 'ok' : 'warn',
    detail: existsSync(mcpEntry)
      ? 'MCP server build present'
      : 'build MCP with npm run build',
  });

  const extensionPkg = join(pluginRoot, 'extension', 'package.json');
  const extensionOut = join(pluginRoot, 'extension', 'out', 'extension.js');
  const extensionIcon = join(pluginRoot, 'extension', 'media', 'icon.svg');
  if (!existsSync(extensionPkg)) {
    checks.push({
      name: 'Extension',
      status: 'missing',
      detail: 'optional extension not present',
    });
  } else {
    const parts = ['scaffold present'];
    if (existsSync(extensionIcon)) parts.push('icon.svg');
    if (existsSync(extensionOut)) parts.push('compiled');
    else parts.push('not compiled (optional)');
    checks.push({
      name: 'Extension',
      status: 'ok',
      detail: parts.join(' · '),
    });
  }

  const healthy = !checks.some((c) => c.status === 'fail');
  return { checks, healthy };
}

export function loadReceipt(cwd: string, runRef: string): Receipt {
  return loadReceiptJson(cwd, runRef);
}

export function inspectRun(cwd: string, runRef: string): string {
  const receipt = loadReceipt(cwd, runRef);
  const dirs = ensureAftermathDirs(cwd);
  const runDir = join(dirs.runs, String(receipt.runNumber).padStart(4, '0'));
  const categories = summarizeByCategory(receipt);
  const topFail = mostImportantFailure(receipt);
  const { config } = (() => {
    try {
      return loadConfig(cwd);
    } catch {
      return { config: null };
    }
  })();

  const lines = [
    `AFTERMATH INSPECT #${receipt.runNumber}`,
    '',
    `Run id: ${receipt.id}`,
    `Created: ${receipt.createdAt}`,
    `Task: ${receipt.notes.find((n) => n.startsWith('Task:')) ?? '(none)'}`,
    `Verdict: ${receipt.verdict}`,
    `Repair attempts: ${receipt.repairAttempts}`,
    '',
    'Environment:',
    `- OS: ${receipt.environment.os}/${receipt.environment.arch}`,
    `- Node: ${receipt.environment.nodeVersion}`,
    `- Aftermath: ${receipt.environment.aftermathVersion}`,
    `- Git: ${receipt.environment.gitVersion ?? 'unknown'}`,
  ];

  const tools = Object.entries(receipt.environment.toolVersions ?? {});
  if (tools.length) {
    lines.push(`- Tools: ${tools.map(([k, v]) => `${k}=${v}`).join(', ')}`);
  }

  lines.push(
    '',
    'Repository / Git:',
    `- Root: ${receipt.repository.root}`,
    `- Branch: ${receipt.git.branch ?? 'unknown'}`,
    `- HEAD: ${receipt.git.head ?? 'unknown'}`,
    `- Dirty: ${receipt.git.dirty}`,
    `- Change fingerprint: ${receipt.git.changeFingerprint}`,
    '',
    'Diff summary:',
    `- ${receipt.change.filesChanged} files +${receipt.change.insertions} -${receipt.change.deletions}`,
  );

  for (const [cat, count] of Object.entries(receipt.change.byCategory)) {
    lines.push(`- ${cat}: ${count}`);
  }

  lines.push('', 'Plan:');
  lines.push(`- Full mode: ${receipt.plan.full}`);
  lines.push(
    `- Ecosystems: ${
      receipt.plan.ecosystems.length
        ? receipt.plan.ecosystems.map((e) => `${e.id}(${e.confidence})`).join(', ')
        : '(none)'
    }`,
  );
  lines.push(`- Planned commands: ${receipt.plan.commands.length}`);
  for (const note of receipt.plan.notes.slice(0, 8)) {
    lines.push(`- note: ${note}`);
  }

  lines.push('', 'Category summary:');
  const kindKeys = Object.keys(categories);
  if (!kindKeys.length) lines.push('- (none)');
  for (const kind of kindKeys) {
    const c = categories[kind]!;
    lines.push(`- ${kind}: ${c.pass} pass / ${c.fail} fail / ${c.other} other`);
  }

  lines.push('', 'Commands executed:');
  for (const c of receipt.checks) {
    const duration =
      typeof c.durationMs === 'number' ? ` (${(c.durationMs / 1000).toFixed(1)}s)` : '';
    lines.push(
      `- [${c.status}] ${c.kind}/${c.name}: ${[c.command, ...c.args].join(' ')}${duration}`,
    );
  }

  lines.push('', 'Failures:');
  const fails = receipt.checks.filter((c) => c.status === 'fail' || c.status === 'timeout');
  if (!fails.length) lines.push('- none');
  for (const f of fails) lines.push(`- ${f.name}: ${f.summary ?? f.status}`);

  if (topFail) {
    lines.push('', 'Most important failure:');
    lines.push(`- ${topFail.kind}/${topFail.name}: ${topFail.summary ?? topFail.status}`);
  }

  lines.push('', 'Findings:');
  if (!receipt.findings.length) lines.push('- none');
  for (const f of receipt.findings) {
    lines.push(`- ${f.id} ${f.code} ${f.title} [${f.severity}]: ${f.message}`);
  }

  lines.push('', 'Baseline:');
  lines.push(
    `- Present: ${receipt.baseline?.present ?? false}${
      receipt.baseline?.path ? ` (${receipt.baseline.path})` : ''
    }`,
  );
  lines.push(`- Compared: ${receipt.baseline?.compared ?? false}`);

  if (config?.policy) {
    lines.push('', 'Policy (effective):');
    lines.push(`- tests_must_pass: ${config.policy.tests_must_pass}`);
    lines.push(`- max_repair_attempts: ${config.policy.max_repair_attempts}`);
  }

  lines.push('', 'Artifacts:');
  if (existsSync(runDir)) lines.push(`- ${runDir}`);
  for (const a of receipt.artifacts) lines.push(`- ${a}`);

  lines.push('', 'Recommended next action:');
  lines.push(`- ${recommendedNextAction(receipt)}`);

  return lines.join('\n');
}
