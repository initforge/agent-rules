#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Pencil MCP launcher requires Node.js for native host-config discovery.' >&2; exit 1; }
exec node "$SCRIPT_DIR/launch.mjs"
