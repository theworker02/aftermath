import type { FindingLocation } from './types.js';

/**
 * Parse file:line(:column)? references from compiler / test / linter output.
 * Returns unique locations in encounter order (capped).
 */
export function parseLogLocations(text: string, limit = 20): FindingLocation[] {
  const out: FindingLocation[] = [];
  const seen = new Set<string>();

  const patterns: RegExp[] = [
    // path/to/file.ts:12:34 or file.rs:12:3
    /(?:^|[\s("'])((?:[A-Za-z]:)?[^:\s"'()<>]+?\.(?:ts|tsx|js|jsx|mjs|cjs|rs|go|py|rb|java|kt|cs|dart|swift|cpp|cc|cxx|h|hpp|vue|svelte))(?::(\d+))(?::(\d+))?/gm,
    // path/to/file.ts(12,34):  — MSVC / TypeScript stylish
    /(?:^|[\s("'])((?:[A-Za-z]:)?[^(\s"'<>]+?\.(?:ts|tsx|js|jsx|cs|cpp|c))[(](\d+)(?:,\s*(\d+))?[)]/gm,
    // at Object.<anonymous> (file.js:10:5) — Node stack
    /\(([^()]+?\.(?:js|ts|mjs|cjs)):(\d+):(\d+)\)/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const file = normalizeFile(m[1] ?? '');
      if (!file || looksLikeNoise(file)) continue;
      const line = m[2] ? Number(m[2]) : undefined;
      const column = m[3] ? Number(m[3]) : undefined;
      const key = `${file}:${line ?? ''}:${column ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        file,
        ...(line != null && Number.isFinite(line) ? { line } : {}),
        ...(column != null && Number.isFinite(column) ? { column } : {}),
      });
      if (out.length >= limit) return out;
    }
  }

  return out;
}

/** Prefer the first actionable location from combined stdout/stderr. */
export function primaryLogLocation(
  stdout?: string | null,
  stderr?: string | null,
): FindingLocation | undefined {
  const text = [stderr, stdout].filter(Boolean).join('\n');
  if (!text.trim()) return undefined;
  return parseLogLocations(text, 1)[0];
}

/** Extract top error-looking lines that include file:line when possible. */
export function topErrorLines(
  stdout?: string | null,
  stderr?: string | null,
  limit = 12,
): string[] {
  const text = [stderr, stdout].filter(Boolean).join('\n');
  const lines = text.split(/\r?\n/);
  const interesting = lines.filter((l) =>
    /error|fail|panic|assert|exception|trace|ENOENT|TypeError|ReferenceError/i.test(l),
  );
  const selected = (interesting.length ? interesting : lines.slice(-40)).slice(-limit);
  return selected.map((l) => l.trimEnd()).filter(Boolean);
}

function normalizeFile(raw: string): string {
  return raw.replace(/^\.\//, '').replace(/\\/g, '/').trim();
}

function looksLikeNoise(file: string): boolean {
  if (file.length > 260) return true;
  if (/node_modules\//i.test(file)) return true;
  if (/^internal\//i.test(file)) return true;
  if (/^node:/i.test(file)) return true;
  return false;
}
