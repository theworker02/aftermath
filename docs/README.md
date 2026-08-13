# Aftermath documentation

Independent verification for agent-written code. Local-first. No telemetry.

## Start here

| Doc | Audience |
|-----|----------|
| [User guide](./user-guide.md) | Operators & developers |
| [Configuration](./configuration.md) | `.aftermath.toml` reference |
| [CI](./ci.md) | GitHub Actions / automation |
| [FAQ](./faq.md) | Common questions |
| [Findings](./findings.md) | Codes AF001–AF012 |

## Product & policy

| Doc | Topic |
|-----|-------|
| [Privacy](./privacy.md) | Local-first, no telemetry |
| [Threat model](./threat-model.md) | Security assumptions |
| [Support](./support.md) | How to get help |
| [Marketplace](./marketplace.md) | Cursor plugin publishing notes |
| [Architecture](./architecture.md) | Engine layers |
| [Topics](./topics.md) | Index of concepts |

## Companion surfaces

- Website: https://theworker02.github.io/aftermath/
- Brand guidelines: [`../assets/README.md`](../assets/README.md)
- Extension: [`../extension/README.md`](../extension/README.md)
- Roadmap: [`../ROADMAP.md`](../ROADMAP.md)
- Security policy: [`../SECURITY.md`](../SECURITY.md)
- Governance: [`../GOVERNANCE.md`](../GOVERNANCE.md)

## CLI cheat sheet (0.4)

```bash
aftermath status
aftermath verify [--ci] [--json] [--sarif]
aftermath inspect latest
aftermath explain latest
aftermath compare latest
aftermath receipt latest --html
aftermath repair-context latest
aftermath config validate
aftermath doctor
```

`latest` / `last` resolve to the newest run everywhere a run id is accepted.
