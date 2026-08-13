# Broken Project Demo

This tiny Node project demonstrates the Aftermath loop:

1. Healthy baseline (`node test.js` passes)
2. Agent "change" introduces a regression (`src/pool.js`)
3. `/aftermath-verify` detects failure
4. `/aftermath-repair` builds repair context
5. Fix applied
6. Verification passes

## Commands

```bash
# from repo root after build
node dist/cli/index.js baseline --cwd examples/broken-project
# introduce regression by switching to broken implementation if needed
node dist/cli/index.js verify --cwd examples/broken-project
```
