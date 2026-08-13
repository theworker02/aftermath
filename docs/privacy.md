# Privacy

Aftermath is **local-first**.

## What we do not do

- No telemetry in v0.x
- No source code uploads
- No log uploads
- No analytics SDKs
- No required cloud backend, account, or API key for core verification

## What stays on your machine

Verification writes under `.aftermath/` in the repository:

- `baseline.json` (optional to commit)
- `runs/` and `receipts/` (local evidence; gitignored by default)
- `cache/repair-state.json` (repair attempt counts per change fingerprint)

Secrets may still appear in command output. Redaction is best-effort — treat receipts as sensitive if your builds print tokens.

## Cursor / MCP

When used as a Cursor plugin or local MCP server, Aftermath still executes and stores evidence locally. Cursor’s own model traffic is separate from Aftermath’s verification engine.

## Future telemetry

If optional telemetry is ever considered, it will be **explicit opt-in**, documented in CHANGELOG and SECURITY, and off by default.
