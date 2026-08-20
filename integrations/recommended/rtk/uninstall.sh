#!/bin/sh
# Uninstall RTK
set -e

if command -v rtk >/dev/null 2>&1; then
  rtk init -g --uninstall 2>/dev/null || true
  echo "RTK hook removed. Binary may still exist at $(which rtk)"
  echo "To fully remove: cargo uninstall rtk or brew uninstall rtk"
else
  echo "RTK not installed"
fi
