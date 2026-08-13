# Aftermath finding codes

Every finding includes evidence. Counts and symbols must come from execution or diffs — never invent them.

| Code | Title | Severity typical | Meaning |
|------|-------|------------------|---------|
| AF001 | TEST_FAILURE | error | A test command failed or timed out |
| AF002 | BUILD_FAILURE | error | A build/check command failed |
| AF003 | NEW_WARNING | warning | Warning count increased vs baseline |
| AF004 | API_BREAK | warning | Possible public API removal/change in diff (JS/TS exports, CommonJS, Rust `pub`) |
| AF005 | TEST_REMOVAL | warning | Test surface decreased vs baseline |
| AF006 | ASSERTION_REDUCTION | warning | Assertions appear reduced (verification weakening) |
| AF007 | BENCHMARK_REGRESSION | warning | Benchmark metric regressed beyond threshold |
| AF008 | ARTIFACT_GROWTH | warning | Configured artifact grew beyond threshold |
| AF009 | DEPENDENCY_EXPANSION | info | Direct dependency count increased and/or lockfiles changed |
| AF010 | SMOKE_TEST_FAILURE | error | Smoke test failed |
| AF011 | TYPECHECK_FAILURE | error | Typecheck failed |
| AF012 | LINT_ERROR | error | Lint command failed |

## Receipt fields (high level)

See `schemas/receipt.schema.json` for the machine schema.

- **Verdict** — `verified` | `partially_verified` | `failed` | `inconclusive` | `cancelled`
- **Checks** — executed commands with status, duration, log paths, metrics
- **Findings** — policy/regression issues with codes above
- **Baseline** — whether a baseline was present and compared
- **Repair attempts** — count for the current change fingerprint (persisted under `.aftermath/cache/repair-state.json`)
- **summary.json** — compact CI summary with `nextAction` and exit-code hints
- **findings.sarif** — optional SARIF export (`--ci` / `--sarif`)

## AF004 / AF009 evidence

- **AF004** includes removed/added symbol lists, related source files from the patch, and a heuristic note.
- **AF009** includes before/after counts, dependency fingerprints, manifests, lockfiles touched in the diff, and sample dependency names.

## Compare deltas

`aftermath compare [run]` reports concrete deltas vs `baseline.json`:

- warnings, test totals/passed/failed, direct dependency counts
- check status changes (pass→fail, new checks, missing checks)
- finding severity summary and highlights
