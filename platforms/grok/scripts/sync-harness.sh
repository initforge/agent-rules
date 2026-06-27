#!/usr/bin/env bash
# Compatibility wrapper. Canonical script lives at scripts/sync-all-harness.sh.
exec "$(dirname "$0")/sync-all-harness.sh" "$@"
