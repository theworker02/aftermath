---
name: aftermath-inspect
description: Inspect a previous Aftermath run — plan, environment, fingerprints, findings, and next action
---

# /aftermath-inspect

Inspect a previous Aftermath verification run and its artifacts.

## Usage

```text
/aftermath-inspect 184
/aftermath-inspect latest
```

## Instructions

1. Parse the run id/number from the user message. If omitted, use `latest`.
2. Run:

```bash
aftermath inspect <run|latest>
```

3. Return the structured inspect output, including:
   - environment and tool versions
   - change fingerprint
   - plan / ecosystems
   - category summary
   - failures and findings (with file:line when present)
   - baseline comparison status
   - recommended next action
   - artifact paths under `.aftermath/runs/<n>/` (includes `receipt.html`)
