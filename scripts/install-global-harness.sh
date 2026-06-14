#!/usr/bin/env bash
# Cài toàn bộ global harness: Codex + Grok (rules, skills, hooks)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/install-codex-global.sh"
echo ""
"$ROOT/scripts/install-grok-global.sh"