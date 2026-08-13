# Security Policy

Aftermath executes repository commands to produce verification evidence. Treat it as a privileged local tool.

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| 0.3.x   | Yes       |
| 0.2.x   | Best-effort |
| 0.1.x   | Best-effort |

## What Aftermath does

- Runs build/test/lint/typecheck/smoke commands discovered from configuration, CI, package scripts, and ecosystem conventions
- Captures Git diffs, logs, and receipts on disk under `.aftermath/`
- Optionally exposes results through a local MCP server

## Threat model

| Threat | Mitigation |
|--------|------------|
| Malicious repository scripts | Prefer explicit `.aftermath.toml`; never invent scripts; flag destructive commands |
| Command injection | Commands are executed with `spawn` + argv arrays (no shell) |
| Poisoned configuration | Validate/limit discovered commands; destructive patterns require approval |
| Secret leakage in logs | Best-effort redaction of common token/key patterns (not perfect) |
| Oversized output | Log size limits and truncation metadata |
| Privilege escalation | No sudo, no global package-manager mutation, no publish/deploy/push by default |
| Process escape / unexpected tools | Working directory scoped; timeouts; cancellation |

## Untrusted repositories

Do **not** run Aftermath against untrusted repositories without reviewing:

- `.aftermath.toml`
- `package.json` / `Cargo.toml` / CI workflows that may be discovered as commands
- pre/post scripts that tooling may invoke indirectly

## Plugin / MCP permissions

- The Cursor plugin should be reviewed before installation
- The MCP server exposes deterministic local data and verification entrypoints
- No cloud backend, no required API keys, no telemetry in v1

## Log sensitivity

Receipts and logs may contain source paths, failure output, and accidentally printed secrets. Redaction is best-effort. Do not commit bulky run logs. Prefer committing only `baseline.json` and policy/config when desired.

## Reporting a vulnerability

Please report security issues privately via **GitHub Security Advisories** on this repository:

https://github.com/theworker02/aftermath/security/advisories/new

If advisories are unavailable, contact the maintainer through the GitHub profile for [`theworker02`](https://github.com/theworker02) (prefer private channels).

Do not open public issues for undisclosed vulnerabilities.

## Responsible disclosure

We aim to acknowledge reports within 7 days and ship fixes as quickly as practical for confirmed issues.
