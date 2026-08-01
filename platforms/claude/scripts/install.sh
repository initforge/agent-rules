#!/usr/bin/env bash
# install.sh — Claude Code Tier-A install lifecycle. Real native invocation.
# Usage: install.sh [version]   (version = stable | latest | specific version)
set -uo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "INSTALL FAIL: claude binary not on PATH" >&2
  exit 1
fi

target="${1:-stable}"
out="$(claude install "$target" 2>&1)"
status=$?

if [ "$status" -ne 0 ]; then
  printf 'INSTALL FAIL (exit %s): %s\n' "$status" "$out" >&2
  exit 1
fi
printf 'INSTALL PASS (target=%s)\n%s\n' "$target" "$out"
