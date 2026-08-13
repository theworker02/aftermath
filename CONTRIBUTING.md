# Contributing to Aftermath

Thanks for helping make independent verification better.

## Principles

- Evidence over claims
- Local-first, no required cloud backend, no telemetry
- Deterministic engine separate from Cursor UI/agent prompts
- Prefer consolidated modules over tiny packaging theater
- Company-grade docs: sharp, accurate, no Marketplace acceptance claims

## Development

```bash
npm install
npm run build
npm test
npm run validate:plugin
```

Optional extension:

```bash
cd extension && npm install && npm run compile
```

Link into Cursor for local plugin testing:

```powershell
./scripts/link-cursor-plugin.ps1
```

```bash
./scripts/link-cursor-plugin.sh
```

Then run **Developer: Reload Window**.

## Pull requests

- Keep PRs focused; use conventional commits when practical (`feat`, `fix`, `docs`, …)
- Add/adjust tests for engine behavior
- Update `CHANGELOG.md` for user-visible changes
- Do not invent unsupported Cursor manifest fields
- Keep package / plugin / extension versions aligned when releasing

## Useful docs

- [User guide](./docs/user-guide.md)
- [Configuration](./docs/configuration.md)
- [CI](./docs/ci.md)
- [Finding codes](./docs/findings.md)
- [Privacy](./docs/privacy.md)
- [Governance](./GOVERNANCE.md)
- [Threat model](./docs/threat-model.md)

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
