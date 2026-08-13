# Aftermath finding codes

Every finding must include evidence. Do not invent counts.

| Code | Title | Meaning |
|------|-------|---------|
| AF001 | TEST_FAILURE | A test command failed or timed out |
| AF002 | BUILD_FAILURE | A build/check command failed |
| AF003 | NEW_WARNING | Warning count increased vs baseline |
| AF004 | API_BREAK | Possible public API removal/change |
| AF005 | TEST_REMOVAL | Test surface decreased vs baseline |
| AF006 | ASSERTION_REDUCTION | Assertions appear reduced |
| AF007 | BENCHMARK_REGRESSION | Benchmark metric regressed |
| AF008 | ARTIFACT_GROWTH | Configured artifact grew beyond threshold |
| AF009 | DEPENDENCY_EXPANSION | Direct dependency count increased |
| AF010 | SMOKE_TEST_FAILURE | Smoke test failed |
| AF011 | TYPECHECK_FAILURE | Typecheck failed |
| AF012 | LINT_ERROR | Lint command failed |

Full reference: [docs/findings.md](../../../docs/findings.md)
