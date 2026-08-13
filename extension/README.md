# Aftermath companion extension

Optional Open VSX / VS Code companion for the [Aftermath](https://github.com/theworker02/aftermath) verification engine.

## What it does

- **Status bar** — latest verdict, finding count, baseline hint
- **Side panel** — latest run, findings (with file:line jump when available), baseline, repair attempts, runs list
- **Commands**
  - Verify Repository
  - Create Baseline
  - Show Status
  - Open Latest Receipt (Markdown)
  - Open Latest HTML Receipt (browser)
  - Compare With Baseline
  - Prepare Repair Context

## Requirements

- Node.js ≥ 20
- Aftermath CLI available either as:
  - `dist/cli/index.js` in the workspace (dev), or
  - `aftermath` on `PATH` (installed package)

## Develop

```bash
cd extension
npm install
npm run compile
```

Press F5 in VS Code/Cursor against this folder to launch an Extension Development Host, or package with `npm run package` when publishing.

## Privacy

Local-first. The extension only shells out to the Aftermath CLI in the workspace. No telemetry, no cloud calls, no required API keys.

## Version

Aligned with the main Aftermath package (**0.4.0**).
