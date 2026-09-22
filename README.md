<p align="center">
  <img src="assets/banner.svg" alt="Aftermath">
</p>

<h1 align="center">Aftermath</h1>

<p align="center">
  <strong>Trust the evidence, not the completion message.</strong><br/>
  Independent verification for agent-written code.
</p>

<p align="center">
  <a href="https://github.com/theworker02/aftermath/actions/workflows/ci.yml"><img src="https://github.com/theworker02/aftermath/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-Proprietary%20(source--available)-blue.svg" alt="License"></a>
  <a href="https://github.com/theworker02/aftermath/releases"><img src="https://img.shields.io/github/v/release/theworker02/aftermath?include_prereleases&label=release" alt="Release"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-3F6B4F?labelColor=0B0F14" alt="Node >= 20">
  <a href="https://cursor.directory/u/theworker02"><img src="https://img.shields.io/badge/Cursor-Directory-111111?labelColor=0B0F14" alt="Cursor Directory"></a>
  <img src="https://img.shields.io/badge/privacy-local--first-3F6B4F" alt="Privacy">
  <img src="https://img.shields.io/badge/telemetry-none-111111?labelColor=0B0F14" alt="No telemetry">
</p>

<p align="center">
  <a href="https://cursor.directory/u/theworker02">Cursor Directory</a> Ã‚Â·
  <a href="./docs/user-guide.md">User guide</a> Ã‚Â·
  <a href="./docs/configuration.md">Configuration</a> Ã‚Â·
  <a href="./docs/ci.md">CI</a> Ã‚Â·
  <a href="./docs/privacy.md">Privacy</a> Ã‚Â·
  <a href="https://theworker02.github.io/aftermath/">Website</a>
</p>

---

## What Aftermath is

CursorÃ¢â‚¬â„¢s agent writes the code. **Aftermath determines whether the resulting repository actually works.**

Aftermath is an execution-backed verification layer for coding agents. It independently examines diffs, builds, tests, linters, type checkers, formatters, smoke tests, dependency changes, public API drift, warnings, benchmark regressions, artifacts, and repository health Ã¢â‚¬â€ then produces a durable **verification receipt** (human + machine-readable).

It is **not** another AI code reviewer. Differentiation in one line:

```text
claims  vs  evidence
```

| Typical tool | Aftermath |
|--------------|-----------|
| Summarizes diffs / suggests edits | Executes configured gates and records outcomes |
| Confidence from a model response | Confidence from exit codes, metrics, and baselines |
| Ephemeral chat output | Durable receipts under `.aftermath/` |
| Cloud account / API key | Local-first; no telemetry; no required keys |

## Why it exists

Agents finish with confident completion messages. Repositories do not always agree.

```text
Cursor Agent
    Ã¢â€ â€œ
"Implementation complete"
    Ã¢â€ â€œ
Aftermath
    Ã¢â€ â€œ
Build       PASS
Tests       FAIL (4)
Lint        +2 warnings
API         1 break
Deps        lockfile drift
    Ã¢â€ â€œ
PARTIALLY VERIFIED
```

## How it works

```text
Repository Ã¢â€ â€™ Detect Ã¢â€ â€™ Baseline Ã¢â€ â€™ Diff Ã¢â€ â€™ Discover commands Ã¢â€ â€™ Plan
    Ã¢â€ â€™ Execute Ã¢â€ â€™ Artifacts Ã¢â€ â€™ Compare Ã¢â€ â€™ Findings Ã¢â€ â€™ Receipt (+ summary.json)
```

Vocabulary: **Run Ã‚Â· Receipt Ã‚Â· Finding Ã‚Â· Evidence Ã‚Â· Baseline Ã‚Â· Gate Ã‚Â· Repair Context**

`VERIFIED` means configured mandatory gates executed and passed. It does **not** mean the software is bug-free.

## Install

### Cursor Ã¢â‚¬â€ local plugin (recommended while developing)

Cursor loads local plugins from `~/.cursor/plugins/local`.

```powershell
./scripts/link-cursor-plugin.ps1
```

```bash
./scripts/link-cursor-plugin.sh
```

Then **Developer: Reload Window**. Allow third-party / user-local plugins in Cursor settings.

### Cursor Directory

