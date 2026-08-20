#!/usr/bin/env bash
# Pencil MCP provisioning check (installation-level, NOT activation).
#
# Distinguishes provisioning from activation:
#   - provisioning: stable launcher present + registered in the host config
#     + Pencil desktop app installed (install-opencode.mjs fails closed
#     BLOCKED/NEEDS_USER when the desktop is missing);
#   - activation: a live MCP handshake with a foreground-visible desktop app
#     (verify.sh / verify-integration.sh / handshake-check.mjs).
# This script never starts the Pencil desktop and never claims a live
# connection; it only verifies the provisioning surface is in place.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
command -v node >/dev/null 2>&1 || { echo 'Pencil MCP provisioning check requires Node.js.' >&2; exit 1; }
[[ -f "$SCRIPT_DIR/launch.mjs" ]] || { echo 'BLOCKED: Pencil stable launcher missing' >&2; exit 2; }

# Idempotent re-registration: exits 0 when the stable launcher is registered
# and the Pencil desktop is present; exits 2 (BLOCKED/NEEDS_USER) otherwise.
node "$SCRIPT_DIR/install-opencode.mjs" "$SCRIPT_DIR/launch.mjs"