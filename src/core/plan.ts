import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { detectEcosystems, readPackageScripts } from './detect.js';
import type {
  AftermathConfig,
  DetectedEcosystem,
  DiffSummary,
  PlannedCommand,
  VerificationPlan,
} from './types.js';

export function buildVerificationPlan(opts: {
  cwd: string;
  config: AftermathConfig;
  diff: DiffSummary;
  full?: boolean;
}): VerificationPlan {
  const ecosystems = detectEcosystems(opts.cwd);
  const timeout = opts.config.limits?.command_timeout_seconds ?? 900;
  const commands: PlannedCommand[] = [];
  const notes: string[] = [];

  const docsOnly =
    opts.diff.filesChanged > 0 &&
    opts.diff.files.every((f) => f.category === 'docs' || f.category === 'assets');

  const depTouched = opts.diff.files.some(
    (f) => f.category === 'dependencies' || f.category === 'lockfile',
  );
  if (depTouched) {
    notes.push(
      'Dependency/lockfile changes detected — prefer full verification and review AF009 dependency findings.',
    );
  }

  const workspaceRoots = detectNodeWorkspaces(opts.cwd);
  if (workspaceRoots.length > 1) {
    notes.push(
      `Node workspace roots detected (${workspaceRoots.length}): scoping package scripts to changed packages when possible.`,
    );
  }

  // 1. Config commands
  addConfigCommands(commands, opts.cwd, opts.config, timeout);

  // 2. CI workflow discovery (only if config didn't supply that kind)
  const ciCommands = discoverCiCommands(opts.cwd, timeout);
  mergeByKind(commands, ciCommands);

  // 3. Makefile / justfile (repo-root task runners)
  mergePreferExisting(commands, discoverMakefileCommands(opts.cwd, timeout));
  mergePreferExisting(commands, discoverJustfileCommands(opts.cwd, timeout));

  // 4. Package scripts / ecosystem conventions
  for (const eco of ecosystems) {
    if (!shouldIncludeEcosystem(eco, opts.diff, opts.full ?? false, workspaceRoots)) {
      notes.push(`Scoped out ${eco.id} at ${eco.root} (no overlapping changes).`);
      continue;
    }
    const discovered = discoverForEcosystem(eco, timeout);
    mergePreferExisting(commands, discovered);
  }

  // Smoke / benchmarks from config
  for (const smoke of opts.config.smoke ?? []) {
    const parsed = splitCommand(smoke.command);
    commands.push({
      id: `smoke:${smoke.name}`,
      kind: 'smoke',
      name: smoke.name,
      command: parsed.command,
      args: parsed.args,
      cwd: opts.cwd,
      timeoutSeconds: smoke.timeout_seconds ?? 60,
      source: 'smoke',
      mandatory: true,
      destructive: false,
      readyPattern: smoke.ready_pattern,
    });
  }

  const skipBench =
    docsOnly && (opts.config.scope?.skip_benchmarks_on_docs_only ?? true) && !opts.full;
  if (!skipBench) {
    for (const bench of opts.config.benchmark ?? []) {
      const parsed = splitCommand(bench.command);
      commands.push({
        id: `benchmark:${bench.name}`,
        kind: 'benchmark',
        name: bench.name,
        command: parsed.command,
        args: parsed.args,
        cwd: opts.cwd,
        timeoutSeconds: timeout,
        source: 'benchmark',
        mandatory: false,
        destructive: false,
      });
    }
  } else if ((opts.config.benchmark ?? []).length > 0) {
    notes.push('Skipped benchmarks (docs/assets-only change). Use --full to include.');
  }

  // Safety annotations
  for (const cmd of commands) {
    cmd.destructive = isDestructive(cmd);
  }

  return {
    createdAt: new Date().toISOString(),
    full: Boolean(opts.full),
    ecosystems,
    commands,
    notes,
  };
}