Install and browse Aftermath on [Cursor Directory](https://cursor.directory/u/theworker02):

https://cursor.directory/u/theworker02

Local plugin development instructions remain below and in [docs/marketplace.md](./docs/marketplace.md).

### CLI

```bash
npm install
npm run build
node dist/cli/index.js doctor
node dist/cli/index.js verify
```

After packaging / global install:

```bash
aftermath verify
aftermath verify --ci --json
aftermath status
aftermath config validate
aftermath inspect latest
aftermath receipt latest --html
```

Requires **Node.js Ã¢â€°Â¥ 20**.

## Quick start

1. Install / link Aftermath in Cursor.
2. Open a repository.
3. `/aftermath-baseline`
4. Let Cursor perform work.
5. `/aftermath-verify` (or check `aftermath status`)
6. If needed: `/aftermath-repair` Ã¢â€ â€™ fix Ã¢â€ â€™ `/aftermath-verify` again
7. Optional: `aftermath compare latest` Ã‚Â· `aftermath inspect latest` Ã‚Â· `aftermath explain latest` Ã‚Â· open `receipt.html`

## Commands

### Cursor plugin

| Command | Purpose |
|---------|---------|
| `/aftermath-verify` | Verify changes and produce a receipt |
| `/aftermath-baseline` | Create a health baseline (never silently overwrite) |
| `/aftermath-inspect` | Inspect a previous run (`latest` supported) |
| `/aftermath-explain` | Explain failures + recommended next action |
| `/aftermath-repair` | Build a targeted repair context package |

### CLI

| Command | Purpose |
|---------|---------|
| `aftermath verify [--full] [--ci] [--json] [--sarif]` | Run verification |
| `aftermath status` | Latest verdict, findings, baseline |
| `aftermath baseline [--force]` | Create / overwrite baseline |
| `aftermath inspect <run\|latest>` | Rich run inspection |
| `aftermath explain <run\|latest>` | Observation / finding / relation / next action |
| `aftermath compare [run\|latest]` | Concrete deltas vs baseline |
| `aftermath receipt <run\|latest> [--html\|--md\|--json]` | Export / print receipt paths |
| `aftermath repair-context <run\|latest>` | Write repair context |
| `aftermath config validate` | Validate `.aftermath.toml` |
| `aftermath doctor` | Environment / plugin / config health |
| `aftermath version` | Print version |

Run aliases: **`latest`** and **`last`** resolve to the newest verification run.

Example console output:

```text
AFTERMATH
Verification #184
Repository: example/project
Change: 17 files  +1284 -391
Repair attempts: 0

BUILD     PASS ok
TEST      FAIL 4 failed
LINT      PASS 2 warnings

Category summary:
- build: 1 pass / 0 fail / 0 other
- test: 0 pass / 1 fail / 0 other

Most important failure:
- test/test: 4 failed

VERDICT
PARTIALLY VERIFIED
```

### CI

```bash
aftermath verify --ci
# always writes .aftermath/runs/<n>/summary.json
# --ci also writes findings.sarif
aftermath verify --ci --json   # print summary to stdout
```

| Exit | Meaning |
|------|---------|
| 0 | verification gates passed |
| 1 | verification gate failed |
| 2 | configuration or infrastructure error |
| 3 | verification inconclusive |

See [docs/ci.md](./docs/ci.md).

## Receipts & machine output

```text
.aftermath/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ baseline.json
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ receipts/
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ runs/0184/
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ metadata.json
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ diff.patch
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ plan.json
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ findings.json
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ findings.sarif      # with --ci / --sarif
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ summary.json        # CI-friendly machine summary
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ repair-context.md
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ receipt.json
    Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ receipt.md
    Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ receipt.html        # shareable / screenshot-friendly
```

Storage: when `.aftermath` run artifacts exceed `limits.max_run_storage_mb` (default 500), oldest runs are pruned after verify with notes on the receipt.
## Configuration

Documented in [docs/configuration.md](./docs/configuration.md). Example: [`.aftermath.toml.example`](./.aftermath.toml.example).

```toml
version = 1

[verify]
test = ["npm test"]
lint = ["npm run lint"]

[policy]
tests_must_pass = true
allow_new_warnings = false
allow_removed_tests = false
max_repair_attempts = 3
```

Validate anytime:

```bash
aftermath config validate
```

## MCP

Optional local MCP server (no cloud):

- `aftermath_verify` Ã‚Â· `aftermath_get_receipt` Ã‚Â· `aftermath_get_findings`
- `aftermath_get_baseline` Ã‚Â· `aftermath_compare` Ã‚Â· `aftermath_prepare_repair`
- `aftermath_explain_finding` Ã‚Â· `aftermath_inspect` Ã‚Â· `aftermath_doctor`
- `aftermath_config_validate` Ã‚Â· `aftermath_baseline` Ã‚Â· `aftermath_status`

Most receipt tools accept **`latest`**.
## Security & privacy

- **Local-first**: no account, no required API key, no telemetry, no cloud backend
- argv-based execution (no shell interpolation)
- Destructive commands require approval
- Best-effort secret redaction; log size limits
- Untrusted repos: review `.aftermath.toml` and discovered scripts first

See [SECURITY.md](./SECURITY.md), [docs/threat-model.md](./docs/threat-model.md), [docs/privacy.md](./docs/privacy.md).

## Architecture

| Layer | Role |
|-------|------|
| Cursor plugin | commands, skill, agents, rules, hooks |
| Core engine | detection Ã¢â€ â€™ plan Ã¢â€ â€™ execute Ã¢â€ â€™ compare Ã¢â€ â€™ receipt |
| CLI | same engine for terminals & CI |
| MCP | agent-accessible deterministic tools |
| Extension | optional UI (`publisher`: `aftermath`) |

Details: [docs/architecture.md](./docs/architecture.md).

## Demo & screenshots

Reproducible loop: [`examples/broken-project`](./examples/broken-project).

Visual / transcript assets (until a recorded GIF ships):

| Asset | Description |
|-------|-------------|
| [`assets/demo-storyboard.svg`](./assets/demo-storyboard.svg) | Storyboard |
| [`assets/demo-transcript.txt`](./assets/demo-transcript.txt) | Console transcript |
| [`assets/demo.md`](./assets/demo.md) | Recording notes |
| [`assets/banner.svg`](./assets/banner.svg) | Brand banner |

## Supported ecosystems

Rust Ã‚Â· Go Ã‚Â· Node/TypeScript Ã‚Â· Python Ã‚Â· Dart/Flutter Ã‚Â· Ruby Ã‚Â· .NET Ã‚Â· Java

Discovery order: `.aftermath.toml` Ã¢â€ â€™ CI workflows Ã¢â€ â€™ package scripts Ã¢â€ â€™ Makefile/just Ã¢â€ â€™ ecosystem conventions. Aftermath never invents `npm test` if the script does not exist.

## Documentation map

| Doc | Topic |
|-----|-------|
| [docs/README.md](./docs/README.md) | Docs portal |
| [docs/user-guide.md](./docs/user-guide.md) | End-to-end usage |
| [docs/faq.md](./docs/faq.md) | FAQ |
| [docs/configuration.md](./docs/configuration.md) | Config reference |
| [docs/ci.md](./docs/ci.md) | GitHub Actions / CI |
| [docs/findings.md](./docs/findings.md) | Finding codes AF001Ã¢â‚¬â€œAF012 |
| [docs/support.md](./docs/support.md) | Getting help |
| [assets/README.md](./assets/README.md) | Brand guidelines |
| [extension/README.md](./extension/README.md) | Companion extension |
| [ROADMAP.md](./ROADMAP.md) | Honest roadmap |
| [SUPPORT.md](./SUPPORT.md) | Support policy |
| [GOVERNANCE.md](./GOVERNANCE.md) | Lightweight governance |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Contributing |

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for shipped vs near-term vs out-of-scope. No vapor claims.
## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Support & funding

- Issues: [github.com/theworker02/aftermath/issues](https://github.com/theworker02/aftermath/issues)
- Support guide: [SUPPORT.md](./SUPPORT.md)
- Sponsors: [github.com/sponsors/theworker02](https://github.com/sponsors/theworker02) Ã‚Â· [thanks.dev/u/gh/theworker02](https://thanks.dev/u/gh/theworker02)

## License

**Source-available proprietary** â€” evaluation under [LICENSE](./LICENSE); commercial / production use via [COMMERCIAL.md](./COMMERCIAL.md). See [LICENSE_TRANSITION_NOTICE.md](./LICENSE_TRANSITION_NOTICE.md) and [NOTICE](./NOTICE).


---

## License & acquisition

This project is **proprietary**. Production use, redistribution, and commercial deployment require a written commercial license or completed acquisition. See [LICENSE](./LICENSE) and [ACQUISITION.md](./ACQUISITION.md). Contact [@theworker02](https://github.com/theworker02).

## Acquisition diligence

Buyer-facing diligence materials live in [docs/acquisition/](./docs/acquisition/). Commercial licensing contact path: [COMMERCIAL.md](./COMMERCIAL.md).
