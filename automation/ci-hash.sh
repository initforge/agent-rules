#!/usr/bin/env bash
set -euo pipefail
if command -v sha256sum &>/dev/null; then
  sha256sum "$@"
elif command -v shasum &>/dev/null; then
  shasum -a 256 "$@"
else
  echo "ERROR: No SHA-256 tool found (sha256sum or shasum)" >&2
  exit 1
fi
