---
name: aftermath-explain
description: Explain an Aftermath verification result with observation, finding, relation, and next action
---

# /aftermath-explain

Explain a verification result without overclaiming causation.

## Usage

```text
/aftermath-explain 184
/aftermath-explain latest
```

## Instructions

1. Load the run via CLI or MCP (`latest` if unspecified):

```bash
aftermath explain <run|latest>
```

2. Structure the answer as:

### Observation
What the tool literally reported (exit codes, counts, statuses, file:line hints).

### Finding
What Aftermath classified (test failures, new warnings, API removals, dependency drift, etc.).

### Likely relation to change
Correlate to modified files/symbols when evidence supports it.

### Recommended next action
Use the action Aftermath recommends (repair loop, doctor, policy review, escalate).

3. Explicitly avoid claiming causation unless evidence proves it.
4. Prefer `aftermath status` when the user only needs the latest verdict snapshot.
