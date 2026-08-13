---
name: aftermath-verify
description: Independently verify repository changes and produce an Aftermath receipt with evidence
---

# /aftermath-verify

Determine whether the repository actually works after agent-produced changes. Do not invent results.

## Instructions

1. Resolve the repository root (prefer the workspace root).
2. Optionally check current state:

```bash
aftermath status
```

3. Run the Aftermath CLI:

```bash
npx --yes aftermath verify
```

If this repository already contains a built CLI:

```bash
node dist/cli/index.js verify
```

For CI-style strict exit codes and SARIF:

```bash
aftermath verify --ci
```

For machine-readable stdout:

```bash
aftermath verify --json
```

4. If MCP tool `aftermath_verify` is available, you may use that instead.
5. Preserve the full command output.
6. Report using this shape:

```text
AFTERMATH
Verification #<n>
VERDICT
<VERIFIED|PARTIALLY VERIFIED|FAILED|INCONCLUSIVE|CANCELLED>
…
Most important failure
…
Evidence: .aftermath/runs/<n>/
```

## Rules

- A completion message is not verification evidence.
- Never claim PASS when a command failed to start.
- Do not silently skip failing gates.
- Point the user to `.aftermath/runs/<n>/` (includes `summary.json` and `receipt.html`).
- Suggest `/aftermath-repair` only when there are actionable failures.
- Use `aftermath inspect latest` / `aftermath explain latest` for follow-up.