function addConfigCommands(
  out: PlannedCommand[],
  cwd: string,
  config: AftermathConfig,
  timeout: number,
): void {
  const groups: Array<[keyof NonNullable<AftermathConfig['verify']>, PlannedCommand['kind']]> = [
    ['build', 'build'],
    ['test', 'test'],
    ['lint', 'lint'],
    ['typecheck', 'typecheck'],
    ['format', 'format'],
  ];
  for (const [key, kind] of groups) {
    for (const [idx, line] of (config.verify?.[key] ?? []).entries()) {
      const parsed = splitCommand(line);
      out.push({
        id: `config:${kind}:${idx}`,
        kind,
        name: `${kind}:${idx + 1}`,
        command: parsed.command,
        args: parsed.args,
        cwd,
        timeoutSeconds: timeout,
        source: 'config',
        mandatory: kind !== 'format',
        destructive: false,
      });
    }
  }
}

function discoverCiCommands(cwd: string, timeout: number): PlannedCommand[] {
  const workflowsDir = join(cwd, '.github', 'workflows');
  if (!existsSync(workflowsDir)) return [];
  const out: PlannedCommand[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(workflowsDir).filter((f) => /\.ya?ml$/i.test(f));
  } catch {
    return [];
  }

  const seen = new Set<string>();
  for (const file of files) {
    const text = readFileSync(join(workflowsDir, file), 'utf8');
    const runLines = extractCiRunLines(text);
    for (const [idx, line] of runLines.entries()) {
      if (!looksLikeVerification(line)) continue;
      if (isSetupOnlyLine(line)) continue;
      if (isDestructiveLine(line)) continue;
      const parsed = splitCommand(line);
      if (!parsed.command) continue;
      const kind = inferKind(line);
      const dedupe = `${kind}:${parsed.command}:${parsed.args.join(' ')}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({
        id: `ci:${file}:${idx}`,
        kind,
        name: `ci:${basename(file)}:${kind}`,
        command: parsed.command,
        args: parsed.args,
        cwd,
        timeoutSeconds: timeout,
        source: 'ci',
        mandatory: kind === 'test' || kind === 'build',
        destructive: false,
      });
    }
  }
  return out;
}

/** Extract runnable lines from GitHub Actions YAML, including folded/literal blocks. */
export function extractCiRunLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const m = line.match(/^\s*-?\s*run:\s*(.*)$/);
    if (!m) continue;
    const rest = (m[1] ?? '').trim();
    if (rest === '|' || rest === '>' || rest === '' || rest === '|-' || rest === '>-') {
      // Take first non-empty indented continuation as the primary command
      for (let j = i + 1; j < lines.length; j++) {
        const cont = lines[j] ?? '';
        if (/^\s*#/.test(cont)) continue;
        if (!/^\s+\S/.test(cont)) break;
        const cmd = cont.trim();
        // Skip nested YAML list markers that aren't shell
        if (cmd.startsWith('- ') && !/\b(npm|pnpm|yarn|cargo|go|pytest|dotnet|mvn|gradle|make|just)\b/i.test(cmd)) {
          continue;
        }
        if (cmd) {
          out.push(cmd.replace(/^-\s+/, ''));
          break;
        }
      }
      continue;
    }
    if (rest) out.push(stripYamlScalar(rest));
  }
  return out;
}

function isSetupOnlyLine(line: string): boolean {
  return /^(npm ci|npm install|pnpm install|yarn install|pip install|cargo fetch|actions\/checkout)\b/i.test(
    line.trim(),
  );
}

const MAKE_TARGETS = ['test', 'check', 'lint', 'build', 'typecheck', 'verify', 'fmt', 'format'];

function discoverMakefileCommands(cwd: string, timeout: number): PlannedCommand[] {
  const makefile = ['Makefile', 'makefile', 'GNUmakefile']
    .map((n) => join(cwd, n))
    .find((p) => existsSync(p));
  if (!makefile) return [];
  let text = '';
  try {
    text = readFileSync(makefile, 'utf8');
  } catch {
    return [];
  }
  const targets = new Set(
    [...text.matchAll(/^([A-Za-z0-9_.-]+)\s*:/gm)].map((m) => m[1]!).filter(Boolean),
  );
  const out: PlannedCommand[] = [];
  for (const target of MAKE_TARGETS) {
    if (!targets.has(target)) continue;
    const kind = inferKind(target);
    out.push(
      cmd('makefile', kind, `make-${target}`, 'make', [target], cwd, timeout, kind === 'test' || kind === 'build'),
    );
  }
  return out;
}

function discoverJustfileCommands(cwd: string, timeout: number): PlannedCommand[] {
  const justfile = ['justfile', 'Justfile']
    .map((n) => join(cwd, n))
    .find((p) => existsSync(p));
  if (!justfile) return [];
  let text = '';
  try {
    text = readFileSync(justfile, 'utf8');
  } catch {
    return [];
  }
  const recipes = new Set(
    [...text.matchAll(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm)].map((m) => m[1]!),
  );
  const out: PlannedCommand[] = [];
  for (const target of MAKE_TARGETS) {
    if (!recipes.has(target)) continue;
    const kind = inferKind(target);
    out.push(
      cmd('makefile', kind, `just-${target}`, 'just', [target], cwd, timeout, kind === 'test' || kind === 'build'),
    );
  }
  return out;
}

export function detectNodeWorkspaces(cwd: string): string[] {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return [];
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      workspaces?: string[] | { packages?: string[] };
    };
    const patterns = Array.isArray(pkg.workspaces)
      ? pkg.workspaces
      : (pkg.workspaces?.packages ?? []);
    if (!patterns.length) {
      // pnpm-workspace
      const pnpm = join(cwd, 'pnpm-workspace.yaml');
      if (existsSync(pnpm)) {
        const text = readFileSync(pnpm, 'utf8');
        const pkgs = [...text.matchAll(/^\s*-\s*['"]?([^'"\n]+)['"]?/gm)].map((m) => m[1]!);
        return expandWorkspaceGlobs(cwd, pkgs);
      }
      return [cwd];
    }
    return expandWorkspaceGlobs(cwd, patterns);
  } catch {
    return [cwd];
  }
}

function expandWorkspaceGlobs(cwd: string, patterns: string[]): string[] {
  const roots = new Set<string>([cwd]);
  for (const pattern of patterns) {
    // Support simple "packages/*" style only
    const star = pattern.replace(/\\/g, '/').match(/^(.+)\/\*$/);
    if (star) {
      const base = join(cwd, star[1]!);
      if (!existsSync(base)) continue;
      try {
        for (const name of readdirSync(base)) {
          const child = join(base, name);
          if (existsSync(join(child, 'package.json'))) roots.add(child);
        }
      } catch {
        // ignore
      }
    } else {
      const abs = join(cwd, pattern);
      if (existsSync(join(abs, 'package.json'))) roots.add(abs);
    }
  }
  return [...roots];
}

function discoverForEcosystem(eco: DetectedEcosystem, timeout: number): PlannedCommand[] {
  switch (eco.id) {
    case 'rust':
      return [
        cmd('ecosystem', 'build', 'cargo-check', 'cargo', ['check', '--workspace'], eco.root, timeout, true),
        cmd('ecosystem', 'test', 'cargo-test', 'cargo', ['test', '--workspace'], eco.root, timeout, true),
        cmd(
          'ecosystem',
          'lint',
          'cargo-clippy',
          'cargo',
          ['clippy', '--workspace', '--all-targets', '--', '-D', 'warnings'],
          eco.root,
          timeout,
          false,
        ),
      ];
    case 'go':
      return [
        cmd('ecosystem', 'test', 'go-test', 'go', ['test', './...'], eco.root, timeout, true),
        cmd('ecosystem', 'lint', 'go-vet', 'go', ['vet', './...'], eco.root, timeout, false),
      ];
    case 'node': {
      const scripts = readPackageScripts(join(eco.root, 'package.json'));
      const out: PlannedCommand[] = [];
      const pm = detectNodePm(eco.root);
      const run = (script: string) =>
        pm === 'npm'
          ? cmd('package-script', inferKind(script), script, 'npm', ['run', script], eco.root, timeout, script === 'test' || script === 'build')
          : pm === 'pnpm'
            ? cmd('package-script', inferKind(script), script, 'pnpm', ['run', script], eco.root, timeout, script === 'test' || script === 'build')
            : cmd('package-script', inferKind(script), script, 'yarn', [script], eco.root, timeout, script === 'test' || script === 'build');

      for (const name of ['build', 'test', 'lint', 'typecheck', 'check', 'format']) {
        if (scripts[name]) out.push(run(name));
      }
      // Prefer typecheck aliases
      if (!scripts.typecheck && scripts['type-check']) out.push(run('type-check'));
      return out;
    }
    case 'python': {
      const out: PlannedCommand[] = [];
      if (existsSync(join(eco.root, 'pyproject.toml')) || existsSync(join(eco.root, 'pytest.ini'))) {
        out.push(cmd('ecosystem', 'test', 'pytest', 'pytest', [], eco.root, timeout, true));
      }
      if (existsSync(join(eco.root, 'tox.ini'))) {
        out.push(cmd('ecosystem', 'test', 'tox', 'tox', [], eco.root, timeout, true));
      }
      // Conservative: only add mypy/ruff if config present
      const pyproject = existsSync(join(eco.root, 'pyproject.toml'))
        ? readFileSync(join(eco.root, 'pyproject.toml'), 'utf8')
        : '';
      if (/\[tool\.mypy\]/.test(pyproject) || existsSync(join(eco.root, 'mypy.ini'))) {
        out.push(cmd('ecosystem', 'typecheck', 'mypy', 'mypy', ['.'], eco.root, timeout, false));
      }
      if (/\[tool\.ruff\]/.test(pyproject) || existsSync(join(eco.root, 'ruff.toml'))) {
        out.push(cmd('ecosystem', 'lint', 'ruff', 'ruff', ['check', '.'], eco.root, timeout, false));
      }
      return out;
    }
    case 'dart':
      return [
        cmd('ecosystem', 'lint', 'dart-analyze', 'dart', ['analyze'], eco.root, timeout, false),
        cmd('ecosystem', 'test', 'dart-test', 'dart', ['test'], eco.root, timeout, true),
      ];
    case 'flutter':
      return [
        cmd('ecosystem', 'lint', 'flutter-analyze', 'flutter', ['analyze'], eco.root, timeout, false),
        cmd('ecosystem', 'test', 'flutter-test', 'flutter', ['test'], eco.root, timeout, true),
      ];
    case 'ruby': {
      const out: PlannedCommand[] = [];
      if (existsSync(join(eco.root, 'Rakefile'))) {
        out.push(
          cmd('ecosystem', 'test', 'rake-test', 'bundle', ['exec', 'rake', 'test'], eco.root, timeout, true),
        );
      }
      if (existsSync(join(eco.root, '.rspec')) || existsSync(join(eco.root, 'spec'))) {
        out.push(
          cmd('ecosystem', 'test', 'rspec', 'bundle', ['exec', 'rspec'], eco.root, timeout, true),
        );
      }
      if (existsSync(join(eco.root, '.rubocop.yml'))) {
        out.push(
          cmd('ecosystem', 'lint', 'rubocop', 'bundle', ['exec', 'rubocop'], eco.root, timeout, false),
        );
      }
      return out;
    }
    case 'dotnet': {
      const sln = findFirst(eco.root, /\.sln$/);
      const target = sln ?? '.';
      return [
        cmd('ecosystem', 'build', 'dotnet-build', 'dotnet', ['build', target], eco.root, timeout, true),
        cmd('ecosystem', 'test', 'dotnet-test', 'dotnet', ['test', target, '--no-build'], eco.root, timeout, true),
      ];
    }
    case 'java': {
      if (existsSync(join(eco.root, 'pom.xml'))) {
        return [
          cmd('ecosystem', 'build', 'mvn-package', 'mvn', ['-B', '-DskipTests', 'package'], eco.root, timeout, true),
          cmd('ecosystem', 'test', 'mvn-test', 'mvn', ['-B', 'test'], eco.root, timeout, true),
        ];
      }
      return [
        cmd('ecosystem', 'build', 'gradle-build', 'gradle', ['build', '-x', 'test'], eco.root, timeout, true),
        cmd('ecosystem', 'test', 'gradle-test', 'gradle', ['test'], eco.root, timeout, true),
      ];
    }
    default:
      return [];
  }
}

function cmd(
  source: PlannedCommand['source'],
  kind: PlannedCommand['kind'],
  name: string,
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
  mandatory: boolean,
): PlannedCommand {
  return {
    id: `${source}:${kind}:${name}:${cwd}`,
    kind,
    name,
    command,
    args,
    cwd,
    timeoutSeconds: timeout,
    source,
    mandatory,
    destructive: false,
  };
}

function shouldIncludeEcosystem(
  eco: DetectedEcosystem,
  diff: DiffSummary,
  full: boolean,
  workspaceRoots: string[] = [],
): boolean {
  if (full || diff.filesChanged === 0) return true;

  const markerDir = dirname(eco.markers[0] ?? '.').replace(/\\/g, '/');
  const isRootPackage = markerDir === '.';

  // Node monorepo: skip package roots with no overlapping file changes
  if (eco.id === 'node' && workspaceRoots.length > 1 && !isRootPackage) {
    const touched = diff.files.some((f) => {
      const p = f.path.replace(/\\/g, '/');
      return p === markerDir || p.startsWith(`${markerDir}/`);
    });
    if (!touched) return false;
  }

  return diff.files.some((f) => {
    const p = f.path.replace(/\\/g, '/');
    if (isRootPackage) {
      return ['source', 'tests', 'configuration', 'dependencies', 'lockfile', 'ci'].includes(
        f.category,
      );
    }
    return p === markerDir || p.startsWith(`${markerDir}/`);
  });
}

function detectNodePm(root: string): 'npm' | 'pnpm' | 'yarn' {
  if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function findFirst(root: string, pattern: RegExp): string | null {
  try {
    const names = readdirSync(root);
    return names.find((n) => pattern.test(n)) ?? null;
  } catch {
    return null;
  }
}

function mergeByKind(existing: PlannedCommand[], incoming: PlannedCommand[]): void {
  const kinds = new Set(existing.map((c) => c.kind));
  for (const cmd of incoming) {
    if (!kinds.has(cmd.kind)) {
      existing.push(cmd);
      kinds.add(cmd.kind);
    }
  }
}

function mergePreferExisting(existing: PlannedCommand[], incoming: PlannedCommand[]): void {
  const keys = new Set(existing.map((c) => `${c.kind}:${c.cwd}`));
  for (const cmd of incoming) {
    const key = `${cmd.kind}:${cmd.cwd}`;
    if (!keys.has(key)) {
      existing.push(cmd);
      keys.add(key);
    }
  }
}

export function splitCommand(line: string): { command: string; args: string[] } {
  const tokens = tokenize(line.trim());
  if (tokens.length === 0) return { command: '', args: [] };
  return { command: tokens[0]!, args: tokens.slice(1) };
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) {
        out.push(cur);
        cur = '';
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

function stripYamlScalar(value: string): string {
  return value.replace(/^["']|["']$/g, '').trim();
}

function looksLikeVerification(line: string): boolean {
  return /\b(test|build|lint|check|clippy|vet|analyze|typecheck|pytest|cargo|go test|npm run|pnpm|yarn|dotnet test|mvn|gradle)\b/i.test(
    line,
  );
}

function inferKind(line: string): PlannedCommand['kind'] {
  const l = line.toLowerCase();
  if (/\b(test|pytest|rspec)\b/.test(l)) return 'test';
  if (/\b(lint|clippy|vet|eslint|rubocop|ruff)\b/.test(l)) return 'lint';
  if (/\b(typecheck|tsc|mypy|pyright|analyze)\b/.test(l)) return 'typecheck';
  if (/\b(format|fmt|prettier)\b/.test(l)) return 'format';
  if (/\b(build|check)\b/.test(l)) return 'build';
  return 'custom';
}

const DESTRUCTIVE_PATTERNS = [
  /\bsudo\b/i,
  /\brm\s+(-[a-zA-Z]*r|--recursive)/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bnpm\s+publish\b/i,
  /\bcargo\s+publish\b/i,
  /\bdocker\s+system\s+prune\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bcurl\b.*\|\s*(ba)?sh\b/i,
];

export function isDestructive(cmd: PlannedCommand): boolean {
  const line = [cmd.command, ...cmd.args].join(' ');
  return isDestructiveLine(line);
}

export function isDestructiveLine(line: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((re) => re.test(line));
}
