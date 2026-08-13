import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';
import type { AftermathConfig } from './types.js';

const DEFAULT_CONFIG: AftermathConfig = {
  version: 1,
  policy: {
    tests_must_pass: true,
    allow_new_warnings: false,
    allow_removed_tests: false,
    allow_assertion_reduction: false,
    allow_api_breaks: false,
    max_repair_attempts: 3,
  },
  limits: {
    command_timeout_seconds: 900,
    max_log_mb: 25,
    max_run_storage_mb: 500,
  },
  scope: {
    skip_benchmarks_on_docs_only: true,
  },
};

const stringList = z.array(z.string().min(1)).optional();

const smokeSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  ready_pattern: z.string().optional(),
  timeout_seconds: z.number().positive().optional(),
});

const benchmarkSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  metric: z.string().min(1),
  direction: z.enum(['higher', 'lower']).optional(),
  regression_threshold_percent: z.number().nonnegative().optional(),
});

const artifactSchema = z.object({
  name: z.string().min(1),
  path: z.string().min(1),
  max_growth_percent: z.number().nonnegative().optional(),
});

const configSchema = z
  .object({
    version: z.number().int().positive().optional(),
    verify: z
      .object({
        build: stringList,
        test: stringList,
        lint: stringList,
        typecheck: stringList,
        format: stringList,
      })
      .strict()
      .optional(),
    smoke: z.array(smokeSchema).optional(),
    benchmark: z.array(benchmarkSchema).optional(),
    artifact: z.array(artifactSchema).optional(),
    policy: z
      .object({
        tests_must_pass: z.boolean().optional(),
        allow_new_warnings: z.boolean().optional(),
        allow_removed_tests: z.boolean().optional(),
        allow_assertion_reduction: z.boolean().optional(),
        allow_api_breaks: z.boolean().optional(),
        max_repair_attempts: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
    limits: z
      .object({
        command_timeout_seconds: z.number().positive().optional(),
        max_log_mb: z.number().positive().optional(),
        max_run_storage_mb: z.number().positive().optional(),
      })
      .strict()
      .optional(),
    redaction: z
      .object({
        patterns: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    scope: z
      .object({
        skip_benchmarks_on_docs_only: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export interface ConfigValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ConfigValidationResult {
  ok: boolean;
  path: string | null;
  usingDefaults: boolean;
  config: AftermathConfig;
  errors: ConfigValidationIssue[];
  warnings: ConfigValidationIssue[];
}

export function defaultConfig(): AftermathConfig {
  return structuredClone(DEFAULT_CONFIG);
}

export function loadConfig(cwd: string): { config: AftermathConfig; path: string | null } {
  const result = validateConfig(cwd);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(
      result.path
        ? `Invalid Aftermath config at ${result.path}: ${detail}`
        : `Invalid Aftermath config: ${detail}`,
    );
  }
  return { config: result.config, path: result.path };
}

/** Validate `.aftermath.toml` / `aftermath.toml` without throwing. */
export function validateConfig(cwd: string): ConfigValidationResult {
  const candidates = ['.aftermath.toml', 'aftermath.toml'];
  const errors: ConfigValidationIssue[] = [];
  const warnings: ConfigValidationIssue[] = [];

  for (const name of candidates) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;

    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (err) {
      errors.push({
        path: name,
        message: `Unable to read file: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      });
      return {
        ok: false,
        path,
        usingDefaults: false,
        config: defaultConfig(),
        errors,
        warnings,
      };
    }

    let parsed: unknown;
    try {
      parsed = parseToml(raw);
    } catch (err) {
      errors.push({
        path: name,
        message: formatTomlParseError(err, raw),
        severity: 'error',
      });
      return {
        ok: false,
        path,
        usingDefaults: false,
        config: defaultConfig(),
        errors,
        warnings,
      };
    }

    const checked = configSchema.safeParse(parsed);
    if (!checked.success) {
      for (const issue of checked.error.issues) {
        const loc = issue.path.length ? issue.path.join('.') : '(root)';
        errors.push({
          path: `${name} → ${loc}`,
          message: issue.message,
          severity: 'error',
        });
      }
      return {
        ok: false,
        path,
        usingDefaults: false,
        config: defaultConfig(),
        errors,
        warnings,
      };
    }

    const merged = mergeConfig(defaultConfig(), checked.data as AftermathConfig);
    collectSemanticWarnings(merged, name, warnings);

    return {
      ok: true,
      path,
      usingDefaults: false,
      config: merged,
      errors,
      warnings,
    };
  }

  warnings.push({
    path: '(defaults)',
    message: 'No .aftermath.toml found; using built-in defaults',
    severity: 'warning',
  });

  return {
    ok: true,
    path: null,
    usingDefaults: true,
    config: defaultConfig(),
    errors,
    warnings,
  };
}

export function formatConfigValidation(result: ConfigValidationResult): string {
  const lines = [
    'AFTERMATH CONFIG',
    result.path ? `File: ${result.path}` : 'File: (none — defaults)',
    `Status: ${result.ok ? 'VALID' : 'INVALID'}`,
    '',
  ];

  if (result.errors.length === 0 && result.warnings.length === 0) {
    lines.push('No issues.');
  }

  if (result.errors.length) {
    lines.push('Errors:');
    for (const e of result.errors) lines.push(`- [error] ${e.path}: ${e.message}`);
    lines.push('');
  }

  if (result.warnings.length) {
    lines.push('Warnings:');
    for (const w of result.warnings) lines.push(`- [warn] ${w.path}: ${w.message}`);
    lines.push('');
  }

  if (result.ok) {
    lines.push('Effective policy:');
    const p = result.config.policy ?? {};
    lines.push(`- tests_must_pass: ${p.tests_must_pass ?? true}`);
    lines.push(`- allow_new_warnings: ${p.allow_new_warnings ?? false}`);
    lines.push(`- allow_removed_tests: ${p.allow_removed_tests ?? false}`);
    lines.push(`- allow_assertion_reduction: ${p.allow_assertion_reduction ?? false}`);
    lines.push(`- allow_api_breaks: ${p.allow_api_breaks ?? false}`);
    lines.push(`- max_repair_attempts: ${p.max_repair_attempts ?? 3}`);
    const verify = result.config.verify ?? {};
    const keys = Object.entries(verify).filter(([, v]) => Array.isArray(v) && v.length);
    if (keys.length) {
      lines.push('', 'Configured verify commands:');
      for (const [k, v] of keys) lines.push(`- ${k}: ${(v as string[]).join(' | ')}`);
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

function collectSemanticWarnings(
  config: AftermathConfig,
  fileLabel: string,
  warnings: ConfigValidationIssue[],
): void {
  if (config.version != null && config.version !== 1) {
    warnings.push({
      path: `${fileLabel} → version`,
      message: `Unsupported config version ${config.version}; Aftermath 0.4 expects version = 1`,
      severity: 'warning',
    });
  }

  const verify = config.verify ?? {};
  for (const [kind, cmds] of Object.entries(verify)) {
    if (!Array.isArray(cmds)) continue;
    for (const cmd of cmds) {
      if (/\bsudo\b|\brm\s+-rf\b|\bformat\s+c:/i.test(cmd)) {
        warnings.push({
          path: `${fileLabel} → verify.${kind}`,
          message: `Command looks destructive and will require approval: ${cmd}`,
          severity: 'warning',
        });
      }
    }
  }

  for (const pattern of config.redaction?.patterns ?? []) {
    try {
      void new RegExp(pattern);
    } catch (err) {
      warnings.push({
        path: `${fileLabel} → redaction.patterns`,
        message: `Invalid regex "${pattern}": ${err instanceof Error ? err.message : String(err)}`,
        severity: 'warning',
      });
    }
  }
}

function formatTomlParseError(err: unknown, raw: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const lineMatch = message.match(/line\s+(\d+)/i) ?? message.match(/at\s+(\d+):(\d+)/);
  if (lineMatch) {
    const lineNo = Number(lineMatch[1]);
    const lines = raw.split(/\r?\n/);
    const snippet = lines[lineNo - 1]?.trim();
    if (snippet) {
      return `${message} (near: ${snippet.slice(0, 80)})`;
    }
  }
  return `${message}. Check brackets, quotes, and table headers ([verify], [policy], …).`;
}

function mergeConfig(base: AftermathConfig, overlay: AftermathConfig): AftermathConfig {
  return {
    version: overlay.version ?? base.version,
    verify: { ...base.verify, ...overlay.verify },
    smoke: overlay.smoke ?? base.smoke,
    benchmark: overlay.benchmark ?? base.benchmark,
    artifact: overlay.artifact ?? base.artifact,
    policy: { ...base.policy, ...overlay.policy },
    limits: { ...base.limits, ...overlay.limits },
    redaction: { ...base.redaction, ...overlay.redaction },
    scope: { ...base.scope, ...overlay.scope },
  };
}
