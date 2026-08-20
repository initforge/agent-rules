#!/usr/bin/env bash
set -euo pipefail
command -v serena >/dev/null 2>&1
serena start-mcp-server --help >/dev/null
