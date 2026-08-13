#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${HOME}/.cursor/plugins/local/aftermath"
mkdir -p "$(dirname "$TARGET")"
rm -rf "$TARGET"
ln -s "$ROOT" "$TARGET"
echo "Linked $ROOT -> $TARGET"
echo "Reload Cursor window to pick up the local plugin."
