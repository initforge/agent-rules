#!/usr/bin/env bash
# Pencil MCP installer for the agent-rules harness (opencode host).
#
# Registers the stable launcher (node launch.mjs) as the `pencil` MCP server in
# ~/.config/opencode/opencode.json, preserving unrelated user configuration.
# Creates a timestamped backup before changing anything. Fails closed
# (BLOCKED/NEEDS_USER) when Pencil is not installed or the config is malformed.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$SCRIPT_DIR/manifest.json" ]] || { echo 'Pencil MCP manifest missing' >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'Pencil MCP installer requires Node.js.' >&2; exit 1; }

node "$SCRIPT_DIR/install-opencode.mjs" "$SCRIPT_DIR/launch.mjs"

echo
echo 'Pencil MCP entry installed. Diagnostic check:'
PENCIL_MCP_HOST=opencode PENCIL_MCP_LAUNCH_DRY_RUN=1 node "$SCRIPT_DIR/launch.mjs" || true
