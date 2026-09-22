# Buyer evaluation â€” always writes .aftermath/runs/<n>/summary.json

## Goal

In 15â€“45 minutes, verify the Product builds or runs as documented and that proprietary notices are present.

## Steps

1. Confirm root `LICENSE` is proprietary and `ACQUISITION.md` exists.
2. Skim `README.md` install/run claims.
3. Execute:

```
```text
claims  vs  evidence
```
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
```text
Repository Ã¢â€ â€™ Detect Ã¢â€ â€™ Baseline Ã¢â€ â€™ Diff Ã¢â€ â€™ Discover commands Ã¢â€ â€™ Plan
    Ã¢â€ â€™ Execute Ã¢â€ â€™ Artifacts Ã¢â€ â€™ Compare Ã¢â€ â€™ Findings Ã¢â€ â€™ Receipt (+ summary.json)
```
```powershell
./scripts/link-cursor-plugin.ps1
```
```bash
./scripts/link-cursor-plugin.sh
```
```bash
npm install
npm run build
node dist/cli/index.js doctor
node dist/cli/index.js verify
```
```bash
aftermath verify
aftermath verify --ci --json
aftermath status
aftermath config validate
aftermath inspect latest
```

4. Run tests if present (`npm test`, `pytest`, `cargo test`, `go test ./...`, etc.).
5. Record README vs observed behavior gaps in workpapers.

## Pass criteria

- [ ] Clone succeeds
- [ ] Documented happy path works **or** failure is explained
- [ ] Minimal path needs no surprise secrets
- [ ] License notices intact

*Updated: 2026-09-22*
