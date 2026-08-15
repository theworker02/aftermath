# Roadmap

Honest plans for Aftermath. Items here are **intent**, not commitments or ship dates.

## Shipped

- **0.1** — Plugin + engine + CLI + receipts + baselines + MCP scaffold
- **0.2** — Real compare, repair-loop state, richer discovery, demo assets
- **0.3** — Config validate, summary.json / SARIF, richer inspect/explain, company docs
- **0.4** — HTML receipts, `latest` alias, `status`, smoke `ready_pattern`, storage pruning, finding locations, branding kit

## Near-term (candidates)

- Coverage delta vs baseline (when coverage artifacts already exist locally)
- Richer ecosystem parsers (pytest-json, cargo nextest, junit ingest)
- Receipt signing / integrity hash for CI attestation (still local keys)
- Open VSX extension publish checklist automation
- Optional watch mode that re-runs verify on save (explicit opt-in only)

## Later / exploratory

- Mutation testing hooks
- SBOM comparison
- GitHub Check Runs upload helpers (still no Aftermath cloud)
- Cloud Agent verification adapters

## Explicitly out of scope (for now)

- Hosted Aftermath SaaS / accounts
- Required API keys or telemetry
- Replacing human judgment with an “AI confidence score”

Updates land in [CHANGELOG.md](./CHANGELOG.md) when shipped.
