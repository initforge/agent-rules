#!/usr/bin/env bash
set -euo pipefail

if [[ "${PENCIL_MCP_CONNECTED:-false}" != "true" ]]; then
  echo 'Pencil MCP is not connected: set PENCIL_MCP_CONNECTED=true only after the host reports a live connection.' >&2
  exit 1
fi
if [[ -z "${PENCIL_FILE:-}" || ! -f "$PENCIL_FILE" ]]; then
  echo 'Pencil MCP is missing the requested existing .pen file.' >&2
  exit 1
fi
printf 'Pencil MCP READY: %s\n' "$PENCIL_FILE"
