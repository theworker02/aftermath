# Asset inventory â€” always writes .aftermath/runs/<n>/summary.json

## Repository surfaces

| Asset | Location / notes |
|-------|------------------|
| Source tree | Repository root / language packages |
| Tests | `test/`, `tests/`, CI workflows if present |
| Docs | `README.md`, `docs/` |
| Diligence room | `docs/acquisition/` |
| License / notices | `LICENSE`, transition notices if present |
| Funding | `.github/FUNDING.yml` |
| CI | `.github/workflows/` if present |
| Branding | logos/assets folders if present |

## Capability highlights

- `aftermath_verify` Ã‚Â· `aftermath_get_receipt` Ã‚Â· `aftermath_get_findings`
- `aftermath_get_baseline` Ã‚Â· `aftermath_compare` Ã‚Â· `aftermath_prepare_repair`
- `aftermath_explain_finding` Ã‚Â· `aftermath_inspect` Ã‚Â· `aftermath_doctor`
- `aftermath_config_validate` Ã‚Â· `aftermath_baseline` Ã‚Â· `aftermath_status`
- **Local-first**: no account, no required API key, no telemetry, no cloud backend
- argv-based execution (no shell interpolation)
- Destructive commands require approval
- Best-effort secret redaction; log size limits
- Untrusted repos: review `.aftermath.toml` and discovered scripts first
- Issues: [github.com/theworker02/aftermath/issues](https://github.com/theworker02/aftermath/issues)
- Support guide: [SUPPORT.md](./SUPPORT.md)
- Sponsors: [github.com/sponsors/theworker02](https://github.com/sponsors/theworker02) Ã‚Â· [thanks.dev/u/gh/theworker02](https://thanks.dev/u/gh/theworker02)

## Usually excluded

Seller personal accounts, unrelated repos, and unreissued registry tokens â€” unless listed in the definitive agreement.

*Updated: 2026-09-22*
