# Threat Model

See also [SECURITY.md](../SECURITY.md).

## Assets

- Source code and secrets in the working tree
- Verification receipts and logs
- Developer trust in completion claims

## Adversaries

- Malicious repository authors
- Poisoned CI / package scripts
- Accidental secret leakage into logs

## Controls

- argv spawn without shell
- Destructive command gating
- Log truncation + redaction
- Local-only operation (no cloud upload)
- Explicit baseline overwrite
