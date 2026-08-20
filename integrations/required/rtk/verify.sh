#!/bin/sh
# Verify RTK installation and activity
set -e

if ! command -v rtk >/dev/null 2>&1; then
  echo "FAIL: rtk not found on PATH"
  exit 1
fi

VERSION=$(rtk --version 2>&1)
echo "OK: $VERSION"

# Check if RTK has recorded any savings
if rtk gain --format json >/dev/null 2>&1; then
  echo "OK: RTK analytics available"
else
  echo "WARN: RTK gain not available (may need first use)"
fi
