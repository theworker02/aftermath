import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sha256 } from './storage.js';
import type { DiffSummary, FileCategory, GitState } from './types.js';

const execFileAsync = promisify(execFile);

async function git(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    return { stdout: stdout.toString(), stderr: stderr.toString(), code: 0 };
  } catch (error) {
    const err = error as { stdout?: string | Buffer; stderr?: string | Buffer; code?: number };
    return {
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? String(error),
      code: typeof err.code === 'number' ? err.code : 1,
    };
  }
}

export async function collectGitState(cwd: string): Promise<GitState> {
  const [head, branch, status, staged, unstaged, untracked] = await Promise.all([
    git(cwd, ['rev-parse', 'HEAD']),
    git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git(cwd, ['status', '--porcelain']),
    git(cwd, ['diff', '--name-only', '--cached']),
    git(cwd, ['diff', '--name-only']),
    git(cwd, ['ls-files', '--others', '--exclude-standard']),
  ]);

  const stagedFiles = splitLines(staged.stdout);
  const unstagedFiles = splitLines(unstaged.stdout);
  const untrackedFiles = splitLines(untracked.stdout);
  const dirty =
    status.code === 0 &&
    (stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0);

  const fingerprintSource = [
    head.stdout.trim(),
    branch.stdout.trim(),
    status.stdout,
    staged.stdout,
    unstaged.stdout,
    untracked.stdout,
  ].join('\n');

  return {
    head: head.code === 0 ? head.stdout.trim() : null,
    branch: branch.code === 0 ? branch.stdout.trim() : null,
    dirty,
    stagedFiles,
    unstagedFiles,
    untrackedFiles,
    changeFingerprint: sha256(fingerprintSource).slice(0, 16),
  };
}

export async function collectDiffSummary(cwd: string, gitState: GitState): Promise<DiffSummary> {
  const names = new Set<string>([
    ...gitState.stagedFiles,
    ...gitState.unstagedFiles,
    ...gitState.untrackedFiles,
  ]);

  // Also include committed range vs upstream when clean? Prefer working tree.
  if (names.size === 0) {
    const against = await git(cwd, ['diff', '--name-status', 'HEAD~1...HEAD']);
    if (against.code === 0) {
      for (const line of splitLines(against.stdout)) {
        const parts = line.split(/\s+/);
        const path = parts[parts.length - 1];
        if (path) names.add(path);
      }
    }
  }

  const numstat = await git(cwd, ['diff', '--numstat', 'HEAD']);
  const untrackedNum = await Promise.all(
    [...gitState.untrackedFiles].map(async (file) => {
      const r = await git(cwd, ['diff', '--no-index', '--numstat', '/dev/null', file]).catch(
        async () => git(cwd, ['hash-object', file]),
      );
      return r;
    }),
  );

  let insertions = 0;
  let deletions = 0;
  for (const line of splitLines(numstat.stdout)) {
    const [a, d] = line.split('\t');
    insertions += Number(a) || 0;
    deletions += Number(d) || 0;
  }
  void untrackedNum;

  const files = [...names].sort().map((path) => ({
    path,
    category: categorizePath(path),
    status: gitState.untrackedFiles.includes(path)
      ? 'untracked'
      : gitState.stagedFiles.includes(path)
        ? 'staged'
        : 'modified',
  }));

  const byCategory: Partial<Record<FileCategory, number>> = {};
  for (const file of files) {
    byCategory[file.category] = (byCategory[file.category] ?? 0) + 1;
  }

  return {
    filesChanged: files.length,
    insertions,
    deletions,
    byCategory,
    files,
  };
}

export async function collectDiffPatch(cwd: string): Promise<string> {
  const staged = await git(cwd, ['diff', '--cached']);
  const unstaged = await git(cwd, ['diff']);
  const parts = [staged.stdout, unstaged.stdout].filter(Boolean);
  return parts.join('\n');
}

export function categorizePath(path: string): FileCategory {
  const p = path.replace(/\\/g, '/').toLowerCase();
  if (
    /(^|\/)(test|tests|__tests__|spec|specs)\//.test(p) ||
    /\.(test|spec)\.[jt]sx?$/.test(p) ||
    /_test\.go$/.test(p) ||
    /_test\.rb$/.test(p) ||
    /_test\.dart$/.test(p)
  ) {
    return 'tests';
  }
  if (/(^|\/)docs?\//.test(p) || /\.(md|rst|adoc)$/.test(p)) return 'docs';
  if (/(^|\/)\.github\//.test(p) || /(^|\/)\.gitlab-ci/.test(p) || /jenkinsfile/.test(p)) {
    return 'ci';
  }
  if (
    /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|go\.sum|gemfile\.lock|poetry\.lock|composer\.lock)$/.test(
      p,
    )
  ) {
    return 'lockfile';
  }
  if (
    /(package\.json|cargo\.toml|go\.mod|pubspec\.yaml|gemfile|.*\.gemspec|pyproject\.toml|requirements.*\.txt|.*\.csproj|.*\.sln|pom\.xml|build\.gradle(\.kts)?)$/.test(
      p,
    )
  ) {
    return 'dependencies';
  }
  if (
    /\.(png|jpe?g|gif|svg|ico|webp|mp4|mov|woff2?)$/.test(p) ||
    /(^|\/)assets\//.test(p)
  ) {
    return 'assets';
  }
  if (
    /(^|\/)(dist|build|out|target|generated|\.next|\.turbo)\//.test(p) ||
    /\.generated\./.test(p)
  ) {
    return 'generated';
  }
  if (
    /\.(toml|ya?ml|json|ini|cfg|config\.[jt]s)$/.test(p) ||
    /(^|\/)\.[^/]+rc(\.|$)/.test(p) ||
    /(tsconfig|eslint|prettier|vitest|jest|pytest|tox)/.test(p)
  ) {
    return 'configuration';
  }
  if (/\.(rs|go|ts|tsx|js|jsx|py|rb|dart|cs|java|kt|swift|c|cc|cpp|h|hpp)$/.test(p)) {
    return 'source';
  }
  return 'other';
}

function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function gitVersion(cwd: string): Promise<string | undefined> {
  const r = await git(cwd, ['--version']);
  return r.code === 0 ? r.stdout.trim() : undefined;
}
