#!/usr/bin/env bash
set -euo pipefail
if command -v realpath &>/dev/null; then
  realpath "$@"
elif command -v grealpath &>/dev/null; then
  grealpath "$@"
else
  readlink -f "$@"
fi
