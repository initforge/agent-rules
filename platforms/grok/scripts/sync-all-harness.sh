#!/usr/bin/env bash
# Compatibility wrapper. Canonical script lives at scripts/sync-all-harness.sh.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
exec "$ROOT/scripts/sync-all-harness.sh" "$@"
