---
name: aftermath-repair
description: Prepare a targeted Aftermath repair context package for Cursor to fix failures
---

# /aftermath-repair

Prepare a **repair context package** — not a vague "fix the tests" instruction.

## Instructions

1. Identify the target run (`latest` if unspecified).
2. Generate repair context:

```bash
aftermath repair-context latest
# or: aftermath repair-context <run>
```

3. Open/read `.aftermath/runs/<n>/repair-context.md` (includes top error lines and file:line when parseable).
4. Using that package, repair only the identified problems.
5. Do **not** undo unrelated correct changes.
6. Do **not** weaken tests solely to obtain VERIFIED.
7. After repairs, run `/aftermath-verify` again.
8. Track repair attempts. After the configured max (default 3), stop automatic repair loops and present remaining evidence.
9. Optional: open `receipt.html` for a shareable view (`aftermath receipt latest --html`).

## Repair context must include

- original task
- changed files
- relevant diff
- failing command
- failure output excerpt / top error lines
- related test files / locations
- suspected symbols
- baseline differences
- previous repair attempts (if any)
