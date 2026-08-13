---
name: aftermath-verification
description: >-
  Independently verify agent-written repository changes with Aftermath.
  Use after substantial code changes, before claiming completion, when
  interpreting receipts/baselines, preparing repair context, or when the
  user asks whether the repository actually works.
---

# Aftermath Verification

Aftermath is an execution-backed verification layer for coding agents.

> An agent completion message is not verification evidence.

## When to use

- After substantial repository-modifying work
- Before claiming a task is complete
- When builds/tests/lints may have drifted
- When the user asks to verify, baseline, inspect, explain, status, or repair via Aftermath
- After applying a repair context package

## Vocabulary

Use: Run, Receipt, Finding, Evidence, Baseline, Verification, Gate, Regression, Repair Context.

Avoid: magic, AI score, smart analysis, intelligent result.

## Workflow

1. Prefer an existing baseline; create one with `/aftermath-baseline` when missing and the user wants comparisons.
2. Optionally `aftermath status` for a one-screen snapshot (verdict, findings, baseline).
3. Run `/aftermath-verify` (CLI `aftermath verify` or MCP `aftermath_verify`).
4. Read the receipt verdict:
   - `VERIFIED` — mandatory configured gates executed and passed
   - `PARTIALLY VERIFIED` — some gates passed, warnings/regressions remain
   - `FAILED` — mandatory gates failed
   - `INCONCLUSIVE` — insufficient evidence / tools unavailable
   - `CANCELLED` — user cancelled
5. Preserve failure logs under `.aftermath/runs/<n>/` (includes `receipt.html` + `summary.json`).
6. For failures, use `/aftermath-repair` (`aftermath repair-context latest`) then re-verify.
7. Do not enter infinite verify→repair loops. Stop after policy max attempts.

## Interpreting receipts

- Trust command exit codes and parsed metrics, not narrative claims.
- `VERIFIED` does **not** mean bug-free software.
- Surface test removals, assertion reduction, dependency expansion, API drift, and benchmark regressions even when tests still pass.
- Prefer `aftermath inspect latest` / `aftermath explain latest` for next-action guidance; use `summary.json` in CI.
- Findings may include `location.file` / `location.line` when logs are parseable.

## Baseline comparisons

Compare warnings, test counts, assertions, dependencies, artifacts, and benchmarks against `.aftermath/baseline.json` when present (`aftermath compare latest`).

## Repair context

Use the compact repair package. Do not dump multi-megabyte logs into context.

## Completion rule

Never say "everything works" or "everything is fixed" unless mandatory gates passed. Prefer:

```text
Configured verification gates passed.
```
