/** Aftermath core types — schema version 1 */

export const SCHEMA_VERSION = 1 as const;

export type Verdict =
  | 'verified'
  | 'partially_verified'
  | 'failed'
  | 'inconclusive'
  | 'cancelled';

export type CheckStatus =
  | 'pass'
  | 'fail'
  | 'timeout'
  | 'cancelled'
  | 'not_run'
  | 'unavailable';

export type CheckKind =
  | 'build'
  | 'test'
  | 'lint'
  | 'typecheck'
  | 'format'
  | 'smoke'
  | 'benchmark'
  | 'api'
  | 'dependency'
  | 'artifact'
  | 'custom';

export type FileCategory =
  | 'source'
  | 'tests'
  | 'docs'
  | 'configuration'
  | 'dependencies'
  | 'generated'
  | 'lockfile'
  | 'ci'
  | 'assets'
  | 'other';

export type FindingCode =
  | 'AF001'
  | 'AF002'
  | 'AF003'
  | 'AF004'
  | 'AF005'
  | 'AF006'
  | 'AF007'
  | 'AF008'
  | 'AF009'
  | 'AF010'
  | 'AF011'
  | 'AF012';

export const FINDING_TITLES: Record<FindingCode, string> = {
  AF001: 'TEST_FAILURE',
  AF002: 'BUILD_FAILURE',
  AF003: 'NEW_WARNING',
  AF004: 'API_BREAK',
  AF005: 'TEST_REMOVAL',
  AF006: 'ASSERTION_REDUCTION',
  AF007: 'BENCHMARK_REGRESSION',
  AF008: 'ARTIFACT_GROWTH',
  AF009: 'DEPENDENCY_EXPANSION',
  AF010: 'SMOKE_TEST_FAILURE',
  AF011: 'TYPECHECK_FAILURE',
  AF012: 'LINT_ERROR',
};

export type EcosystemId =
  | 'rust'
  | 'go'
  | 'node'
  | 'python'
  | 'dart'
  | 'flutter'
  | 'ruby'
  | 'dotnet'
  | 'java'
  | 'mixed';

export interface GitState {
  head: string | null;
  branch: string | null;
  dirty: boolean;
  stagedFiles: string[];
  unstagedFiles: string[];
  untrackedFiles: string[];
  changeFingerprint: string;
}

export interface DiffSummary {
  filesChanged: number;
  insertions: number;
  deletions: number;
  byCategory: Partial<Record<FileCategory, number>>;
  files: Array<{ path: string; category: FileCategory; status: string }>;
}

export interface DetectedEcosystem {
  id: EcosystemId;
  root: string;
  markers: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface PlannedCommand {
  id: string;
  kind: CheckKind;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  timeoutSeconds: number;
  source: 'config' | 'ci' | 'package-script' | 'makefile' | 'ecosystem' | 'smoke' | 'benchmark';
  mandatory: boolean;
  destructive: boolean;
  /** Smoke: kill process after this regex matches stdout/stderr (success). */
  readyPattern?: string;
}

export interface VerificationPlan {
  createdAt: string;
  full: boolean;
  ecosystems: DetectedEcosystem[];
  commands: PlannedCommand[];
  notes: string[];
}

export interface CommandResult {
  id: string;
  kind: CheckKind;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  status: CheckStatus;
  exitCode: number | null;
  durationMs: number;
  stdoutPath?: string;
  stderrPath?: string;
  truncated: boolean;
  started: boolean;
  summary?: string;
  metrics?: Record<string, number | string | boolean | null>;
}

export interface FindingLocation {
  file: string;
  line?: number;
  column?: number;
}

export interface Finding {
  id: string;
  code: FindingCode;
  title: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  evidence: Record<string, unknown>;
  /** Primary navigation target when parseable from logs (file:line). */
  location?: FindingLocation;
  relatedFiles?: string[];
  relatedChecks?: string[];
}

export interface BaselineSnapshot {
  schemaVersion: typeof SCHEMA_VERSION;
  createdAt: string;
  repository: {
    root: string;
    head: string | null;
    branch: string | null;
  };
  checks: Array<{
    kind: CheckKind;
    name: string;
    status: CheckStatus;
    metrics?: Record<string, number | string | boolean | null>;
  }>;
  warnings: number;
  testCounts?: {
    total?: number;
    passed?: number;
    failed?: number;
    skipped?: number;
    assertions?: number;
  };
  dependencies?: {
    directCount?: number;
    fingerprint?: string;
  };
  publicApi?: {
    fingerprint?: string;
    symbols?: string[];
  };
  artifacts?: Array<{ name: string; path: string; bytes: number }>;
  benchmarks?: Array<{ name: string; metric: string; value: number }>;
}

export interface EnvironmentMetadata {
  os: string;
  arch: string;
  nodeVersion: string;
  aftermathVersion: string;
  gitVersion?: string;
  toolVersions: Record<string, string>;
}

export interface Receipt {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  runNumber: number;
  createdAt: string;
  verdict: Verdict;
  repository: {
    root: string;
    name: string;
  };
  git: GitState;
  change: DiffSummary;
  environment: EnvironmentMetadata;
  plan: VerificationPlan;
  checks: CommandResult[];
  findings: Finding[];
  baseline?: {
    present: boolean;
    path?: string;
    compared: boolean;
  };
  artifacts: string[];
  repairAttempts: number;
  notes: string[];
}

export interface SmokeConfig {
  name: string;
  command: string;
  ready_pattern?: string;
  timeout_seconds?: number;
}

export interface BenchmarkConfig {
  name: string;
  command: string;
  metric: string;
  direction?: 'higher' | 'lower';
  regression_threshold_percent?: number;
}

export interface ArtifactConfig {
  name: string;
  path: string;
  max_growth_percent?: number;
}

export interface AftermathConfig {
  version: number;
  verify?: {
    build?: string[];
    test?: string[];
    lint?: string[];
    typecheck?: string[];
    format?: string[];
  };
  smoke?: SmokeConfig[];
  benchmark?: BenchmarkConfig[];
  artifact?: ArtifactConfig[];
  policy?: {
    tests_must_pass?: boolean;
    allow_new_warnings?: boolean;
    allow_removed_tests?: boolean;
    allow_assertion_reduction?: boolean;
    allow_api_breaks?: boolean;
    max_repair_attempts?: number;
  };
  limits?: {
    command_timeout_seconds?: number;
    max_log_mb?: number;
    max_run_storage_mb?: number;
  };
  redaction?: {
    patterns?: string[];
  };
  scope?: {
    skip_benchmarks_on_docs_only?: boolean;
  };
}

export interface VerifyOptions {
  cwd?: string;
  full?: boolean;
  ci?: boolean;
  /** Emit machine-readable summary JSON to stdout (and always write summary.json). */
  json?: boolean;
  /** Also write findings.sarif under the run directory. */
  sarif?: boolean;
  cancelSignal?: AbortSignal;
  taskDescription?: string;
  skipDestructive?: boolean;
  approvalCallback?: (command: PlannedCommand) => Promise<boolean>;
}

export interface BaselineOptions {
  cwd?: string;
  force?: boolean;
  cancelSignal?: AbortSignal;
}

export interface DoctorReport {
  checks: Array<{ name: string; status: 'ok' | 'warn' | 'fail' | 'missing'; detail: string }>;
  healthy: boolean;
}
