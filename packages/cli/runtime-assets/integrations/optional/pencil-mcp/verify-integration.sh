#!/usr/bin/env bash
# Real Pencil MCP integration check for the agent-rules harness.
#
# Performs an actual MCP initialize + tools/list handshake through the stable
# launcher and the exact args configured for opencode. Exits 0 only on a live
# handshake. Process existence or .pen file existence is NOT accepted as proof.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Pencil MCP check requires Node.js.' >&2; exit 1; }

export PENCIL_MCP_HOST="${PENCIL_MCP_HOST:-opencode}"
export PENCIL_MCP_AGENT="${PENCIL_MCP_AGENT:-openCodeCLI}"

node "$SCRIPT_DIR/handshake-check.mjs" --app desktop --agent "$PENCIL_MCP_AGENT"
