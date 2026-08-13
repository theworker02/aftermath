# FAQ

## Is Aftermath an AI reviewer?

No. It executes repository commands and compares evidence to baselines. Agents may *drive* Aftermath; they do not author the verdict.

## Does `VERIFIED` mean bug-free?

No. It means configured mandatory gates ran and passed for that run.

## Does Aftermath send my code anywhere?

No. Local-first by design: no telemetry, no required API keys, no cloud backend. See [privacy.md](./privacy.md).

## Why didn’t it run `npm test`?

Discovery only uses scripts/commands that exist. Configure them under `[verify]` or add a real package script / CI step.

## What’s the difference between `--ci` and interactive verify?

`--ci` uses strict exit codes (`partially_verified` fails the job) and writes SARIF. Interactive mode keeps `partially_verified` as exit `0` for repair loops.

## Where is the machine-readable summary?

`.aftermath/runs/<n>/summary.json`, also printable via `aftermath verify --json`.

## How do I validate config?

`aftermath config validate` or `aftermath doctor`.

## Can I use this without Cursor?

Yes. The CLI and core engine are standalone. The Cursor plugin is the primary UX for agent workflows.

## Is Marketplace listing claimed?

No. As of 2026-08-13, submission may be pending; acceptance is not claimed until published.
