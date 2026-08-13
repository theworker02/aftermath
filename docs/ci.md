# Continuous integration

Aftermath is designed for local-first verification that also runs cleanly in CI.

## Recommended GitHub Actions job

```yaml
name: Aftermath Verification

on:
  pull_request:
  workflow_dispatch:

jobs:
  aftermath:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install Aftermath
        run: npm install -g .

      - name: Validate configuration
        run: aftermath config validate

      - name: Aftermath Verification
        run: aftermath verify --ci --json | tee aftermath-summary.json

      - name: Upload evidence
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: aftermath-receipts
          path: |
            .aftermath/receipts/
            .aftermath/runs/
            aftermath-summary.json
          if-no-files-found: ignore
```

A ready-to-copy workflow lives at [`.github/workflows/aftermath-example.yml`](../.github/workflows/aftermath-example.yml).

## Flags

| Flag | Behavior |
|------|----------|
| `--ci` | Strict exit codes; also writes `findings.sarif` |
| `--json` | Print `summary.json` body to stdout |
| `--full` | Ignore smart scoping; run the full plan |
| `--cwd <path>` | Repository root |

## Exit codes (`--ci`)

| Code | Meaning |
|------|---------|
| 0 | Verdict `verified` |
| 1 | Verdict `failed` or `partially_verified` |
| 2 | Configuration / infrastructure error |
| 3 | Verdict `inconclusive` or `cancelled` |

Without `--ci`, `partially_verified` exits `0` so interactive repair loops stay usable.

## Machine artifacts

Every verify run writes:

- `.aftermath/runs/<nnnn>/summary.json` — compact CI summary (`kind: aftermath.summary`)
- `.aftermath/runs/<nnnn>/receipt.json` — full receipt
- `.aftermath/runs/<nnnn>/findings.json` — findings only

With `--ci` or `--sarif`:

- `.aftermath/runs/<nnnn>/findings.sarif` — SARIF 2.1.0 subset for Code Scanning consumers

### `summary.json` fields (high level)

- `verdict` / `verdictLabel`
- `exitCodeHint.ci` / `exitCodeHint.interactive`
- `checks.byCategory`
- `findings[]`
- `mostImportantFailure`
- `nextAction`
- `evidenceDir`

## Baselines in CI

Commit `.aftermath/baseline.json` when you want regression comparisons (warnings, test surface, dependencies, artifacts, benchmarks). Never overwrite a baseline silently — use `aftermath baseline --force` intentionally.

## Security notes for CI

- Prefer explicit `[verify]` commands in `.aftermath.toml` for locked-down pipelines.
- Review discovered scripts from untrusted forks before enabling Aftermath on `pull_request` from external contributors.
- Artifacts may contain failure logs; treat them as potentially sensitive.
