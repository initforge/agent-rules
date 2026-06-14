#!/usr/bin/env bash
# Cross-platform Antigravity preflight — bash on Linux, PowerShell fallback on Windows
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -x "$ROOT/scripts/antigravity-preflight.sh" ]] && command -v bash >/dev/null 2>&1; then
  exec bash "$ROOT/scripts/antigravity-preflight.sh"
fi

if command -v pwsh >/dev/null 2>&1; then
  exec pwsh -NoProfile -ExecutionPolicy Bypass -File "$ROOT/scripts/antigravity-preflight.ps1"
fi

if command -v powershell >/dev/null 2>&1; then
  exec powershell -NoProfile -ExecutionPolicy Bypass -File "$ROOT/scripts/antigravity-preflight.ps1"
fi

echo '{"injectSteps":[{"ephemeralMessage":"Antigravity preflight: no bash or PowerShell available."}]}'