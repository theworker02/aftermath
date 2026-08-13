import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { DetectedEcosystem, EcosystemId } from './types.js';

interface MarkerRule {
  id: EcosystemId;
  markers: string[];
  match: (cwd: string, file: string) => boolean;
}

const RULES: MarkerRule[] = [
  {
    id: 'rust',
    markers: ['Cargo.toml'],
    match: (_cwd, file) => file === 'Cargo.toml' || file.endsWith('/Cargo.toml'),
  },
  {
    id: 'go',
    markers: ['go.mod'],
    match: (_cwd, file) => file === 'go.mod' || file.endsWith('/go.mod'),
  },
  {
    id: 'node',
    markers: ['package.json'],
    match: (_cwd, file) => file === 'package.json' || file.endsWith('/package.json'),
  },
  {
    id: 'python',
    markers: ['pyproject.toml', 'requirements.txt', 'tox.ini', 'setup.py', 'Pipfile'],
    match: (_cwd, file) =>
      /(^|\/)(pyproject\.toml|requirements.*\.txt|tox\.ini|setup\.py|Pipfile)$/.test(file),
  },
  {
    id: 'dart',
    markers: ['pubspec.yaml'],
    match: (cwd, file) => {
      if (!(file === 'pubspec.yaml' || file.endsWith('/pubspec.yaml'))) return false;
      const abs = join(cwd, file);
      try {
        const text = readFileSync(abs, 'utf8');
        return !/^\s*flutter\s*:/m.test(text);
      } catch {
        return true;
      }
    },
  },
  {
    id: 'flutter',
    markers: ['pubspec.yaml'],
    match: (cwd, file) => {
      if (!(file === 'pubspec.yaml' || file.endsWith('/pubspec.yaml'))) return false;
      try {
        const text = readFileSync(join(cwd, file), 'utf8');
        return /^\s*flutter\s*:/m.test(text);
      } catch {
        return false;
      }
    },
  },
  {
    id: 'ruby',
    markers: ['Gemfile'],
    match: (_cwd, file) =>
      file === 'Gemfile' || file.endsWith('/Gemfile') || /\.gemspec$/.test(file),
  },
  {
    id: 'dotnet',
    markers: ['*.sln', '*.csproj'],
    match: (_cwd, file) => /\.(sln|csproj)$/.test(file),
  },
  {
    id: 'java',
    markers: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    match: (_cwd, file) =>
      /(^|\/)(pom\.xml|build\.gradle(\.kts)?)$/.test(file),
  },
];

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'target',
  'dist',
  'build',
  'out',
  '.aftermath',
  'vendor',
  '.next',
  'coverage',
  '__pycache__',
  'fixtures',
  'examples',
  'extension',
  'website',
]);

export function detectEcosystems(cwd: string, maxDepth = 4): DetectedEcosystem[] {
  const files = walkFiles(cwd, maxDepth);
  const found: DetectedEcosystem[] = [];

  for (const rule of RULES) {
    const matched = files.filter((f) => rule.match(cwd, f));
    if (matched.length === 0) continue;
    for (const markerPath of matched) {
      const root = markerPath.includes('/')
        ? join(cwd, markerPath.split('/').slice(0, -1).join('/'))
        : cwd;
      found.push({
        id: rule.id,
        root,
        markers: [markerPath],
        confidence: 'high',
      });
    }
  }

  // Deduplicate by id+root
  const key = (e: DetectedEcosystem) => `${e.id}::${e.root}`;
  const uniq = new Map<string, DetectedEcosystem>();
  for (const e of found) uniq.set(key(e), e);
  return [...uniq.values()];
}

function walkFiles(cwd: string, maxDepth: number): string[] {
  const out: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: cwd, depth: 0 }];
  while (stack.length) {
    const item = stack.pop();
    if (!item) break;
    let entries: string[] = [];
    try {
      entries = readdirSync(item.dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = join(item.dir, name);
      let st;
      try {
        st = statSync(abs);
      } catch {
        continue;
      }
      const rel = relative(cwd, abs).replace(/\\/g, '/');
      if (st.isDirectory()) {
        if (item.depth < maxDepth) stack.push({ dir: abs, depth: item.depth + 1 });
      } else if (st.isFile()) {
        out.push(rel);
      }
    }
  }
  return out;
}

export function readPackageScripts(packageJsonPath: string): Record<string, string> {
  if (!existsSync(packageJsonPath)) return {};
  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}
