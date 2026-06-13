#!/usr/bin/env bash
# Sync cursor/rules master → Grok CLI live (.grok/rules) + Cursor compat (.cursor/rules)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MASTER="$ROOT/cursor/rules"
GROK_LIVE="$ROOT/.grok/rules"
CURSOR_LIVE="$ROOT/.cursor/rules"

mkdir -p "$GROK_LIVE" "$CURSOR_LIVE"
cp "$MASTER"/*.md "$GROK_LIVE/"
cp "$MASTER"/*.md "$CURSOR_LIVE/"

echo "Synced $(ls -1 "$MASTER"/*.md | wc -l) rules:"
echo "  → $GROK_LIVE  (Grok CLI primary)"
echo "  → $CURSOR_LIVE (Cursor compat)"
echo "Verify: grok inspect"