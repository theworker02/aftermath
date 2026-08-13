# Configuration reference

Aftermath reads configuration from the repository root:

1. `.aftermath.toml` (preferred)
2. `aftermath.toml`

If neither exists, built-in defaults apply. Validate with:

```bash
aftermath config validate
aftermath doctor
```

Invalid TOML or unknown keys fail validation (exit code `2` for `config validate`).

## Top-level

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `version` | number | `1` | Config schema version. Aftermath 0.4 expects `1`. |

## `[verify]`

Explicit commands override discovery for that kind. Each value is an array of command lines (tokenized without a shell).

| Key | Type | Description |
|-----|------|-------------|
| `build` | string[] | Build commands |
| `test` | string[] | Test commands |
| `lint` | string[] | Lint commands |
| `typecheck` | string[] | Typecheck commands |
| `format` | string[] | Format / format-check commands |

Example:

```toml
[verify]
build = ["npm run build"]
test = ["npm test"]
lint = ["npm run lint"]
typecheck = ["npm run typecheck"]
```

## `[[smoke]]`

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Smoke check name |
| `command` | string | Command line (often a long-running server) |
| `ready_pattern` | string? | Regex matched against stdout/stderr. On match, Aftermath terminates the process and records **PASS**. |
| `timeout_seconds` | number? | Per-smoke timeout (default 60s). Timeout without a match → fail/timeout. |

Example:

```toml
[[smoke]]
name = "api"
command = "node ./scripts/dev-server.js"
ready_pattern = "listening on :3000"
timeout_seconds = 30
```

## `[[benchmark]]`

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Benchmark name |
| `command` | string | Command that emits a measurable value |
| `metric` | string | Metric label stored in evidence |
| `direction` | `"higher"` \| `"lower"` | Improvement direction |
| `regression_threshold_percent` | number | Allowed regression before AF007 |

## `[[artifact]]`

| Key | Type | Description |
|-----|------|-------------|
| `name` | string | Artifact label |
| `path` | string | Relative path |
| `max_growth_percent` | number | Growth limit vs baseline (AF008) |

## `[policy]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tests_must_pass` | bool | `true` | Treat test failures as hard gates |
| `allow_new_warnings` | bool | `false` | If false, new warnings → AF003 |
| `allow_removed_tests` | bool | `false` | If false, shrinking test surface → AF005 |
| `allow_assertion_reduction` | bool | `false` | If false, fewer assertions → AF006 |
| `allow_api_breaks` | bool | `false` | If false, API removals → AF004 |
| `max_repair_attempts` | number | `3` | Stop automatic repair loops per change fingerprint |

## `[limits]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `command_timeout_seconds` | number | `900` | Default command timeout |
| `max_log_mb` | number | `25` | Per-log truncation threshold |
| `max_run_storage_mb` | number | `500` | Hard budget for `.aftermath/runs` + receipt copies. Oldest runs are pruned after each verify, with notes on the receipt. |

## `[redaction]`

| Key | Type | Description |
|-----|------|-------------|
| `patterns` | string[] | Extra regex patterns applied to captured logs |

Invalid regexes produce validation **warnings** (doctor / `config validate`).

## `[scope]`

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `skip_benchmarks_on_docs_only` | bool | `true` | Skip benchmarks when the diff is docs-only |

## Discovery when `[verify]` is unset

1. CI workflows under `.github/workflows/`
2. Package scripts (`package.json`, etc.)
3. Makefile / justfile common targets
4. Ecosystem conventions

Aftermath never invents a script that does not exist (e.g. no fake `npm test`).

## Full example

See [`.aftermath.toml.example`](../.aftermath.toml.example).
