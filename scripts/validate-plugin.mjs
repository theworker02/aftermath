#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function mustExist(rel) {
  if (!existsSync(join(root, rel))) errors.push(`Missing: ${rel}`);
}

const manifestPath = join(root, '.cursor-plugin', 'plugin.json');
mustExist('.cursor-plugin/plugin.json');
mustExist('mcp.json');
mustExist('hooks/hooks.json');
mustExist('rules/aftermath.mdc');
mustExist('agents/verifier.md');
mustExist('agents/regression-reviewer.md');
mustExist('commands/verify.md');
mustExist('commands/baseline.md');
mustExist('commands/inspect.md');
mustExist('commands/explain.md');
mustExist('commands/repair.md');
mustExist('skills/aftermath-verification/SKILL.md');
mustExist('assets/logo.svg');
mustExist('scripts/hooks/session-start.mjs');
mustExist('scripts/hooks/agent-stop.mjs');

if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest.name || !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(manifest.name)) {
    errors.push('plugin.json name must be lowercase kebab-case');
  }
  if (!manifest.version) errors.push('plugin.json missing version');
  if (!manifest.logo) errors.push('plugin.json missing logo');
  else mustExist(manifest.logo);

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  if (manifest.version && pkg.version && manifest.version !== pkg.version) {
    errors.push(
      `version mismatch: plugin.json=${manifest.version} package.json=${pkg.version}`,
    );
  }
}

const hooks = JSON.parse(readFileSync(join(root, 'hooks', 'hooks.json'), 'utf8'));
for (const entries of Object.values(hooks.hooks ?? {})) {
  for (const entry of entries) {
    const command = entry.command ?? '';
    const match = command.match(/(?:^|\s)(\.\/scripts\/[^\s]+)/);
    if (match?.[1]) mustExist(match[1].replace(/^\.\//, ''));
    else if (command.startsWith('./')) mustExist(command.replace(/^\.\//, ''));
  }
}

const mcp = JSON.parse(readFileSync(join(root, 'mcp.json'), 'utf8'));
if (!mcp.mcpServers?.aftermath) errors.push('mcp.json missing aftermath server');

if (errors.length) {
  console.error('Plugin validation failed:');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}
console.log('Plugin validation passed.');
