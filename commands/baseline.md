---
name: aftermath-baseline
description: Create a repository health baseline for Aftermath comparisons
---

# /aftermath-baseline

Create a durable health baseline for the current repository.

## Capture

- build status
- test counts
- warnings
- lint status
- type-check status
- binary sizes where configured
- benchmark results where configured
- dependency graph fingerprint
- public API fingerprint

## Instructions

1. Check whether `.aftermath/baseline.json` already exists.
2. If it exists, **do not overwrite**. Ask the user for explicit confirmation, then run with `--force` only after they agree.
3. Run:

```bash
aftermath baseline
```

Or:

```bash
node dist/cli/index.js baseline
```

4. Report the baseline path and a short summary of captured metrics.

## Rules

- Never silently replace an existing baseline.
- Baseline creation may execute configured verification commands.
- Keep the summary factual; no speculative health scores.
