#!/usr/bin/env bash
# doctor.sh — Claude Code Tier-A doctor lifecycle. Real native probe, no claims beyond output.
set -uo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "DOCTOR FAIL: claude binary not on PATH"
  exit 1
fi

version="$(claude --version 2>&1 || true)"
echo "claude version: $version"

out="$(claude doctor 2>&1)"
status=$?

if [ "$status" -ne 0 ]; then
  printf 'DOCTOR FAIL: claude doctor exited %s\n%s\n' "$status" "$out" >&2
  exit 1
fi
# Healthy only when the host explicitly reports no installation issues.
if ! printf '%s' "$out" | grep -q 'No installation issues found'; then
  printf 'DOCTOR FAIL: doctor did not report a clean install\n%s\n' "$out" >&2
  exit 1
fi
printf 'DOCTOR PASS\n%s\n' "$out"
