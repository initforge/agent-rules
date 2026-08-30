#!/usr/bin/env bash
set -euo pipefail
command -v uv >/dev/null 2>&1 || exit 0
uv tool uninstall serena-agent || true
