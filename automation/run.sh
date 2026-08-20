#!/usr/bin/env bash
set -euo pipefail

if ! command -v pwsh >/dev/null 2>&1; then
  echo "PowerShell Core (pwsh) is required. Install: https://github.com/PowerShell/PowerShell" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAME="${1:-}"

if [[ -z "$NAME" ]]; then
  echo "Usage: $0 <script-name> [args...]" >&2
  echo "Example: $0 03-validate-context" >&2
  exit 1
fi

shift || true
SCRIPT="$SCRIPT_DIR/${NAME}.ps1"

if [[ ! -f "$SCRIPT" ]]; then
  echo "Script not found: $SCRIPT" >&2
  exit 1
fi

exec pwsh -File "$SCRIPT" "$@"
