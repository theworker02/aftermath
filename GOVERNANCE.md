# Governance

Aftermath is maintained as a small, independent open-source project.

## Goals

- Keep verification **local-first**, deterministic, and evidence-backed
- Prefer durable receipts over narrative claims
- Ship focused releases with documented breaking changes

## Decision making

- Day-to-day: maintainer [`theworker02`](https://github.com/theworker02)
- Meaningful changes land via pull requests with CI green (`build`, `test`, `validate:plugin`)
- Security-sensitive changes follow [SECURITY.md](./SECURITY.md)

## Contributions

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Versioning

Semantic versioning for the npm package / plugin / extension versions kept in lockstep when practical.

## Non-goals (near term)

- Cloud verification backend
- Telemetry or account systems
- Claiming Cursor Marketplace acceptance before publication
