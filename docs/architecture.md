# Architecture

## Layers

1. **Cursor Plugin** — commands, skill, agents, rules, hooks, MCP wiring
2. **Core engine** (`src/core`) — deterministic verification
3. **CLI** (`src/cli`) — same engine for terminals and CI
4. **MCP** (`src/mcp`) — tool access for agents
5. **Extension** (`extension/`) — optional UI only

```text
Plugin / CLI / MCP
        │
        ▼
   Core engine
   detect → plan → execute → findings → compare → receipt
        │
        ▼
   .aftermath/runs/<n>/
   receipt.json · summary.json · findings.json · findings.sarif*
```

\* SARIF when `--ci` or `--sarif`.

## Authority

The core engine is authoritative. Plugin prompts and MCP tools must not invent PASS/FAIL without execution evidence.

## Key modules

| Module | Responsibility |
|--------|----------------|
| `config` | Load + validate `.aftermath.toml` |
| `detect` / `plan` | Ecosystems + command discovery |
| `execute` | Argv spawn, timeouts, redaction |
| `findings` | AF001–AF012 classification |
| `baseline` / `compare` | Health snapshot + deltas |
| `verify` / `receipt` / `summary` | Orchestration + human/machine output |
| `repair` / `repair-state` | Repair context + loop limits |
| `doctor` | Environment / plugin / config health |

## Storage layout

See README “Receipts & machine output”. Baselines may be committed; run logs generally should not.

## Future hooks

Designed for later: coverage diffs, security scanning, mutation testing, GitHub check runs, receipt signing, SBOM comparison, Cloud Agent verification.
