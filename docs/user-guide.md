# User guide

## Mental model

Aftermath answers one question: **did the repository’s configured verification gates actually pass after this change?**

It does not replace code review, security audits, or product QA. It produces evidence.

## First-time setup

1. Install the Cursor local plugin or build the CLI ([README](../README.md)).
2. Run `aftermath doctor`.
3. Optionally add `.aftermath.toml` (copy from `.aftermath.toml.example`) and run `aftermath config validate`.
4. Create a baseline: `/aftermath-baseline` or `aftermath baseline`.

## Everyday loop

1. Agent implements work.
2. Optional: `aftermath status` for a quick snapshot.
3. `/aftermath-verify` (or `aftermath verify`).
4. Read the verdict and category summary (`receipt.md` / `receipt.html` / `summary.json`).
5. On failure: `/aftermath-explain latest` then `/aftermath-repair`.
6. Apply a targeted fix; re-verify.
7. Stop when `max_repair_attempts` is reached for the change fingerprint — escalate instead of looping.

## Inspecting evidence

```bash
aftermath status
aftermath inspect latest
aftermath explain latest
aftermath compare latest
aftermath receipt latest --html
```

Run aliases `latest` / `last` work anywhere a run id is accepted. Inspect includes environment, plan, fingerprints, findings (with file:line when parseable), and a recommended next action. Artifacts live under `.aftermath/runs/<n>/`.

## CI usage

See [ci.md](./ci.md). Prefer `aftermath verify --ci --json` in pull requests.

## Optional MCP

Enable the plugin MCP wiring (`mcp.json`) so agents can call deterministic tools instead of inventing PASS/FAIL.

## Optional extension

The `extension/` companion shows latest verdict, findings, baseline presence, and repair attempts. Core verification does not depend on it.

## Common pitfalls

- Claiming completion from a chat message without a receipt
- Inventing `npm test` when no script exists — Aftermath will not
- Overwriting baselines casually
- Committing bulky run logs (prefer committing baseline + config only)
