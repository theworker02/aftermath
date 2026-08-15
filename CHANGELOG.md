# Changelog

All notable changes to Aftermath will be documented in this file.

## [Unreleased]

### Changed

- Document Aftermath on [Cursor Directory](https://cursor.directory/plugins/aftermath); remove pending Marketplace approval language from README, docs, and website

## [0.4.0] - 2026-08-13

### Added

- HTML receipts (`receipt.html`) written on every verify; `aftermath receipt <run|latest> [--html|--md|--json]`
- Run alias `latest` / `last` for inspect, explain, compare, repair-context, receipt, and MCP tools
- `aftermath status` — latest verdict, finding counts, baseline presence, since-baseline hint
- Smoke `ready_pattern`: match stdout/stderr, terminate process deterministically, record PASS
- Storage hygiene: prune oldest runs when `limits.max_run_storage_mb` is exceeded (logged on receipt)
- Finding navigation: `location.file` / `line` / `column` when parseable from logs; SARIF physical locations
- Repair context: top error lines section + finding locations
- MCP tool `aftermath_status`
- Extension: Show Status, Open Latest HTML Receipt, richer empty states, extension README
- Brand guidelines (`assets/README.md`), docs portal (`docs/README.md`), `CITATION.cff`, `ROADMAP.md`
- Website OG meta tags, favicon consistency, Phase 4 CLI/docs copy

### Changed

- Version bump to **0.4.0** across package, plugin manifest, and extension
- Plugin commands/skill/hooks voice aligned for company-grade consistency; hooks record Node path/platform
- Configuration docs document smoke readiness and storage pruning
- SECURITY supported-versions table and advisory reporting link clarified

### Fixed

- Banner SVG corrupted arrow glyphs restored
- Windows-friendly hook invocation remains `node ./scripts/hooks/*.mjs` (explicit Node, no shell scripts)

### Security

- Local-first posture unchanged: no telemetry, no cloud, no required API keys
- Destructive command gating and argv-based execution unchanged
- Storage pruning only deletes Aftermath-managed run/receipt artifacts under `.aftermath/`

## [0.3.0] - 2026-08-13

### Added

- `aftermath config validate` with schema checks, semantic warnings, and clearer TOML parse errors
- Doctor now validates configuration (fail on invalid `.aftermath.toml`)
- Machine-readable `summary.json` written on every verify run (also under `.aftermath/receipts/`)
- `aftermath verify --json` prints the CI summary to stdout
- `aftermath verify --sarif` (and `--ci`) writes `findings.sarif` for Code Scanning consumers
- Richer `inspect`: environment, fingerprints, plan, category summary, baseline status, recommended next action
- `explain` includes a **Recommended next action** section
- Stronger AF004 evidence (JS/TS exports, CommonJS, Rust `pub` items, related files)
- Stronger AF009 dependency drift evidence (fingerprints, manifests, lockfile touches, sample names)
- Baseline dependency fingerprints via shared dependency snapshot helper
- MCP tool `aftermath_config_validate`; `aftermath_verify` accepts `json`
- Docs: configuration reference, CI guide, user guide, FAQ, support, governance, AUTHORS
- Company-grade README / website / SECURITY / CONTRIBUTING polish

### Changed

- Version bump to **0.3.0** across package, plugin manifest, and extension
- Extension command titles and empty-state copy
- Plugin command docs emphasize `--json` / `--ci` / next-action inspect & explain
- Example GitHub Actions workflow uploads `summary.json` / SARIF-friendly artifacts

### Fixed

- Invalid or malformed `.aftermath.toml` now fails loudly with path-scoped messages instead of silently merging junk

### Security

- Config validation rejects unknown keys (strict schema) and warns on destructive-looking verify commands and invalid redaction regexes
- No telemetry; local-first posture unchanged

## [0.2.0] - 2026-08-13

### Added

- Real `aftermath compare [run]` with concrete metric deltas, check status changes, and highlights vs baseline
- Repair-loop tracking persisted under `.aftermath/cache/repair-state.json`; surfaced in receipts, repair context, CLI, MCP, and extension
- Makefile and justfile discovery for common verify targets (`test`, `lint`, `build`, …)
- Smarter CI workflow discovery (multiline `run:` blocks, setup-only filtering, command dedupe)
- Node workspace-aware scoping and dependency/lockfile plan hints
- Richer human/console receipts: category summaries and most-important-failure highlighting
- MCP tool `aftermath_compare`
- Demo storyboard SVG + console transcript; recording notes in `assets/demo.md`
- GitHub issue/PR templates, CODEOWNERS, `docs/privacy.md`, `docs/findings.md`, `docs/topics.md`

### Changed

- Doctor summarizes unique ecosystem tools and validates plugin layout/manifest more thoroughly
- Extension tree labels include verdict, finding counts, and repair attempts
- Example `.aftermath.toml` documents repair limits, benchmarks, artifacts, and redaction
- Website privacy/docs/changelog pages expanded; README demo section points at storyboard until GIF exists

### Fixed

- Compare no longer only prints baseline stats without a current-run delta

## [0.1.0] - 2026-08-13

### Added

- Cursor plugin manifest, commands, skill, verifier/regression agents, hooks, and completion-guard rule
- Deterministic verification engine with ecosystem detection and command discovery
- Baselines, receipts (JSON + Markdown), findings, and repair context packages
- CLI: `verify`, `baseline`, `inspect`, `explain`, `compare`, `repair-context`, `doctor`, `version`
- Optional local MCP server tools for verification and receipt access
- Optional Open VSX-oriented companion extension scaffold
- Fixtures, broken-project demo, docs site, CI workflows
- Branding assets and security/privacy documentation

### Security

- argv-based process execution (no shell)
- Destructive command gating
- Best-effort secret redaction and log truncation limits
